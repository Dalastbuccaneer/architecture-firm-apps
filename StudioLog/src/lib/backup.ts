// Full-app backup / restore — the escape hatch for a zero-backend app. The
// backup covers ALL seven tables (projects, deliverables, logItems, tasks,
// notes, contacts, kv), so "back up now" + "restore" is enough to move
// computers even after later agents fill the other screens with data.
// Ported from StudioHours and retargeted.

import { db, resetAll } from '../db';
import type { Contact, Deliverable, LogItem, Note, Project, Task } from '../types';
import { SCHEMA_VERSION } from '../types';
import { nowISO, todayISO } from './dates';
import { ParseError, parseJsonFile } from './serialize';

interface KvEntry {
  key: string;
  value: unknown;
}

export interface BackupFile {
  schemaVersion: number;
  exportType: 'studio-log-backup';
  exportedAt: string;
  projects: Project[];
  deliverables: Deliverable[];
  logItems: LogItem[];
  tasks: Task[];
  notes: Note[];
  contacts: Contact[];
  /** local flags etc. — restored wholesale on replace, left alone on merge */
  kv: KvEntry[];
}

export interface RestoreResult {
  projectCount: number;
}

export async function buildBackup(): Promise<{ fileName: string; content: string }> {
  const backup: BackupFile = {
    schemaVersion: SCHEMA_VERSION,
    exportType: 'studio-log-backup',
    exportedAt: nowISO(),
    projects: await db.projects.toArray(),
    deliverables: await db.deliverables.toArray(),
    logItems: await db.logItems.toArray(),
    tasks: await db.tasks.toArray(),
    notes: await db.notes.toArray(),
    contacts: await db.contacts.toArray(),
    kv: await db.kv.toArray(),
  };
  return {
    fileName: `studio-log-backup-${todayISO()}.json`,
    content: JSON.stringify(backup, null, 2),
  };
}

/** Parse + apply a backup file. Throws ParseError with a readable message on
 *  anything that isn't a StudioLog backup this version understands. */
export async function restoreBackup(text: string, mode: 'replace' | 'merge'): Promise<RestoreResult> {
  const data = parseJsonFile(text, 'backup');
  const b = data as Partial<BackupFile>;
  if (b.exportType !== 'studio-log-backup') {
    throw new ParseError('Not a StudioLog backup file. (StudioHours backups are a different format — this app cannot read them.)');
  }
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion > SCHEMA_VERSION) {
    throw new ParseError('This backup was made by a newer version of StudioLog — update this app first.');
  }
  if (!Array.isArray(b.projects)) {
    throw new ParseError('This backup file is missing its projects.');
  }

  const projects = b.projects as Project[];
  const deliverables = Array.isArray(b.deliverables) ? (b.deliverables as Deliverable[]) : [];
  const logItems = Array.isArray(b.logItems) ? (b.logItems as LogItem[]) : [];
  const tasks = Array.isArray(b.tasks) ? (b.tasks as Task[]) : [];
  const notes = Array.isArray(b.notes) ? (b.notes as Note[]) : [];
  const contacts = Array.isArray(b.contacts) ? (b.contacts as Contact[]) : [];
  const kv = Array.isArray(b.kv) ? (b.kv as KvEntry[]) : [];

  await db.transaction(
    'rw',
    [db.projects, db.deliverables, db.logItems, db.tasks, db.notes, db.contacts, db.kv],
    async () => {
      if (mode === 'replace') {
        await resetAll();
        if (kv.length) await db.kv.bulkPut(kv);
      }
      // Merge: rows are id-keyed, so overlaps overwrite in place; local kv
      // (flags like "last backup") is deliberately left alone on merge.
      if (projects.length) await db.projects.bulkPut(projects);
      if (deliverables.length) await db.deliverables.bulkPut(deliverables);
      if (logItems.length) await db.logItems.bulkPut(logItems);
      if (tasks.length) await db.tasks.bulkPut(tasks);
      if (notes.length) await db.notes.bulkPut(notes);
      if (contacts.length) await db.contacts.bulkPut(contacts);
    },
  );

  return { projectCount: projects.length };
}
