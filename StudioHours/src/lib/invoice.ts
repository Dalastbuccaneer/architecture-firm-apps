// Invoice engine — pure functions that turn time entries into billable lines and
// totals. No React, no DB. The builder screen owns state and persistence; this
// file owns the math so it can be unit-reasoned and reused.

import type {
  FirmFile,
  Invoice,
  InvoiceGroupBy,
  InvoiceLine,
  InvoiceStatus,
  TimeEntry,
} from '../types';
import { SCHEMA_VERSION } from '../types';
import { isClaimInvoice } from './claims';
import { firmRates, resolveRate } from './rates';
import { addDaysISO, nowISO, todayISO } from './dates';
import { uid } from './seeds';

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface InvoiceFilters {
  /** normal in-scope billable hours */
  includeBillable: boolean;
  /** out-of-scope / additional-services hours (billed as T&M regardless of the
   *  project's base billing method) */
  includeOutOfScope: boolean;
}

/** The entries a project can bill for a period, given the include filters. An
 *  entry is either in-scope or out-of-scope; the two flags gate them separately
 *  so a fixed-fee project can invoice ONLY its additional services. */
export function selectEntries(
  entries: TimeEntry[],
  projectId: string,
  periodStart: string,
  periodEnd: string,
  filters: InvoiceFilters,
): TimeEntry[] {
  // An entry a user explicitly marked non-billable is never billed — even when it's
  // also flagged out-of-scope. (Additional-services entries keep billable=true by
  // default, so the common case is unaffected.)
  return entries.filter(
    (e) =>
      e.projectId === projectId &&
      e.hours > 0 &&
      e.billable &&
      e.date >= periodStart &&
      e.date <= periodEnd &&
      ((filters.includeBillable && !e.outOfScope) || (filters.includeOutOfScope && e.outOfScope)),
  );
}

interface GroupAcc {
  description: string;
  hours: number;
  amount: number;
  seq: number;
}

function groupKey(
  e: TimeEntry,
  groupBy: InvoiceGroupBy,
  firm: FirmFile,
): { key: string; description: string; seq: number } {
  if (groupBy === 'person') return { key: e.personId, description: e.personName, seq: 0 };
  if (groupBy === 'activity') {
    return { key: e.activityId ?? '__none__', description: e.activityName ?? 'Unspecified', seq: 0 };
  }
  // phase — labeled with the AIA code and ordered by the project's phase sequence
  const project = firm.projects.find((p) => p.projectId === e.projectId);
  const phase = project?.phases.find((ph) => ph.phaseId === e.phaseId);
  const key = e.phaseId ?? '__nophase__';
  const description = phase
    ? `${phase.aiaCode ? `${phase.aiaCode} — ` : ''}${phase.name}`
    : e.phaseName ?? 'Unphased';
  return { key, description, seq: phase?.sequence ?? 999 };
}

/** Roll selected entries into billable lines. When a line spans people at
 *  different rates, its rate is the blended average — and the line's amount is
 *  then derived from the DISPLAYED hours × rate, not the exact internal sum, so
 *  every printed line multiplies out under a client's calculator. The drift vs.
 *  the exact sum is at most cents per blended line; arithmetic consistency on a
 *  client-facing document wins. Every field stays editable in the builder. */
export function buildLines(entries: TimeEntry[], groupBy: InvoiceGroupBy, firm: FirmFile): InvoiceLine[] {
  const rates = firmRates(firm);
  const groups = new Map<string, GroupAcc>();
  for (const e of entries) {
    const { key, description, seq } = groupKey(e, groupBy, firm);
    const g = groups.get(key) ?? { description, hours: 0, amount: 0, seq };
    g.hours += e.hours;
    g.amount += e.hours * resolveRate(rates, e.projectId, e.personId);
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => (groupBy === 'phase' ? a.seq - b.seq : b.hours - a.hours))
    .map((g) => {
      const hours = round2(g.hours);
      const rate = g.hours > 0 ? round2(g.amount / g.hours) : 0;
      return {
        lineId: uid(),
        description: g.description,
        hours,
        rate,
        amount: round2(hours * rate),
      };
    });
}

export interface InvoiceTotals {
  hours: number;
  subtotal: number;
  discount: number;
  discounted: number;
  tax: number;
  total: number;
}

export function invoiceTotals(inv: Pick<Invoice, 'lines' | 'discount' | 'taxRate'>): InvoiceTotals {
  const subtotal = round2(inv.lines.reduce((s, l) => s + l.amount, 0));
  const discount = Math.min(Math.max(0, inv.discount || 0), subtotal);
  const discounted = round2(subtotal - discount);
  const tax = round2(discounted * ((inv.taxRate || 0) / 100));
  return {
    hours: round2(inv.lines.reduce((s, l) => s + l.hours, 0)),
    subtotal,
    discount: round2(discount),
    discounted,
    tax,
    total: round2(discounted + tax),
  };
}

export interface MakeInvoiceArgs {
  firm: FirmFile;
  project: FirmFile['projects'][number];
  invoiceNumber: string;
  issueDate: string;
  periodStart: string;
  periodEnd: string;
  groupBy: InvoiceGroupBy;
  filters: InvoiceFilters;
  allEntries: TimeEntry[];
  netTermsDays?: number;
}

/** Assemble a fresh draft invoice, snapshotting every client-facing firm/project
 *  field so a later edit upstream never rewrites this document. */
