// Studio Hours — shared data contracts. Every persisted/exported object carries
// schemaVersion so future versions can migrate old files instead of rejecting them.

export const SCHEMA_VERSION = 1;

export type ProjectStatus = 'active' | 'on_hold' | 'closed';
export type BillingMethod = 'fixed_fee' | 'hourly';
export type PhaseStatus = 'open' | 'closed';

export interface Phase {
  phaseId: string;
  name: string;
  aiaCode: string; // 'PD' | 'SD' | 'DD' | 'CD' | 'BN' | 'CA' | 'CO' | custom
  sequence: number;
  budgetedHours: number | null;
  budgetedFee: number | null;
  billableDefault: boolean;
  status: PhaseStatus;
  /** created automatically by an import, not by the manager */
  imported?: boolean;
}

export interface Project {
  projectId: string;
  clientName: string;
  projectNumber: string;
  projectName: string;
  status: ProjectStatus;
  billingMethod: BillingMethod;
  fee: number | null;
  phases: Phase[];
  imported?: boolean;
  /** staff-created local draft, pending manager adoption into the firm file */
  unofficial?: boolean;
}

export interface Person {
  personId: string;
  name: string;
  weeklyCapacityHours: number;
  /** per-person band so principals (~40-65%) don't false-alarm against staff targets (~75-85%) */
  targetUtilization: { min: number; max: number };
  active: boolean;
  /** "Can manage the firm" — this person sees the firm-level tabs (Money /
   *  Dashboard / People / Setup) up front; everyone else gets Week plus a
   *  "More" expander (see App.tsx). Optional and additive: SCHEMA_VERSION
   *  stays 1, older firm files simply lack the field, and when NO person in
   *  a firm has it set the app shows everyone everything — a legacy firm can
   *  never lock its owner out. Set automatically by the Manager Wizard path
   *  and Solo Setup; editable in People → Roster. */
  isManager?: boolean;
}

export interface NonProjectBucket {
  id: string; // 'marketing' | 'admin' | 'pto' | 'prof-dev'
  name: string;
  billableDefault: boolean;
}

export interface Activity {
  activityId: string;
  name: string;
  billableDefault: boolean;
  archived?: boolean;
}

/** BILLING rates (what the firm charges clients), not COMPENSATION (what it pays
 *  staff) — the latter stays out of Studio Hours entirely. Rates are optional and
 *  additive: a firm file without them behaves exactly as before. Resolution for a
 *  given entry is projectRates → personRates → defaultHourlyRate (see lib/rates). */
export interface BillingRates {
  /** firm-wide fallback, applied when no person/project override exists */
  defaultHourlyRate: number | null;
  /** personId → hourly rate (the role-based lever: principal vs. drafter) */
  personRates: Record<string, number>;
  /** projectId → flat hourly rate for every hour on that project (negotiated rate) */
  projectRates: Record<string, number>;
  /** ISO 4217, e.g. 'USD' — display only; all math is currency-agnostic */
  currency: string;
}

export function emptyRates(): BillingRates {
  return { defaultHourlyRate: null, personRates: {}, projectRates: {}, currency: 'USD' };
}

/** The Firm File — canonical on the manager's machine, distributed via shared folder.
 *  Billing rates (added v1.1) are optional so older files still load. */
export interface FirmFile {
  schemaVersion: number;
  exportType: 'firm';
  exportedAt?: string;
  firm: { firmName: string; defaultWeeklyCapacityHours: number };
  people: Person[];
  projects: Project[];
  nonProjectBuckets: NonProjectBucket[];
  activities: Activity[];
  /** optional — absent on firm files made before invoicing existed */
  billingRates?: BillingRates;
}

