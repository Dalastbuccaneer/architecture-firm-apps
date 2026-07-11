// CSV time-report importer with Harvest auto-detect — the switching-cost killer.
// A Harvest refugee drops their "Detailed time report" export and it just works,
// and the same code path handles our own CSV export and hand-made files.
//
// Columns are matched BY NAME (case-insensitive), never by position: real firms
// export different subsets/order of Harvest columns. Rows are validated, invalid
// ones skipped-but-counted, and the survivors are grouped by person so the
// engine's day-level replace-with-undo semantics apply per person.

import { parseCsv } from './csv';
import { applyEntries, ensurePerson, ensureProjectByName } from './importEngine';
import type { ImportOutcome } from './importEngine';
import { getFirm, setFirm } from '../db';
import { uid } from './seeds';
import { nowISO, toISODate } from './dates';
import { SCHEMA_VERSION } from '../types';
import type { Phase, TimeEntry } from '../types';

// ---- detection --------------------------------------------------------------

/** True if this CSV header shape looks like a Harvest time report export.
 *  Requires date + project + task + hours; client/notes strengthen the guess
 *  but real exports drop them, so they aren't required. */
export function looksLikeHarvest(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim().toLowerCase().replace(/^\uFEFF/, '')));
  return set.has('date') && set.has('project') && set.has('task') && set.has('hours');
}

// ---- value parsing ----------------------------------------------------------

function parseBool(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (['yes', 'y', 'true', 't', '1', 'billable', 'x'].includes(s)) return true;
  if (['no', 'n', 'false', 'f', '0', 'non-billable', 'nonbillable', 'unbillable'].includes(s)) return false;
  return null;
}

/** Decimal hours ('7.5', tolerant of a comma decimal) or 'H:MM[:SS]'. */
function parseHours(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const hm = s.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (hm) {
    const val = Number(hm[1]) + Number(hm[2]) / 60 + (hm[3] ? Number(hm[3]) : 0) / 3600;
    return val > 0 ? val : null;
  }
  let n = Number(s);
  if (!Number.isFinite(n) && /^\d+,\d+$/.test(s)) n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isoFromParts(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  // reject overflow (e.g. Feb 31 -> Mar 3)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return toISODate(dt);
}

/** Accept YYYY-MM-DD, then MM/DD/YYYY (Harvest US default). A slash date whose
 *  first segment is >12 is unambiguously DD/MM; `dayFirst` (detected file-wide)
 *  flips ambiguous slash dates to DD/MM. Falls back to Date.parse, normalizing
 *  to a local-date ISO string. */
function parseDate(raw: string, dayFirst: boolean): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const sl = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (sl) {
    const a = Number(sl[1]);
    const b = Number(sl[2]);
    let y = Number(sl[3]);
    if (y < 100) y += 2000;
    let mo: number;
    let d: number;
    if (a > 12 && b <= 12) {
      d = a;
      mo = b; // unambiguous DD/MM
    } else if (dayFirst && b <= 12) {
      d = a;
      mo = b; // file detected as day-first
    } else {
      mo = a;
      d = b; // MM/DD
    }
    return isoFromParts(y, mo, d);
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return toISODate(new Date(t));
  return null;
}

/** File-level heuristic: if any slash date has a first segment >12 (with a valid
 *  second segment), the whole file is day-first (DD/MM). */
function detectDayFirst(rawDates: string[]): boolean {
  for (const s of rawDates) {
    const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/\d{2,4}$/);
    if (m && Number(m[1]) > 12 && Number(m[2]) <= 12) return true;
  }
  return false;
}

/** Match a raw task/phase string against a firm phase by name OR AIA code —
 *  case-insensitive, and tolerant of 'Construction Documents (CD)' style. */
function phaseMatches(phase: Phase, rawLower: string): boolean {
  const nameLower = phase.name.trim().toLowerCase();
  const codeLower = phase.aiaCode.trim().toLowerCase();
  if (rawLower === nameLower) return true;
  if (codeLower && rawLower === codeLower) return true;
  const nameOnly = rawLower.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (nameOnly && nameOnly === nameLower) return true;
  const paren = rawLower.match(/\(([^)]+)\)/);
  if (paren && codeLower && paren[1].trim() === codeLower) return true;
  return false;
}