export function makeInvoice(args: MakeInvoiceArgs): Invoice {
  const { firm, project, invoiceNumber, issueDate, periodStart, periodEnd, groupBy, filters, allEntries } = args;
  const netDays = args.netTermsDays ?? 30;
  const rates = firmRates(firm);
  const selected = selectEntries(allEntries, project.projectId, periodStart, periodEnd, filters);
  const lines = buildLines(selected, groupBy, firm);
  const at = nowISO();
  return {
    invoiceId: uid(),
    schemaVersion: SCHEMA_VERSION,
    invoiceNumber,
    status: 'draft',
    firmName: firm.firm.firmName,
    projectId: project.projectId,
    projectName: project.projectName,
    projectNumber: project.projectNumber,
    clientName: project.clientName,
    billingMethod: project.billingMethod,
    issueDate,
    dueDate: addDaysISO(issueDate, netDays),
    periodStart,
    periodEnd,
    groupBy,
    includeBillable: filters.includeBillable,
    includeOutOfScope: filters.includeOutOfScope,
    currency: rates.currency || 'USD',
    lines,
    taxRate: 0,
    taxLabel: 'Tax',
    discount: 0,
    notes: null,
    terms: `Payment due within ${netDays} days of the invoice date.`,
    sourceEntryIds: selected.map((e) => e.id),
    createdAt: at,
    updatedAt: at,
  };
}

/** The single place status changes, so sentDate/paidDate always stay honest —
 *  every status button in InvoiceEditor routes through this. Rules:
 *  - -> 'sent': stamp sentDate if it isn't already set (re-sending after an
 *    un-pay keeps the ORIGINAL send date — the aging clock shouldn't reset
 *    just because the invoice was marked paid and back), and clear paidDate
 *    (it's no longer paid).
 *  - -> 'paid': stamp paidDate; backfill sentDate too if the invoice somehow
 *    skipped 'sent' (jumped draft -> paid directly) so it still has a sane
 *    aging basis if it's ever un-paid later.
 *  - -> 'draft': this undoes the invoice entirely, so both dates clear.
 *  No-op (same status clicked again) returns the dates unchanged. */
export function statusChangePatch(
  inv: Pick<Invoice, 'status' | 'sentDate' | 'paidDate'>,
  next: InvoiceStatus,
): Pick<Invoice, 'status' | 'sentDate' | 'paidDate'> {
  if (next === inv.status) return { status: inv.status, sentDate: inv.sentDate, paidDate: inv.paidDate };
  const today = todayISO();
  if (next === 'draft') return { status: next, sentDate: undefined, paidDate: undefined };
  if (next === 'sent') return { status: next, sentDate: inv.sentDate ?? today, paidDate: undefined };
  return { status: next, sentDate: inv.sentDate ?? today, paidDate: today }; // next === 'paid'
}

/** Union of every entry id that already appears on a saved invoice — powers the
 *  "N of these hours are already on invoice INV-0007" guard against double billing. */
export function invoicedEntryIds(invoices: Invoice[]): Set<string> {
  const s = new Set<string>();
  for (const inv of invoices) for (const id of inv.sourceEntryIds) s.add(id);
  return s;
}

// ---- CSV (line items, for the bookkeeper / QuickBooks) ----------------------

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function invoiceToCsv(inv: Invoice): string {
  const t = invoiceTotals(inv);
  const claim = isClaimInvoice(inv);
  // Both invoice types keep the SAME 9 columns in the same order — a bookkeeping
  // import mapped as "Amount = column 9" once keeps working for both. Each CSV is
  // one invoice, so on fee claims the two quantity columns carry the percentages
  // instead of hours/rate and the header says so. The Subtotal row's quantity
  // cell stays blank on claims: percentages of DIFFERENT stage fees don't sum.
  const header = [
    'Invoice', 'Client', 'Project', 'Issue date', 'Due date', 'Description',
    claim ? '% this invoice' : 'Hours',
    claim ? '% to date' : 'Rate',
    'Amount',
  ];
  const rows = inv.lines.map((l) => {
    // On-charged expense lines carry no hours/rate (time mode) and no
    // percentages (claim mode) — those cells stay BLANK, never 0.
    const qty = claim ? (l.claim ? round2(l.claim.newPct - l.claim.prevPct) : '') : l.expense ? '' : l.hours;
    const rateOrPct = claim ? (l.claim ? l.claim.newPct : '') : l.expense ? '' : l.rate;
    return [inv.invoiceNumber, inv.clientName, inv.projectName, inv.issueDate, inv.dueDate, l.description, qty, rateOrPct, l.amount]
      .map(csvCell)
      .join(',');
  });
  const totalRows = [
    ['', '', '', '', '', 'Subtotal', claim ? '' : t.hours, '', t.subtotal],
    ...(t.discount > 0 ? [['', '', '', '', '', 'Discount', '', '', -t.discount]] : []),
    ...(inv.taxRate > 0 ? [['', '', '', '', '', `${inv.taxLabel} (${inv.taxRate}%)`, '', '', t.tax]] : []),
    ['', '', '', '', '', 'Total', '', '', t.total],
  ].map((r) => r.map(csvCell).join(','));
  return [header.join(','), ...rows, ...totalRows].join('\r\n');
}

export function invoiceFilename(inv: Invoice, ext: 'json' | 'csv'): string {
  const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice';
  return `${inv.invoiceNumber}_${slug(inv.clientName || inv.projectName)}.${ext}`;
}
