// The manager-side import engine. Two invariants protect billing history:
// 1. Day-level replace: for every (personId, date) present in an incoming file,
//    existing entries are replaced — never appended. Re-imports and mixed
//    weekly/monthly export cadences always converge, never duplicate.
// 2. Nothing is destroyed silently: every replace stashes the overwritten rows
//    in importUndo so any recent import can be reversed with one click.

import { db, getFirm, setFirm } from '../db';
import type { FirmFile, ImportLogEntry, TimeEntry, TimeExportFile } from '../types';
import { uid, aiaPhases } from './seeds';
import { nowISO } from './dates';
import { ParseError, parseTimeExport } from './serialize';

const UNDO_KEEP = 20;

export interface ImportOutcome {
  importId: string;
  fileName: string;
  ok: boolean;
  message?: string;
  personName?: string;
  entryCount?: number;
  replacedCount?: number;
}

/** Add any projects/phases referenced by an export but unknown locally, flagged
 *  `imported` so the manager can tell them apart from firm-file taxonomy. */
export async function mergeReferencedEntities(ref: TimeExportFile['referencedEntities']): Promise<void> {
  const firm = await getFirm();
  if (!firm) return;
  let changed = false;
  for (const rp of ref?.projects ?? []) {
    let project = firm.projects.find((p) => p.projectId === rp.projectId);
    if (!project) {
      project = {
        projectId: rp.projectId,
        clientName: rp.clientName ?? '',
        projectNumber: '',
        projectName: rp.projectName ?? 'Imported project',
        status: 'active',
        billingMethod: 'fixed_fee',
        fee: null,
        phases: [],
        imported: true,
      };
      firm.projects.push(project);
      changed = true;
    }
    for (const rph of (ref?.phases ?? []).filter((ph) => ph.projectId === rp.projectId)) {
      if (!project.phases.some((ph) => ph.phaseId === rph.phaseId)) {
        project.phases.push({
          phaseId: rph.phaseId,
          name: rph.name ?? 'Imported phase',
          aiaCode: rph.aiaCode ?? '',
          sequence: project.phases.length + 1,
          budgetedHours: null,
          budgetedFee: null,
          billableDefault: true,
          status: 'open',
          imported: true,
        });
        changed = true;
      }
    }
  }
  if (changed) await setFirm(firm);
}

export interface ApplyArgs {
  fileName: string;
  personId: string;
  personName: string;
  entries: TimeEntry[];
  periodStart?: string;
  periodEnd?: string;
}

/** Core replace-with-undo. Also used by the Harvest CSV importer with entries it
 *  normalized itself. All writes happen in one transaction. */
export async function applyEntries(args: ApplyArgs): Promise<ImportOutcome> {
  const { fileName, personId, personName, entries } = args;
  const importId = uid();
  const dates = [...new Set(entries.map((e) => e.date))];
  const sorted = [...dates].sort();
  const periodStart = args.periodStart ?? sorted[0] ?? '';
  const periodEnd = args.periodEnd ?? sorted[sorted.length - 1] ?? '';

  const replacedCount = await db.transaction('rw', [db.entries, db.importLog, db.importUndo], async () => {
    const existing = dates.length
      ? await db.entries.where('[personId+date]').anyOf(dates.map((d) => [personId, d])).toArray()
      : [];
    await db.importUndo.put({
      importId,
      removed: existing,
      addedIds: entries.map((e) => e.id),
      at: nowISO(),
    });
    await db.entries.bulkDelete(existing.map((e) => e.id));
    await db.entries.bulkPut(entries);

    const log: ImportLogEntry = {
      importId,
      fileName,
      personId,
      personName,
      periodStart,
      periodEnd,
      entryCount: entries.length,
      replacedCount: existing.length,
      status: 'ok',
      at: nowISO(),
    };
    await db.importLog.put(log);

    // Trim undo history so the table can't grow unbounded.
    const undoRows = await db.importUndo.orderBy('at').reverse().offset(UNDO_KEEP).toArray();
    if (undoRows.length) await db.importUndo.bulkDelete(undoRows.map((r) => r.importId));
    return existing.length;
  });

  return { importId, fileName, ok: true, personName, entryCount: entries.length, replacedCount };
}