type PhaseRes = { phaseId: string | null; phaseName: string | null; billableDefault: boolean };

// ---- import -----------------------------------------------------------------

/** Import a CSV file (Harvest export or generic). One outcome per person found,
 *  plus a trailing ok:false outcome if any rows were skipped. */
export async function importCsvFile(file: File): Promise<ImportOutcome[]> {
  const text = (await file.text()).replace(/^\uFEFF/, '');
  const fileName = `${file.name} (CSV)`;
  const { headers, rows } = parseCsv(text);
  if (!rows.length) {
    return [{ importId: '', fileName, ok: false, message: 'No data rows found in CSV' }];
  }

  const firm0 = await getFirm();
  if (!firm0) {
    return [{ importId: '', fileName, ok: false, message: 'No firm configured — set up the firm before importing.' }];
  }
  const activities = firm0.activities;

  const present = new Set(headers.map((h) => h.trim().toLowerCase()));
  const col = (...cands: string[]): string | undefined => cands.find((c) => present.has(c));

  const dateCol = col('date', 'spent date');
  const clientCol = col('client');
  const projectCol = col('project', 'project name');
  const phaseCol = col('task', 'phase');
  const activityCol = col('activity');
  const hoursCol = col('hours', 'rounded hours');
  const notesCol = col('notes', 'note', 'description');
  const billableCol = col('billable?', 'billable');
  const employeeCol = col('employee', 'employee name', 'person');
  const firstCol = col('first name', 'first');
  const lastCol = col('last name', 'last');
  const outCol = col('outofscope', 'out of scope', 'out-of-scope');
  const reqCol = col('requestedby', 'requested by');

  // file-wide date-format detection
  const rawDates: string[] = [];
  if (dateCol) for (const r of rows) rawDates.push(r[dateCol] ?? '');
  const dayFirst = detectDayFirst(rawDates);

  // ---- per-row resolvers (capture the resolved columns) ----
  const resolvePersonName = (rec: Record<string, string>): string => {
    if (employeeCol) {
      const v = (rec[employeeCol] ?? '').trim();
      if (v) return v;
    }
    const f = firstCol ? (rec[firstCol] ?? '').trim() : '';
    const l = lastCol ? (rec[lastCol] ?? '').trim() : '';
    const full = [f, l].filter(Boolean).join(' ').trim();
    return full || 'Imported';
  };

  const resolveActivity = (rec: Record<string, string>): { activityId: string | null; activityName: string | null } => {
    if (!activityCol) return { activityId: null, activityName: null };
    const raw = (rec[activityCol] ?? '').trim();
    if (!raw) return { activityId: null, activityName: null };
    const match = activities.find((a) => a.name.trim().toLowerCase() === raw.toLowerCase());
    if (match) return { activityId: match.activityId, activityName: match.name };
    return { activityId: null, activityName: raw };
  };

  const phaseCache = new Map<string, PhaseRes>();
  const resolvePhase = async (projectId: string, raw: string): Promise<PhaseRes> => {
    const rawTrim = raw.trim();
    const rawLower = rawTrim.toLowerCase();
    const key = `${projectId}::${rawLower}`;
    const hit = phaseCache.get(key);
    if (hit) return hit;

    if (!rawTrim) {
      const res: PhaseRes = { phaseId: null, phaseName: null, billableDefault: true };
      phaseCache.set(key, res);
      return res;
    }

    const firm = await getFirm();
    const project = firm?.projects.find((p) => p.projectId === projectId);
    if (!firm || !project) {
      const res: PhaseRes = { phaseId: null, phaseName: rawTrim, billableDefault: true };
      phaseCache.set(key, res);
      return res;
    }

    const match = project.phases.find((ph) => phaseMatches(ph, rawLower));
    let res: PhaseRes;
    if (match) {
      res = { phaseId: match.phaseId, phaseName: match.name, billableDefault: match.billableDefault };
    } else {
      // Create the phase on the project so burn tracking can attach later; reused
      // on subsequent rows via the cache.
      const newPhase: Phase = {
        phaseId: uid(),
        name: rawTrim,
        aiaCode: '',
        sequence: project.phases.length + 1,
        budgetedHours: null,
        budgetedFee: null,
        billableDefault: true,
        status: 'open',
        imported: true,
      };
      project.phases.push(newPhase);
      await setFirm(firm);
      res = { phaseId: newPhase.phaseId, phaseName: newPhase.name, billableDefault: true };
    }
    phaseCache.set(key, res);
    return res;
  };

  // ---- main pass ----
  type Group = { personName: string; entries: TimeEntry[] };
  const groups = new Map<string, Group>();
  const personCache = new Map<string, string>();
  const projectCache = new Map<string, string>();
  let skipped = 0;

  for (const rec of rows) {
    const rawDate = dateCol ? (rec[dateCol] ?? '') : '';
    const rawHours = hoursCol ? (rec[hoursCol] ?? '') : '';
    const projectName = projectCol ? (rec[projectCol] ?? '').trim() : '';

    const date = parseDate(rawDate, dayFirst);
    const hours = parseHours(rawHours);
    if (!date || hours === null || !projectName) {
      skipped++;
      continue;
    }

    // person
    const name = resolvePersonName(rec);
    const pkeyName = name.toLowerCase();
    let personId = personCache.get(pkeyName);
    if (!personId) {
      personId = await ensurePerson(name);
      personCache.set(pkeyName, personId);
    }

    // project (auto-creates with AIA phases, flagged imported)
    const client = clientCol ? (rec[clientCol] ?? '').trim() : '';
    const pkeyProj = projectName.toLowerCase();
    let projectId = projectCache.get(pkeyProj);
    if (!projectId) {
      projectId = (await ensureProjectByName(projectName, client)).projectId;
      projectCache.set(pkeyProj, projectId);
    }

    // phase + activity
    const rawPhase = phaseCol ? (rec[phaseCol] ?? '').trim() : '';
    const phase = await resolvePhase(projectId, rawPhase);
    const activity = resolveActivity(rec);

    // billable: default true unless the column says No or the phase is non-billable
    let billable = true;
    if (billableCol && parseBool(rec[billableCol] ?? '') === false) billable = false;
    if (phase.billableDefault === false) billable = false;

    // outOfScope: false unless the column is truthy
    let outOfScope = false;
    if (outCol) {
      const v = (rec[outCol] ?? '').trim();
      const b = parseBool(v);
      if (b === true) outOfScope = true;
      else if (b === null && v !== '') outOfScope = true;
    }

    const requestedBy = reqCol ? (rec[reqCol] ?? '').trim() || null : null;
    const notes = notesCol ? (rec[notesCol] ?? '').trim() || null : null;

    const now = nowISO();
    const entry: TimeEntry = {
      id: uid(),
      schemaVersion: SCHEMA_VERSION,
      personId,
      personName: name,
      date,
      projectId,
      projectName,
      phaseId: phase.phaseId,
      phaseName: phase.phaseName,
      activityId: activity.activityId,
      activityName: activity.activityName,
      hours,
      billable,
      outOfScope,
      requestedBy,
      notes,
      source: 'import',
      createdAt: now,
      updatedAt: now,
    };

    let group = groups.get(personId);
    if (!group) {
      group = { personName: name, entries: [] };
      groups.set(personId, group);
    }
    group.entries.push(entry);
  }

  // ---- one applyEntries per person, then surface skips ----
  const outcomes: ImportOutcome[] = [];
  for (const [personId, group] of groups) {
    outcomes.push(
      await applyEntries({
        fileName,
        personId,
        personName: group.personName,
        entries: group.entries,
      }),
    );
  }
  if (skipped > 0) {
    outcomes.push({
      importId: '',
      fileName,
      ok: false,
      message: `${skipped} ${skipped === 1 ? 'row' : 'rows'} skipped (missing date/hours/project)`,
    });
  }
  if (!outcomes.length) {
    outcomes.push({ importId: '', fileName, ok: false, message: 'No valid rows to import' });
  }
  return outcomes;
}
