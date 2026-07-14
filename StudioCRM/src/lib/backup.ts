// Full-app backup / restore — the escape hatch for a zero-backend app. The
// backup covers ALL six tables (clients, contacts, leads, interactions,
// reminders, kv), so "back up now" + "restore" is enough to move computers
// even after later agents fill the other screens with data.
// Ported from StudioLog and retargeted.

import { db, resetAll } from '../db';
import type { Client, Contact, Interaction, Lead, Reminder } from '../types';
import { SCHEMA_VERSION } from '../types';
import { nowISO, todayISO } from './dates';
import { ParseError, parseJsonFile } from './serialize';

interface KvEntry {
  key: string;
  value: unknown;
}

export interface BackupFile {
  schemaVersion: number;
  exportType: 'studio-crm-backup';
  exportedAt: string;
  clients: Client[];
  contacts: Contact[];
  leads: Lead[];
  interactions: Interaction[];
  reminders: Reminder[];
  /** local flags etc. — restored wholesale on replace, left alone on merge */
  kv: KvEntry[];
}

export interface RestoreResult {
  clientCount: number;
}

export async function buildBackup(): Promise<{ fileName: string; content: string }> {
  const backup: BackupFile = {
    schemaVersion: SCHEMA_VERSION,
    exportType: 'studio-crm-backup',
    exportedAt: nowISO(),
    clients: await db.clients.toArray(),
    contacts: await db.contacts.toArray(),
    leads: await db.leads.toArray(),
    interactions: await db.interactions.toArray(),
    reminders: await db.reminders.toArray(),
    kv: await db.kv.toArray(),
  };
  return {
    fileName: `studio-crm-backup-${todayISO()}.json`,
    content: JSON.stringify(backup, null, 2),
  };
}

/** Parse + apply a backup file. Throws ParseError with a readable message on
 *  anything that isn't a StudioCRM backup this version understands. */
export async function restoreBackup(text: string, mode: 'replace' | 'merge'): Promise<RestoreResult> {
  const data = parseJsonFile(text, 'backup');
  const b = data as Partial<BackupFile>;
  if (b.exportType !== 'studio-crm-backup') {
    throw new ParseError('Not a StudioCRM backup file. (StudioLog/StudioHours backups are a different format - this app cannot read them.)');
  }
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion > SCHEMA_VERSION) {
    throw new ParseError('This backup was made by a newer version of StudioCRM — update this app first.');
  }
  if (!Array.isArray(b.clients)) {
    throw new ParseError('This backup file is missing its clients.');
  }

  const clients = b.clients as Client[];
  const contacts = Array.isArray(b.contacts) ? (b.contacts as Contact[]) : [];
  const leads = Array.isArray(b.leads) ? (b.leads as Lead[]) : [];
  const interactions = Array.isArray(b.interactions) ? (b.interactions as Interaction[]) : [];
  const reminders = Array.isArray(b.reminders) ? (b.reminders as Reminder[]) : [];
  const kv = Array.isArray(b.kv) ? (b.kv as KvEntry[]) : [];

  await db.transaction(
    'rw',
    [db.clients, db.contacts, db.leads, db.interactions, db.reminders, db.kv],
    async () => {
      if (mode === 'replace') {
        await resetAll();
        if (kv.length) await db.kv.bulkPut(kv);
      }
      // Merge: rows are id-keyed, so overlaps overwrite in place; local kv
      // (flags like "last backup") is deliberately left alone on merge.
      if (clients.length) await db.clients.bulkPut(clients);
      if (contacts.length) await db.contacts.bulkPut(contacts);
      if (leads.length) await db.leads.bulkPut(leads);
      if (interactions.length) await db.interactions.bulkPut(interactions);
      if (reminders.length) await db.reminders.bulkPut(reminders);
    },
  );

  return { clientCount: clients.length };
}
