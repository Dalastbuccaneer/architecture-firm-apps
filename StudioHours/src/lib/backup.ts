// Full-app backup / restore — the escape hatch for a zero-backend app. A backup
// is a superset of a Firm File: it also carries this install's own time entries
// and local flags, so "back up now" + "restore" is enough to move computers.
//
// Unlike the firm file, a backup is the MANAGER'S OWN file — it deliberately
// includes the confidential people-operations tables (hr / payrollRuns /
// renewals / expenses) and the end-of-service rule. It is never shared with
// staff; the firm file (lib/serialize.ts) is the shareable artifact and carries
// none of this.

import { db, getFirm, getFlags, kvGet, kvSet, patchFlags, resetAll, setFirm, KV_EOSB_RULE, KV_FLAGS } from '../db';
import type { AppFlags, EosbRule, Expense, FirmFile, HrRecord, Invoice, PayrollRun, Renewal, TimeEntry } from '../types';
import { SCHEMA_VERSION } from '../types';
import { nowISO, todayISO } from './dates';

export interface BackupFile {
  schemaVersion: number;
  exportType: 'backup';
  exportedAt: string;
  firm: FirmFile | null;
  flags: AppFlags;
  entries: TimeEntry[];
  /** optional — absent on backups made before invoicing existed */
  invoices?: Invoice[];
  /** optional — absent on backups made before people operations existed */
  expenses?: Expense[];
  hr?: HrRecord[];
  payrollRuns?: PayrollRun[];
  renewals?: Renewal[];
  /** the end-of-service rule kv (null = never customized, preset applies) */
  eosbRule?: EosbRule | null;
}

export interface RestoreResult {
  entryCount: number;
}

export async function buildBackup(): Promise<{ fileName: string; content: string }> {
  const backup: BackupFile = {
    schemaVersion: SCHEMA_VERSION,
    exportType: 'backup',
    exportedAt: nowISO(),
    firm: (await getFirm()) ?? null,
    flags: await getFlags(),
    entries: await db.entries.toArray(),
    invoices: await db.invoices.toArray(),
    expenses: await db.expenses.toArray(),
    hr: await db.hr.toArray(),
    payrollRuns: await db.payrollRuns.toArray(),
    renewals: await db.renewals.toArray(),
    eosbRule: (await kvGet<EosbRule>(KV_EOSB_RULE)) ?? null,
  };
  return {
    fileName: `studio-hours-backup-${todayISO()}.json`,
    content: JSON.stringify(backup, null, 2),
  };
}

/** Old backups predate the optional arrays — treat a missing one as empty. */
function arr<T>(v: T[] | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

/** Parse + apply a backup file. Throws a plain Error with a readable message on
 *  anything that isn't a Studio Hours backup this version understands. */
export async function restoreBackup(text: string, mode: 'replace' | 'merge'): Promise<RestoreResult> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const b = data as Partial<BackupFile>;
  if (b.exportType !== 'backup') {
    throw new Error('Not a Studio Hours backup file (exportType missing).');
  }
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion > SCHEMA_VERSION) {
    throw new Error('This backup was made by a newer version of Studio Hours — update this app first.');
  }
  if (!Array.isArray(b.entries)) {
    throw new Error('This backup file is missing its time entries.');
  }

  const firm = b.firm ?? null;
  const entries = b.entries as TimeEntry[];
  const invoices = arr(b.invoices as Invoice[] | undefined);
  const expenses = arr(b.expenses as Expense[] | undefined);
  const hr = arr(b.hr as HrRecord[] | undefined);
  const payrollRuns = arr(b.payrollRuns as PayrollRun[] | undefined);
  const renewals = arr(b.renewals as Renewal[] | undefined);

  if (mode === 'replace') {
    await resetAll();
    if (firm) await setFirm(firm);
    if (b.flags) await kvSet(KV_FLAGS, b.flags);
  } else if (firm) {
    // Merge: firm file is canonical anyway, so the incoming one wins; every
    // table below is id-keyed so overlaps overwrite in place. Local flags are
    // left alone.
    await setFirm(firm);
  }

  if (entries.length) await db.entries.bulkPut(entries);
  if (invoices.length) await db.invoices.bulkPut(invoices);
  if (expenses.length) await db.expenses.bulkPut(expenses);
  if (hr.length) await db.hr.bulkPut(hr);
  if (payrollRuns.length) await db.payrollRuns.bulkPut(payrollRuns);
  if (renewals.length) await db.renewals.bulkPut(renewals);
  // The end-of-service rule only travels when the backup actually carries one —
  // merging an old backup must not wipe a rule this install already customized.
  if (b.eosbRule) await kvSet(KV_EOSB_RULE, b.eosbRule);

  // Whichever mode ran, make sure "me" still points at someone who exists, and
  // keep the invoice counter ahead of every invoice now on disk so a future
  // "New invoice" can never mint a number that already exists.
  const current = await getFlags();
  const meStillExists = !!firm && firm.people.some((p) => p.personId === current.meId);
  const allInvoices = await db.invoices.toArray();
  const maxSeq = Math.max(
    current.invoiceSeq ?? 0,
    ...allInvoices.map((i) => Number(/^INV-(\d+)$/.exec(i.invoiceNumber)?.[1] ?? 0)),
  );
  await patchFlags({ meId: meStillExists ? current.meId : null, invoiceSeq: maxSeq });

  return { entryCount: entries.length };
}
