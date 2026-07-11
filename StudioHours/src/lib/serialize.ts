import type { FirmFile, TimeEntry, TimeExportFile } from '../types';
import { SCHEMA_VERSION } from '../types';
import { isoWeekLabel, nowISO } from './dates';

// ---- time export ------------------------------------------------------------

export function buildTimeExport(
  firm: FirmFile,
  personId: string,
  entries: TimeEntry[],
  periodStart: string,
  periodEnd: string,
): TimeExportFile {
  const person = firm.people.find((p) => p.personId === personId);
  const projectIds = new Set(entries.map((e) => e.projectId));
  const projects = firm.projects.filter((p) => projectIds.has(p.projectId));
  return {
    schemaVersion: SCHEMA_VERSION,
    exportType: 'time-entries',
    exportedAt: nowISO(),
    personId,
    personName: person?.name ?? entries[0]?.personName ?? 'Unknown',
    firmName: firm.firm.firmName,
    periodStart,
    periodEnd,
    referencedEntities: {
      projects: projects.map((p) => ({
        projectId: p.projectId,
        projectName: p.projectName,
        clientName: p.clientName,
      })),
      phases: projects.flatMap((p) =>
        p.phases.map((ph) => ({
          phaseId: ph.phaseId,
          projectId: p.projectId,
          name: ph.name,
          aiaCode: ph.aiaCode,
        })),
      ),
    },
    entries,
  };
}

export class ParseError extends Error {}

export function parseTimeExport(text: string, fileName: string): TimeExportFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ParseError(`${fileName}: not valid JSON`);
  }
  const f = data as Partial<TimeExportFile>;
  if (f.exportType !== 'time-entries') {
    throw new ParseError(`${fileName}: not a Studio Hours time export (exportType missing)`);
  }
  if (typeof f.schemaVersion !== 'number' || f.schemaVersion > SCHEMA_VERSION) {
    throw new ParseError(`${fileName}: made by a newer version of Studio Hours — update this app first`);
  }
  if (!f.personId || !Array.isArray(f.entries)) {
    throw new ParseError(`${fileName}: missing personId or entries`);
  }
  for (const e of f.entries) {
    if (!e.date || typeof e.hours !== 'number' || !e.projectId) {
      throw new ParseError(`${fileName}: entry missing date/hours/project`);
    }
  }
  return f as TimeExportFile;
}

/** THE firm-file export — the JSON every employee imports onto their device.
 *  It is exactly the firm blob (kv 'firm') plus a timestamp, and nothing else.
 *
 *  ⚠️ CONFIDENTIALITY CONTRACT: this file must NEVER contain salary / HR /
 *  payroll / renewals data. All of that lives in separate Dexie tables and
 *  separate kv keys that this function cannot see — it takes only the FirmFile.
 *  Every firm-file export in the app MUST go through this function, and
 *  test-people.mjs asserts its output stays clean even when the database is
 *  full of HR data. Do not add parameters that widen what it can reach. */
export function buildFirmFileExport(firm: FirmFile): string {
  return JSON.stringify({ ...firm, exportedAt: nowISO() }, null, 2);
}

export function parseFirmFile(text: string, fileName: string): FirmFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ParseError(`${fileName}: not valid JSON`);
  }
  const f = data as Partial<FirmFile>;
  if (f.exportType !== 'firm' || !f.firm || !Array.isArray(f.people)) {
    throw new ParseError(`${fileName}: not a Studio Hours firm file`);
  }
  if (typeof f.schemaVersion !== 'number' || f.schemaVersion > SCHEMA_VERSION) {
    throw new ParseError(`${fileName}: made by a newer version of Studio Hours — update this app first`);
  }
  return f as FirmFile;
}

// ---- CSV --------------------------------------------------------------------

export const CSV_COLUMNS = [
  'Date', 'Client', 'Project', 'Phase', 'Activity', 'Hours',
  'Billable', 'OutOfScope', 'RequestedBy', 'Notes', 'Employee',
] as const;

function csvCell(v: string | number | boolean | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function entriesToCsv(entries: TimeEntry[], firm: FirmFile | null): string {
  const clientOf = new Map((firm?.projects ?? []).map((p) => [p.projectId, p.clientName]));
  const rows = entries.map((e) =>
    [
      e.date,
      clientOf.get(e.projectId) ?? '',
      e.projectName,
      e.phaseName ?? '',
      e.activityName ?? '',
      e.hours,
      e.billable ? 'Yes' : 'No',
      e.outOfScope ? 'Yes' : 'No',
      e.requestedBy ?? '',
      e.notes ?? '',
      e.personName,
    ].map(csvCell).join(','),
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n');
}

// ---- filenames --------------------------------------------------------------

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
}

/** e.g. "acme-architects_priya-raman_2026-W27.json" */
export function exportFilename(firmName: string, personName: string, weekStart: string, ext: 'json' | 'csv'): string {
  return `${slug(firmName)}_${slug(personName)}_${isoWeekLabel(weekStart)}.${ext}`;
}

export function firmFilename(firmName: string): string {
  return `${slug(firmName)}_studio-hours-firm.json`;
}
