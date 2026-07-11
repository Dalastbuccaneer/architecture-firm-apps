// People-operations engine — end-of-service accrual, leave balances, payroll
// runs, and renewal status. Pure functions, no React, no DB (mirrors
// invoice.ts / receivables.ts) so test-people.mjs can assert the real math.
//
// ⚠️ CONFIDENTIALITY: everything computed here lives in the hr / payrollRuns /
// renewals tables and the 'eosbRule' kv key — NEVER inside the FirmFile blob
// or any staff-facing export. See the contract in types.ts.

import type {
  EosbRule,
  HrRecord,
  PayItem,
  PayrollLine,
  PayrollRun,
  Person,
  Renewal,
} from '../types';
import { SCHEMA_VERSION } from '../types';
import { fromISODate, todayISO, nowISO } from './dates';
import { uid } from './seeds';

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ---- defaults -----------------------------------------------------------------

/** A person the firm hasn't set up yet: an employee starting today with no pay
 *  entered and the common 21-day annual-leave entitlement (edit to match the
 *  employment contract). */
export function emptyHrRecord(personId: string): HrRecord {
  return {
    personId,
    employmentType: 'employee',
    startDate: todayISO(),
    baseSalary: 0,
    allowances: [],
    deductions: [],
    leaveAnnualDays: 21,
    leaveLedger: [],
    documents: [],
    schemaVersion: SCHEMA_VERSION,
  };
}

// ---- end-of-service (EOSB) ------------------------------------------------------
//
// FORMULA (shown to the user as a caption in Pay → End-of-service rule):
//
//   years of service = whole days since start date ÷ 365           (prorated)
//   accrued days     = Σ over bands: (years inside the band) × daysPerYear
//   daily pay        = monthly base salary × 12 ÷ 365
//   owed today       = accrued days × daily pay
//
// Worked example on the KSA preset (15 days/yr for the first 5 years, 30 after):
//   3.5 years at 10,000/month → 3.5 × 15 = 52.5 days
//   daily pay = 120,000 ÷ 365 = 328.767…
//   owed = 52.5 × 328.767… = 17,260.27
// A 7-year example crosses the band edge: 5×15 + 2×30 = 135 days → 44,383.56.
//
// This is an internal savings estimate, not a legal settlement figure — the
// bands are fully editable and the UI says "ask your accountant".

/** KSA statutory default: half a month (15 days) of pay per year for the first
 *  five years of service, a full month (30 days) per year after that. Ships as
 *  the editable default because jurisdiction is the owner's call. */
export const KSA_EOSB_PRESET: EosbRule = {
  bands: [
    { yearsFrom: 0, yearsTo: 5, daysPerYear: 15 },
    { yearsFrom: 5, yearsTo: null, daysPerYear: 30 },
  ],
  schemaVersion: SCHEMA_VERSION,
};

/** Prorated years of service: whole days between the dates ÷ 365. Days are
 *  rounded to integers first so a DST hour can never smear the figure. */
export function yearsOfService(startDate: string, asOf: string): number {
  const ms = fromISODate(asOf).getTime() - fromISODate(startDate).getTime();
  return Math.max(0, Math.round(ms / 86_400_000) / 365);
}

/** Accrued end-of-service days for `years` of service under `rule`: each band
 *  contributes (years falling inside it) × its daysPerYear. */
export function eosbAccruedDays(rule: EosbRule, years: number): number {
  let days = 0;
  for (const band of rule.bands) {
    const upper = band.yearsTo ?? Infinity;
    const span = Math.min(years, upper) - band.yearsFrom;
    if (span > 0) days += span * band.daysPerYear;
  }
  return days;
}

/** Money owed today if this employee left: accrued days × daily pay, where
 *  daily pay = monthly base × 12 ÷ 365. Allowances are deliberately excluded —
 *  the accrual basis is the base salary (adjust the bands if yours differs). */