export interface TimeEntry {
  id: string;
  schemaVersion: number;
  personId: string;
  personName: string; // denormalized: every exported file must be self-contained
  /** date the work was PERFORMED (YYYY-MM-DD), not the date it was typed in */
  date: string;
  projectId: string; // project uuid or a NonProjectBucket id
  projectName: string;
  phaseId: string | null;
  phaseName: string | null;
  activityId: string | null;
  activityName: string | null;
  hours: number; // decimal, quarter-hour steps
  billable: boolean;
  outOfScope: boolean;
  /** hard-required when outOfScope — the evidentiary field for additional-services claims */
  requestedBy: string | null;
  notes: string | null;
  source: 'manual' | 'import';
  createdAt: string;
  updatedAt: string;
}

/** One exported file per person per period — the artifact staff hand to the manager. */
export interface TimeExportFile {
  schemaVersion: number;
  exportType: 'time-entries';
  exportedAt: string;
  personId: string;
  personName: string;
  firmName: string;
  periodStart: string;
  periodEnd: string;
  /** minimal denormalized refs so the importer can auto-create anything missing */
  referencedEntities: {
    projects: Array<{ projectId: string; projectName: string; clientName: string }>;
    phases: Array<{ phaseId: string; projectId: string; name: string; aiaCode: string }>;
  };
  entries: TimeEntry[];
}

/** Identity of a grid row for one week: project+phase (+optional activity split). */
export interface WeekRowKey {
  projectId: string;
  phaseId: string | null;
  activityId: string | null;
}

export interface ImportLogEntry {
  importId: string;
  fileName: string;
  personId: string;
  personName: string;
  periodStart: string;
  periodEnd: string;
  entryCount: number;
  replacedCount: number;
  status: 'ok' | 'error';
  message?: string;
  at: string;
  undone?: boolean;
}

/** Everything needed to reverse one import — one bad folder-drop must never
 *  destroy billing history. */
export interface ImportUndoRecord {
  importId: string;
  removed: TimeEntry[];
  addedIds: string[];
  at: string;
}

// ---- invoicing --------------------------------------------------------------

export type InvoiceStatus = 'draft' | 'sent' | 'paid';

/** How the time entries in the period were rolled into billable lines. */
export type InvoiceGroupBy = 'phase' | 'person' | 'activity';

/** The two ways a project bills. 'time' = hours × rate (the original invoice
 *  type); 'claim' = a progress claim against a fixed fee ("this month we're at
 *  60% of Stage 2, last claim was 40%, so bill 20% × the stage fee"). Absent /
 *  undefined means 'time' — every invoice saved before this field existed keeps
 *  meaning exactly what it meant. */
export type InvoiceType = 'time' | 'claim';

/** How a fee-claim line was derived. `amount` on the line stays authoritative
 *  (editable, same philosophy as hours × rate); this records the arithmetic:
 *  amount = (newPct − prevPct) / 100 × basisFee. Percentages are cumulative
 *  "% of the stage fee billed to date", the way architects state claims. */
export interface ClaimDetail {
  phaseId: string;
  phaseName: string;
  /** the stage fee the percentages apply to, snapshotted at claim time */
  basisFee: number;
  /** cumulative % already billed before this invoice */
  prevPct: number;
  /** cumulative % billed to date INCLUDING this invoice */
  newPct: number;
}

/** How an on-charged expense line was derived: amount = baseAmount × (1 +
 *  markupPct/100), rounded to cents. `amount` on the line stays authoritative
 *  (editable, same philosophy as hours × rate) — and editing it never writes
 *  back to the Expense record: the invoice is the bill of record, the expenses
 *  list is the ledger of what was actually spent. */
export interface ExpenseDetail {
  expenseId: string;
  category: ExpenseCategory;
  /** the recorded expense amount before markup, snapshotted at invoice time */
  baseAmount: number;
  markupPct: number;
}

/** One billable line. hours × rate seeds `amount`, but `amount` is authoritative
 *  once saved so a manager can round or adjust a line without fighting the math.
 *  On fee-claim lines hours/rate stay 0 and `claim` records the derivation; on
 *  on-charged expense lines hours/rate stay 0 too and `expense` records the
 *  derivation (the doc + CSV show blanks for those columns, never 0). */
