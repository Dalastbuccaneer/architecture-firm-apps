import Dexie, { type Table } from 'dexie';
import type { AppFlags, Contact, Deliverable, LogItem, Note, Project, Task } from './types';
import { DEFAULT_FLAGS } from './types';
import { nowISO } from './lib/dates';

interface KvRow {
  key: string;
  value: unknown;
}

class StudioLogDB extends Dexie {
  projects!: Table<Project, string>;
  deliverables!: Table<Deliverable, string>;
  logItems!: Table<LogItem, string>;
  tasks!: Table<Task, string>;
  notes!: Table<Note, string>;
  contacts!: Table<Contact, string>;
  kv!: Table<KvRow, string>;

  constructor() {
    super('studio-log');
    // NOTE for later agents: tasks.done is a boolean, and booleans are not
    // valid IndexedDB keys — rows never appear in the `done` index, so query
    // tasks with .filter(t => !t.done), never .where('done'). The index slot
    // is kept so a future 0|1 migration doesn't need a schema bump.
    this.version(1).stores({
      projects: 'projectId, status',
      deliverables: 'id, projectId, status',
      logItems: 'id, projectId, type, status, dueDate',
      tasks: 'id, projectId, done, due',
      notes: 'id, projectId, kind, date',
      contacts: 'id, projectId',
      kv: 'key',
    });
  }
}

export const db = new StudioLogDB();

// ---- kv helpers -------------------------------------------------------------

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await db.kv.get(key);
  return row?.value as T | undefined;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await db.kv.put({ key, value });
}

// Well-known keys
export const KV_FLAGS = 'flags';

export async function getFlags(): Promise<AppFlags> {
  return { ...DEFAULT_FLAGS, ...((await kvGet<Partial<AppFlags>>(KV_FLAGS)) ?? {}) };
}

export async function patchFlags(patch: Partial<AppFlags>): Promise<AppFlags> {
  const next = { ...(await getFlags()), ...patch };
  await kvSet(KV_FLAGS, next);
  return next;
}

// ---- project helpers ----------------------------------------------------------

/** Patch a project and stamp updatedAt — ALL project writes should go through
 *  here so "last touched" stays honest for every later screen. */
export async function patchProject(projectId: string, patch: Partial<Project>): Promise<void> {
  await db.projects.update(projectId, { ...patch, updatedAt: nowISO() });
}

/** Delete a project AND everything logged under it, in one transaction —
 *  orphaned deliverables/log items/notes would be invisible forever. */
export async function deleteProjectCascade(projectId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.projects, db.deliverables, db.logItems, db.tasks, db.notes, db.contacts],
    async () => {
      await Promise.all([
        db.projects.delete(projectId),
        db.deliverables.where('projectId').equals(projectId).delete(),
        db.logItems.where('projectId').equals(projectId).delete(),
        db.tasks.where('projectId').equals(projectId).delete(),
        db.notes.where('projectId').equals(projectId).delete(),
        db.contacts.where('projectId').equals(projectId).delete(),
      ]);
    },
  );
}

/** Wipe everything (Settings → erase, and restore-replace). */
export async function resetAll(): Promise<void> {
  await Promise.all([
    db.projects.clear(),
    db.deliverables.clear(),
    db.logItems.clear(),
    db.tasks.clear(),
    db.notes.clear(),
    db.contacts.clear(),
    db.kv.clear(),
  ]);
}
