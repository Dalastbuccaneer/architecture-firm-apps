// StudioCRM — Dexie (IndexedDB) database plus the small set of write helpers
// every screen goes through. DB name `studio-crm`, origin-local like the rest
// of the suite: no server, no sync — backup and the clients-for-studio export
// are the only ways data ever leaves this browser.

import Dexie, { type Table } from 'dexie';
import type { AppFlags, Client, Contact, Interaction, Lead, LeadStage, Reminder } from './types';
import { DEFAULT_FLAGS, SCHEMA_VERSION } from './types';
import { nowISO } from './lib/dates';
import { uid } from './lib/ids';

interface KvRow {
  key: string;
  value: unknown;
}

class StudioCRMDB extends Dexie {
  clients!: Table<Client, string>;
  contacts!: Table<Contact, string>;
  leads!: Table<Lead, string>;
  interactions!: Table<Interaction, string>;
  reminders!: Table<Reminder, string>;
  kv!: Table<KvRow, string>;

  constructor() {
    super('studio-crm');
    // NOTE for later agents: reminders.done is a boolean, and booleans are not
    // valid IndexedDB keys — rows never appear in the `done` index, so query
    // reminders with .filter(r => !r.done), never .where('done'). The index
    // slot is kept so a future 0|1 migration doesn't need a schema bump.
    this.version(1).stores({
      clients: 'id, name',
      contacts: 'id, clientId, introducedBy',
      leads: 'id, clientId, stage, submissionDeadline, decisionDate',
      interactions: 'id, clientId, contactId, leadId, date',
      reminders: 'id, clientId, leadId, dueDate, done',
      kv: 'key',
    });
  }
}

export const db = new StudioCRMDB();

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

// ---- client helpers -----------------------------------------------------------

/** Patch a client and stamp updatedAt — ALL client writes should go through
 *  here so "last touched" stays honest for every later screen. */
export async function patchClient(clientId: string, patch: Partial<Client>): Promise<void> {
  await db.clients.update(clientId, { ...patch, updatedAt: nowISO() });
}

// ---- lead helpers ---------------------------------------------------------------

/** Patch a lead and stamp updatedAt. For STAGE changes use patchLeadStage
 *  instead — it's the only place stageChangedAt gets stamped. */
export async function patchLead(leadId: string, patch: Partial<Lead>): Promise<void> {
  await db.leads.update(leadId, { ...patch, updatedAt: nowISO() });
}

export interface PatchLeadStageOpts {
  /** WHY the lead was won or lost. The UI must supply this when `stage` is
   *  'won' or 'lost' (win reasons feed fee strategy too, not just losses);
   *  the DB deliberately doesn't enforce it so old data never breaks. */
  outcomeReason?: string;
}

/** The single place stage changes happen — stamps stageChangedAt (and
 *  updatedAt) so Reports' "time from lead to award" math stays honest. */
export async function patchLeadStage(
  leadId: string,
  stage: LeadStage,
  opts: PatchLeadStageOpts = {},
): Promise<void> {
  const now = nowISO();
  const patch: Partial<Lead> = { stage, stageChangedAt: now, updatedAt: now };
  if (opts.outcomeReason !== undefined) patch.outcomeReason = opts.outcomeReason;
  await db.leads.update(leadId, patch);
}

// ---- interaction helpers -----------------------------------------------------------

/** Interaction fields the caller supplies — id/schemaVersion/timestamps are
 *  stamped by logInteraction. */
export type NewInteraction = Omit<Interaction, 'schemaVersion' | 'id' | 'createdAt' | 'updatedAt'>;

export interface LogInteractionOpts {
  /** when true AND data.followUpDate is set, also write a linked Reminder */
  createFollowUp?: boolean;
  /** label for that reminder — defaults to "Follow up: <summary>" */
  followUpLabel?: string;
}

/** Write an Interaction and, optionally, its follow-up Reminder in ONE call
 *  (one transaction when both rows are written). This is the suite's existing
 *  style — multi-table work done explicitly in one async handler, never a
 *  DB-level trigger. Returns the new ids so callers can link or navigate. */
export async function logInteraction(
  data: NewInteraction,
  opts: LogInteractionOpts = {},
): Promise<{ interactionId: string; reminderId?: string }> {
  const now = nowISO();
  const interaction: Interaction = {
    ...data,
    schemaVersion: SCHEMA_VERSION,
    id: uid(),
    createdAt: now,
    updatedAt: now,
  };

  if (!(opts.createFollowUp && data.followUpDate)) {
    await db.interactions.put(interaction);
    return { interactionId: interaction.id };
  }

  const reminder: Reminder = {
    schemaVersion: SCHEMA_VERSION,
    id: uid(),
    clientId: data.clientId,
    leadId: data.leadId,
    label: opts.followUpLabel?.trim() || `Follow up: ${data.summary}`,
    dueDate: data.followUpDate,
    reminderDays: 0,
    done: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction('rw', [db.interactions, db.reminders], async () => {
    await Promise.all([db.interactions.put(interaction), db.reminders.put(reminder)]);
  });
  return { interactionId: interaction.id, reminderId: reminder.id };
}

// ---- cascade / reset ------------------------------------------------------------------

/** Delete a client AND everything logged under it — contacts, leads,
 *  interactions, reminders — in one transaction. Orphaned rows would be
 *  invisible forever, since every screen reaches them through the client. */
export async function deleteClientCascade(clientId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.clients, db.contacts, db.leads, db.interactions, db.reminders],
    async () => {
      await Promise.all([
        db.clients.delete(clientId),
        db.contacts.where('clientId').equals(clientId).delete(),
        db.leads.where('clientId').equals(clientId).delete(),
        db.interactions.where('clientId').equals(clientId).delete(),
        db.reminders.where('clientId').equals(clientId).delete(),
      ]);
    },
  );
}

/** Wipe everything (Settings → erase, and restore-replace). */
export async function resetAll(): Promise<void> {
  await Promise.all([
    db.clients.clear(),
    db.contacts.clear(),
    db.leads.clear(),
    db.interactions.clear(),
    db.reminders.clear(),
    db.kv.clear(),
  ]);
}