export interface InvoiceLine {
  lineId: string;
  description: string;
  hours: number;
  rate: number;
  amount: number;
  /** present only on fee-claim lines (invoiceType 'claim') */
  claim?: ClaimDetail;
  /** present only on on-charged reimbursable-expense lines (either invoice type) */
  expense?: ExpenseDetail;
}

/** A saved invoice. Every client-facing field is denormalized at creation time so
 *  a later edit to the firm file (rename a project, close a phase) never rewrites
 *  history on an invoice already sent. Invoices are LOCAL to the manager's machine
 *  — they are not part of the firm-file exchange format. */
export interface Invoice {
  invoiceId: string;
  schemaVersion: number;
  invoiceNumber: string;
  status: InvoiceStatus;
  /** ISO date (YYYY-MM-DD) stamped the moment status flips to 'sent' — the
   *  aging basis for the "Waiting to be paid" strip (see lib/receivables.ts).
   *  Flipping status away from 'sent' back to 'draft' clears it. Absent on any
   *  invoice sent before this field existed (or on a legacy stored invoice) —
   *  those age from `issueDate` instead, which always exists. Set centrally by
   *  statusChangePatch in lib/invoice.ts, the single place status changes. */
  sentDate?: string;
  /** ISO date (YYYY-MM-DD) stamped the moment status flips to 'paid'. Cleared
   *  if flipped back off 'paid'. Record-keeping only — a paid invoice is
   *  excluded from receivables regardless, so its absence never affects aging. */
  paidDate?: string;
  /** absent/undefined = 'time' (see InvoiceType) — additive, zero migration */
  invoiceType?: InvoiceType;
  firmName: string;
  projectId: string;
  projectName: string;
  projectNumber: string;
  clientName: string;
  billingMethod: BillingMethod;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  periodStart: string;
  periodEnd: string;
  groupBy: InvoiceGroupBy;
  /** entry filters used to build the lines — remembered for the "re-generate" path */
  includeBillable: boolean;
  includeOutOfScope: boolean;
  currency: string;
  lines: InvoiceLine[];
  taxRate: number; // percent, 0..100
  taxLabel: string; // e.g. 'Tax', 'VAT', 'GST'
  discount: number; // flat amount subtracted before tax
  notes: string | null;
  terms: string | null;
  /** ids of the time entries that fed this invoice — powers "already invoiced" hints */
  sourceEntryIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ---- people operations (HR / payroll-lite / renewals) ------------------------
//
// ⚠️ CONFIDENTIALITY CONTRACT — the one unacceptable bug in this app is salary
// data leaking to staff. Everything in this section lives ONLY in its own Dexie
// tables (hr / payrollRuns / renewals / expenses) and its own kv keys — NEVER
// inside the FirmFile blob (kv key 'firm') that every employee imports, and
// never in any staff-facing export (see lib/serialize.ts). Full local backups
// (lib/backup.ts) DO carry these tables: a backup is the manager's own file.
// test-people.mjs asserts the firm-file export stays clean of all of it.

export type EmploymentType = 'employee' | 'contractor';

/** One named amount on a person's monthly pay (an allowance or a deduction). */
export interface PayItem {
  label: string;
  amount: number;
}

export type LeaveType = 'annual' | 'sick' | 'unpaid';

/** One leave booking. Only 'annual' counts against the yearly entitlement —
 *  sick and unpaid days are recorded but never reduce it (see lib/hr.ts). */
export interface LeaveEntry {
  id: string;
  date: string; // YYYY-MM-DD (first day of the leave)
  days: number; // half-days allowed (0.5 steps)
  type: LeaveType;
  note?: string;
}

/** A person's papers — visa/permit, medical insurance card, professional
 *  license… Anything given an expiryDate automatically surfaces in the
 *  Renewals register and the Dashboard's "Coming up for renewal" strip. */
export interface HrDocument {
  id: string;
  label: string;
  number?: string;
  expiryDate?: string; // YYYY-MM-DD
  note?: string;
}

/** Everything the firm records about one person's employment. Keyed by
 *  personId (one record per person, table `hr`). Salaries are monthly. */
export interface HrRecord {
  personId: string;
  employmentType: EmploymentType;
  startDate: string; // YYYY-MM-DD — drives years of service for end-of-service accrual
  baseSalary: number; // per month
  allowances: PayItem[];
  deductions: PayItem[];
  leaveAnnualDays: number; // yearly annual-leave entitlement
  leaveLedger: LeaveEntry[];
  documents: HrDocument[];
  notes?: string;
  schemaVersion: number;
}

/** One person's row in a payroll run. Denormalized (personName) like TimeEntry/
 *  Invoice so a saved run never rewrites when the roster changes. Stored
 *  numbers are authoritative (same philosophy as invoice lines):
 *  gross = base pay + allowances, net = gross − deductions; `net` is always
 *  recomputed from the other two on edit — see lib/hr.ts. */
export interface PayrollLine {
  personId: string;
  personName: string;
  gross: number; // base pay + allowances
  allowances: number; // the slice of gross that is allowances (base = gross − allowances)
  deductions: number;
  net: number; // gross − deductions
  note?: string;
}

export type PayrollRunStatus = 'draft' | 'paid';

/** One month's payroll — a RECORD of what was paid, not a statutory document.
 *  Exactly one run per month (guarded in the UI). Table `payrollRuns`. */
export interface PayrollRun {
  id: string;
  month: string; // YYYY-MM
  lines: PayrollLine[];
  status: PayrollRunStatus;
  /** stamped when status flips to 'paid'; cleared if flipped back to draft */
  paidDate?: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export type RenewalScope = 'firm' | 'person';
export type RenewalCategory = 'insurance' | 'license' | 'registration' | 'subscription' | 'other';

/** One thing with an expiry date the firm must not miss — firm-level
 *  (professional indemnity, municipal registration, software subscription) or
 *  person-level (medical insurance, visa). Person documents from
 *  HrRecord.documents ALSO surface in the register automatically; this type is
 *  for everything else. Table `renewals`. */
export interface Renewal {
  id: string;
  scope: RenewalScope;
  /** required when scope === 'person' */
  personId?: string;
  label: string;
  category: RenewalCategory;
  expiryDate: string; // YYYY-MM-DD
  /** start reminding this many days ahead (default 60) */
  reminderDays: number;
  note?: string;
  schemaVersion: number;
}

/** One band of an end-of-service accrual rule: between yearsFrom and yearsTo
 *  of service, each year earns daysPerYear days of pay. yearsTo null = no
 *  upper bound (the final band). See lib/hr.ts for the math + KSA preset. */
export interface EosbBand {
  yearsFrom: number;
  yearsTo: number | null;
  daysPerYear: number;
}

/** The firm's end-of-service savings rule — stored in its OWN kv key
 *  (KV_EOSB_RULE in db.ts), never inside the firm blob. Jurisdiction is the
 *  owner's call ("ask your accountant"); the KSA preset ships as the default. */
export interface EosbRule {
  bands: EosbBand[];
  schemaVersion: number;
}

export type ExpenseCategory = 'travel' | 'printing' | 'subconsultant' | 'software' | 'other';

/** A project expense (reimbursable or not). The table ships with the v3
 *  migration; the Money → Expenses UI fills it in a later phase. Kept out of
 *  the firm file like everything else in this section. */
export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  projectId: string;
  projectName: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  billable: boolean;
  markupPct?: number;
  receiptNote?: string;
  /** set once the expense is on-charged to a client invoice */
  invoiceId?: string | null;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppFlags {
  meId: string | null;
  tourStaffDone: boolean;
  tourManagerDone: boolean;
  lastBackupAt: string | null;
  installBannerDismissedAt: string | null;
  sampleLoaded: boolean;
  /** monotonic counter behind the default invoice number (INV-0001, INV-0002, …) */
  invoiceSeq: number;
}

export const DEFAULT_FLAGS: AppFlags = {
  meId: null,
  tourStaffDone: false,
  tourManagerDone: false,
  lastBackupAt: null,
  installBannerDismissedAt: null,
  sampleLoaded: false,
  invoiceSeq: 0,
};