/** Import one Studio Hours JSON export file (already read as text). */
export async function importTimeFileText(fileName: string, text: string): Promise<ImportOutcome> {
  try {
    const parsed = parseTimeExport(text, fileName);
    await mergeReferencedEntities(parsed.referencedEntities);
    // Normalize: trust file-level identity over per-row noise, stamp source.
    const entries: TimeEntry[] = parsed.entries.map((e) => ({
      ...e,
      id: e.id || uid(),
      personId: parsed.personId,
      personName: parsed.personName,
      source: 'import',
    }));
    return await applyEntries({
      fileName,
      personId: parsed.personId,
      personName: parsed.personName,
      entries,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
    });
  } catch (err) {
    const message = err instanceof ParseError ? err.message : `${fileName}: import failed (${String(err)})`;
    await db.importLog.put({
      importId: uid(),
      fileName,
      personId: '',
      personName: '',
      periodStart: '',
      periodEnd: '',
      entryCount: 0,
      replacedCount: 0,
      status: 'error',
      message,
      at: nowISO(),
    });
    return { importId: '', fileName, ok: false, message };
  }
}

/** Import a batch of Files (from drag-drop or a picker). Non-JSON and OS cruft
 *  are skipped; a malformed file fails alone, never the batch. */
export async function importFiles(files: File[]): Promise<ImportOutcome[]> {
  const usable = files.filter((f) => f.name.toLowerCase().endsWith('.json') && !f.name.startsWith('.'));
  const outcomes: ImportOutcome[] = [];
  for (const f of usable) {
    outcomes.push(await importTimeFileText(f.name, await f.text()));
  }
  return outcomes;
}

/** Reverse one import: delete what it added, restore what it overwrote.
 *  Safest on the most recent import — a later import may have re-replaced the
 *  same days, in which case the later state wins on re-undo. */
export async function undoImport(importId: string): Promise<boolean> {
  return db.transaction('rw', [db.entries, db.importLog, db.importUndo], async () => {
    const rec = await db.importUndo.get(importId);
    if (!rec) return false;
    await db.entries.bulkDelete(rec.addedIds);
    await db.entries.bulkPut(rec.removed);
    await db.importUndo.delete(importId);
    const log = await db.importLog.get(importId);
    if (log) await db.importLog.put({ ...log, undone: true });
    return true;
  });
}

/** Ensure a person referenced by an import exists in the firm (e.g. Harvest CSV
 *  with names not in the firm file). Returns the personId to use. */
export async function ensurePerson(name: string): Promise<string> {
  const firm = await getFirm();
  if (!firm) throw new Error('No firm configured');
  const existing = firm.people.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (existing) return existing.personId;
  const person = {
    personId: uid(),
    name: name.trim() || 'Unknown',
    weeklyCapacityHours: firm.firm.defaultWeeklyCapacityHours,
    targetUtilization: { min: 75, max: 85 },
    active: true,
  };
  firm.people.push(person);
  await setFirm(firm);
  return person.personId;
}

/** Ensure a project (by name) exists — used by the Harvest importer. */
export async function ensureProjectByName(
  projectName: string,
  clientName: string,
): Promise<{ projectId: string; firm: FirmFile }> {
  const firm = await getFirm();
  if (!firm) throw new Error('No firm configured');
  const existing = firm.projects.find(
    (p) => p.projectName.trim().toLowerCase() === projectName.trim().toLowerCase(),
  );
  if (existing) return { projectId: existing.projectId, firm };
  const project = {
    projectId: uid(),
    clientName,
    projectNumber: '',
    projectName,
    status: 'active' as const,
    billingMethod: 'fixed_fee' as const,
    fee: null,
    phases: aiaPhases(),
    imported: true,
  };
  firm.projects.push(project);
  await setFirm(firm);
  return { projectId: project.projectId, firm };
}