export function eosbLiability(rule: EosbRule, baseSalaryMonthly: number, years: number): number {
  const dailyPay = (baseSalaryMonthly * 12) / 365;
  return round2(eosbAccruedDays(rule, years) * dailyPay);
}

// ---- leave ----------------------------------------------------------------------

export interface LeaveSummary {
  entitlement: number;
  /** annual days taken in the year — the ONLY type that reduces the entitlement */
  annualTaken: number;
  sickTaken: number;
  unpaidTaken: number;
  /** entitlement − annualTaken (can go negative; the UI says so plainly) */
  remaining: number;
}

/** Balance for one calendar year (`year` = 'YYYY'). Sick and unpaid days are
 *  reported but never subtracted — only annual leave draws the entitlement
 *  down, and the Leave tab's caption says exactly that. */
export function leaveSummary(
  hr: Pick<HrRecord, 'leaveAnnualDays' | 'leaveLedger'>,
  year: string,
): LeaveSummary {
  let annual = 0;
  let sick = 0;
  let unpaid = 0;
  for (const e of hr.leaveLedger) {
    if (!e.date.startsWith(`${year}-`)) continue;
    if (e.type === 'annual') annual += e.days;
    else if (e.type === 'sick') sick += e.days;
    else unpaid += e.days;
  }
  return {
    entitlement: hr.leaveAnnualDays,
    annualTaken: round2(annual),
    sickTaken: round2(sick),
    unpaidTaken: round2(unpaid),
    remaining: round2(hr.leaveAnnualDays - annual),
  };
}

// ---- payroll ---------------------------------------------------------------------

export const payItemsTotal = (items: PayItem[]): number => round2(items.reduce((s, i) => s + i.amount, 0));

/** Prefill one run line from a person's pay setup:
 *  gross = base salary + allowances, net = gross − deductions. */
export function payrollLineFor(person: Person, hr: HrRecord): PayrollLine {
  const allowances = payItemsTotal(hr.allowances);
  const deductions = payItemsTotal(hr.deductions);
  const gross = round2(hr.baseSalary + allowances);
  return {
    personId: person.personId,
    personName: person.name,
    gross,
    allowances,
    deductions,
    net: round2(gross - deductions),
  };
}

/** Re-derive a line's net after any edit — net is ALWAYS gross − deductions.
 *  (The other three numbers are the authoritative stored ones, invoice-style.) */
export function lineWithNet(line: PayrollLine): PayrollLine {
  return { ...line, net: round2(line.gross - line.deductions) };
}

/** The base-pay slice of a stored line (gross minus its allowances slice) —
 *  what the payslip prints as "Base salary". */
export function lineBasePay(line: Pick<PayrollLine, 'gross' | 'allowances'>): number {
  return round2(line.gross - line.allowances);
}

/** Assemble a fresh draft run for one month: one line per ACTIVE person whose
 *  pay is set up as an EMPLOYEE. Contractors are added by hand per run (they
 *  get a payment record, not a payslip). */
export function makePayrollRun(month: string, people: Person[], hrByPerson: Map<string, HrRecord>): PayrollRun {
  const lines = people
    .filter((p) => p.active && hrByPerson.get(p.personId)?.employmentType === 'employee')
    .map((p) => payrollLineFor(p, hrByPerson.get(p.personId)!));
  const at = nowISO();
  return { id: uid(), month, lines, status: 'draft', schemaVersion: SCHEMA_VERSION, createdAt: at, updatedAt: at };
}

export interface RunTotals {
  gross: number;
  deductions: number;
  net: number;
  people: number;
}

export function runTotals(run: Pick<PayrollRun, 'lines'>): RunTotals {
  return {
    gross: round2(run.lines.reduce((s, l) => s + l.gross, 0)),
    deductions: round2(run.lines.reduce((s, l) => s + l.deductions, 0)),
    net: round2(run.lines.reduce((s, l) => s + l.net, 0)),
    people: run.lines.length,
  };
}

/** 'YYYY-MM' → 'July 2026' (payroll runs and payslips are month-named). */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

// ---- renewals --------------------------------------------------------------------

