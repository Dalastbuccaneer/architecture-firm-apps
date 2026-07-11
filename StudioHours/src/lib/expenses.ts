// Expense engine — pure functions that turn recorded reimbursables (travel,
// printing, permits, subconsultant bills) into on-charged invoice lines, plus
// the predicates that make double-charging impossible. No React, no DB
// (mirrors invoice.ts / claims.ts). The screens own state and persistence;
// this file owns the math so it can be unit-reasoned and reused.
//
// The double-charge guard is the `invoiceId` stamp on the Expense itself:
// stamped when the expense rides onto a created invoice, cleared when that
// invoice is deleted (see InvoiceEditor) — exactly how sourceEntryIds guards
// time entries, but inverted onto the expense row so the badge in the ledger
// ("Not billed yet" / "On invoice INV-0012") is always a plain lookup.

import type { Expense, ExpenseCategory, InvoiceLine } from '../types';
import { SCHEMA_VERSION } from '../types';
import { nowISO } from './dates';
import { uid } from './seeds';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Plain words for the category <select> and everywhere a category is shown. */
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  travel: 'Travel',
  printing: 'Printing',
  subconsultant: 'Subconsultant',
  software: 'Software',
  other: 'Other',
};

export const EXPENSE_CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];

/** Assemble a fresh expense record. */
export function newExpense(
  partial: Omit<Expense, 'id' | 'schemaVersion' | 'createdAt' | 'updatedAt' | 'invoiceId'>,
): Expense {
  const at = nowISO();
  return { ...partial, id: uid(), invoiceId: null, schemaVersion: SCHEMA_VERSION, createdAt: at, updatedAt: at };
}

/** What the client is asked to pay for one expense: the recorded amount plus
 *  the optional markup, rounded to cents (same round2 rule as invoice.ts). */
export function onChargeAmount(e: Pick<Expense, 'amount' | 'markupPct'>): number {
  return round2(e.amount * (1 + (e.markupPct || 0) / 100));
}

/** True for an expense that can still ride onto an invoice: the client pays it
 *  back (billable) AND it isn't on an invoice already. Non-billable expenses
 *  never appear in any builder. */
export function isUnbilledBillable(e: Pick<Expense, 'billable' | 'invoiceId'>): boolean {
  return e.billable === true && !e.invoiceId;
}

/** The expenses the invoice builder offers to on-charge for a project: every
 *  unbilled billable expense, REGARDLESS of the invoice's period — expenses
 *  aren't period-scoped like time entries (a permit fee paid in March still
 *  belongs on April's invoice if it hasn't been billed yet). Oldest first, so
 *  invoice lines read chronologically. */
export function unbilledBillableExpenses(expenses: Expense[], projectId: string): Expense[] {
  return expenses
    .filter((e) => e.projectId === projectId && isUnbilledBillable(e))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1));
}

/** Roll one expense into an invoice line. hours/rate stay 0 (like claim lines)
 *  and `expense` records the derivation, so the doc and CSV render blanks —
 *  never a 0 or NaN — in the hours/rate (or percentage) columns. */
export function expenseLine(e: Expense): InvoiceLine {
  return {
    lineId: uid(),
    description: `Expense — ${EXPENSE_CATEGORY_LABEL[e.category] ?? e.category}: ${e.description}`,
    hours: 0,
    rate: 0,
    amount: onChargeAmount(e),
    expense: {
      expenseId: e.id,
      category: e.category,
      baseAmount: e.amount,
      markupPct: e.markupPct || 0,
    },
  };
}

/** Release-on-delete: the expenses that were on a just-deleted invoice, patched
 *  back to "Not billed yet" (invoiceId cleared). Returns ONLY the rows that
 *  matched — everything else is untouched — so the caller can bulkPut the
 *  result directly. The invoice itself is never modified from the expense side. */
export function releaseExpenses(expenses: Expense[], invoiceId: string): Expense[] {
  const at = nowISO();
  return expenses
    .filter((e) => e.invoiceId === invoiceId)
    .map((e) => ({ ...e, invoiceId: null, updatedAt: at }));
}

/** Ledger summary for the filtered list: "4 expenses — $1,250 — $800 not billed
 *  yet". Totals are the RECORDED amounts (what was spent — this is the ledger);
 *  the marked-up on-charge total lives in the invoice builder. */
export function expenseSummary(expenses: Expense[]): { count: number; total: number; unbilled: number } {
  return {
    count: expenses.length,
    total: round2(expenses.reduce((s, e) => s + e.amount, 0)),
    unbilled: round2(expenses.filter(isUnbilledBillable).reduce((s, e) => s + e.amount, 0)),
  };
}

// ---- CSV (the ledger, for the bookkeeper) ------------------------------------

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const EXPENSE_CSV_COLUMNS = [
  'Date', 'Project', 'Category', 'Description', 'Amount',
  'Client pays back', 'Markup %', 'Amount if billed', 'Billed', 'Receipt',
] as const;

/** One row per expense, in the order given (the screen passes its filtered,
 *  newest-first list). `invoiceNumbers` maps invoiceId → invoice number so the
 *  Billed column reads "On invoice INV-0012" in plain words. */
export function expensesToCsv(expenses: Expense[], invoiceNumbers: Map<string, string>): string {
  const rows = expenses.map((e) => {
    const billed = e.invoiceId
      ? `On invoice ${invoiceNumbers.get(e.invoiceId) ?? '(deleted)'}`
      : e.billable
        ? 'Not billed yet'
        : 'Firm cost — not billed to client';
    return [
      e.date,
      e.projectName,
      EXPENSE_CATEGORY_LABEL[e.category] ?? e.category,
      e.description,
      e.amount,
      e.billable ? 'Yes' : 'No',
      e.billable ? e.markupPct || 0 : '',
      e.billable ? onChargeAmount(e) : '',
      billed,
      e.receiptNote ?? '',
    ].map(csvCell).join(',');
  });
  return [EXPENSE_CSV_COLUMNS.join(','), ...rows].join('\r\n');
}

export function expensesCsvFilename(firmName: string): string {
  const slug = firmName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'firm';
  return `${slug}_expenses.csv`;
}
