import Dexie, { type Table } from 'dexie';
import type {
  AppFlags,
  Expense,
  FirmFile,
  HrRecord,
  ImportLogEntry,
  ImportUndoRecord,
  Invoice,
  PayrollRun,
  Renewal,
  TimeEntry,
} from './types';
import { DEFAULT_FLAGS } from './types';

interface KvRow {
  key: string;
  value: unknown;
}

class StudioHoursDB extends Dexie {
  entries!: Table<TimeEntry, string>;
  kv!: Table<KvRow, string>;
  importLog!: Table<ImportLogEntry, string>;
  importUndo!: Table<ImportUndoRecord, string>;
  invoices!: Table<Invoice, string>;
  expenses!: Table<Expense, string>;
  hr!: Table<HrRecord, string>;
  payrollRuns!: Table<PayrollRun, string>;
  renewals!: Table<Renewal, string>;

  constructor() {
    super('studio-hours');
    this.version(1).stores({
      entries: 'id, date, projectId, [personId+date], [projectId+phaseId], personId',
      kv: 'key',
      importLog: 'importId, at, personId',
      importUndo: 'importId, at',
    });
    // v2 adds the local invoice register. Purely additive — Dexie carries every
    // existing table forward untouched, so no data migration is needed.
    this.version(2).stores({
      invoices: 'invoiceId, projectId, issueDate, status',
    });
    // v3 adds people operations (hr / payrollRuns / renewals) and the expenses
    // register in ONE bump — expenses ships now (empty) so the later Expenses
    // build needs no further migration. Purely additive again.
    //
    // ⚠️ CONFIDENTIALITY: these tables hold salary/HR data. They must NEVER be
    // written into the firm blob (kv 'firm') or any staff-facing export — see
    // the contract in types.ts and the assertions in test-people.mjs.
    this.version(3).stores({
      expenses: 'id, date, projectId, invoiceId',
      hr: 'personId',
      payrollRuns: 'id, month',
      renewals: 'id, expiryDate, scope',
    });
  }
}

export const db = new StudioHoursDB();

// ---- kv helpers -------------------------------------------------------------

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await db.kv.get(key);
  return row?.value as T | undefined;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await db.kv.put({ key, value });
}

// Well-known keys
export const KV_FIRM = 'firm';
export const KV_FLAGS = 'flags';
/** End-of-service accrual rule — its OWN key, deliberately outside the firm
 *  blob so no firm-file export can ever carry it (confidentiality contract). */
export const KV_EOSB_RULE = 'eosbRule';
export const kvWeekRows = (personId: string, weekStart: string) => `weekRows:${personId}:${weekStart}`;
export const kvLastExport = (personId: string, weekStart: string) => `lastExport:${personId}:${weekStart}`;

export async function getFirm(): Promise<FirmFile | undefined> {
  return kvGet<FirmFile>(KV_FIRM);
}

export async function setFirm(firm: FirmFile): Promise<void> {
  await kvSet(KV_FIRM, firm);
}

export async function getFlags(): Promise<AppFlags> {
  return (await kvGet<AppFlags>(KV_FLAGS)) ?? { ...DEFAULT_FLAGS };
}

export async function patchFlags(patch: Partial<AppFlags>): Promise<AppFlags> {
  const next = { ...(await getFlags()), ...patch };
  await kvSet(KV_FLAGS, next);
  return next;
}

/** Reserve and return the next sequential invoice number (INV-0001, …). The
 *  read-bump-write runs in one IndexedDB transaction so two tabs (or rapid
 *  concurrent calls) can never mint the same number. */
export async function nextInvoiceNumber(): Promise<string> {
  return db.transaction('rw', db.kv, async () => {
    const flags = await getFlags();
    const seq = (flags.invoiceSeq ?? 0) + 1;
    await kvSet(KV_FLAGS, { ...flags, invoiceSeq: seq });
    return `INV-${String(seq).padStart(4, '0')}`;
  });
}

/** Wipe everything (Settings → reset, and "clear sample data"). */
export async function resetAll(): Promise<void> {
  await Promise.all([
    db.entries.clear(),
    db.kv.clear(),
    db.importLog.clear(),
    db.importUndo.clear(),
    db.invoices.clear(),
    db.expenses.clear(),
    db.hr.clear(),
    db.payrollRuns.clear(),
    db.renewals.clear(),
  ]);
}