export const DEFAULT_REMINDER_DAYS = 60;

export type RenewalState = 'ok' | 'due' | 'overdue';

export interface RenewalStatus {
  state: RenewalState;
  /** whole days until expiry — negative once past */
  days: number;
}

export function renewalStatus(expiryDate: string, reminderDays: number, today: string): RenewalStatus {
  const days = Math.round((fromISODate(expiryDate).getTime() - fromISODate(today).getTime()) / 86_400_000);
  if (days < 0) return { state: 'overdue', days };
  if (days <= reminderDays) return { state: 'due', days };
  return { state: 'ok', days };
}

/** The row's words — always present beside the icon and color, never color
 *  alone: "OK" / "Due today" / "Due in N days" / "OVERDUE by N days". */
export function renewalStatusWords(status: RenewalStatus): string {
  if (status.state === 'overdue') {
    const n = -status.days;
    return `OVERDUE by ${n} ${n === 1 ? 'day' : 'days'}`;
  }
  if (status.state === 'due') {
    if (status.days === 0) return 'Due today';
    return `Due in ${status.days} ${status.days === 1 ? 'day' : 'days'}`;
  }
  return 'OK';
}

/** One row of the combined register: explicit renewals plus every person
 *  document that carries an expiry date (those are read-only here — they're
 *  edited on the person, in Pay). */
export interface RenewalRow {
  /** renewal id, or `doc:<personId>:<docId>` for a surfaced document */
  id: string;
  source: 'renewal' | 'document';
  /** present when source === 'renewal' (the editable record) */
  renewal?: Renewal;
  personId?: string;
  /** 'Whole firm' or the person's name */
  whoLabel: string;
  label: string;
  category: string;
  expiryDate: string;
  reminderDays: number;
  note?: string;
  status: RenewalStatus;
}

/** Build the register: every renewal + every dated person document, sorted by
 *  expiry (soonest first). `peopleById` maps personId → display name. */
export function renewalRows(
  renewals: Renewal[],
  hrRecords: HrRecord[],
  peopleById: Map<string, string>,
  today: string,
): RenewalRow[] {
  const rows: RenewalRow[] = renewals.map((r) => ({
    id: r.id,
    source: 'renewal',
    renewal: r,
    personId: r.personId,
    whoLabel: r.scope === 'person' ? (peopleById.get(r.personId ?? '') ?? 'Person') : 'Whole firm',
    label: r.label,
    category: r.category,
    expiryDate: r.expiryDate,
    reminderDays: r.reminderDays,
    note: r.note,
    status: renewalStatus(r.expiryDate, r.reminderDays, today),
  }));
  for (const hr of hrRecords) {
    for (const doc of hr.documents) {
      if (!doc.expiryDate) continue;
      rows.push({
        id: `doc:${hr.personId}:${doc.id}`,
        source: 'document',
        personId: hr.personId,
        whoLabel: peopleById.get(hr.personId) ?? 'Person',
        label: doc.label,
        category: 'document',
        expiryDate: doc.expiryDate,
        reminderDays: DEFAULT_REMINDER_DAYS,
        note: doc.note,
        status: renewalStatus(doc.expiryDate, DEFAULT_REMINDER_DAYS, today),
      });
    }
  }
  return rows.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
}

/** The rows worth interrupting someone for — overdue or inside their reminder
 *  window — most urgent first. Feeds the Dashboard's "Coming up for renewal"
 *  strip and the register's own attention ordering. */
export function dueRenewalRows(rows: RenewalRow[]): RenewalRow[] {
  return rows.filter((r) => r.status.state !== 'ok').sort((a, b) => a.status.days - b.status.days);
}

// ---- new-record helpers (UI conveniences, kept here so ids stay consistent) ------

export function newLeaveEntryId(): string {
  return uid();
}

export function newRenewal(partial: Omit<Renewal, 'id' | 'schemaVersion'>): Renewal {
  return { ...partial, id: uid(), schemaVersion: SCHEMA_VERSION };
}
