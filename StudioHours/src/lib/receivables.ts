// Accounts-receivable aging — pure functions over saved invoices for the Money
// screen's "Waiting to be paid" strip. No React, no DB (mirrors invoice.ts /
// claims.ts). "Owed to you" means a SENT invoice that hasn't been marked paid —
// a draft hasn't been billed yet (nothing owed) and a paid invoice is already
// settled. This is the deliberate opposite of Fee Burn's "invoiced so far",
// which counts drafts on purpose (a different question: "how much of the fee
// have we claimed" vs. "how much cash is outstanding").
//
// Ages from the day each invoice was actually SENT (Invoice.sentDate, stamped
// centrally by statusChangePatch in invoice.ts) rather than the printed due
// date: due date is a forward-looking promise set at creation time (and
// editable), not a record of when the client actually got the bill. Invoices
// sent before this field existed — or any invoice that reaches 'sent' by some
// future path that forgets to stamp it — have no sentDate, so they fall back
// to issueDate, which every invoice has always had.

import type { Invoice } from '../types';
import { invoiceTotals } from './invoice';
import { fromISODate } from './dates';

export type AgingBucketId = '0-30' | '31-60' | '61-90' | 'over90';

export interface AgingBucketMeta {
  id: AgingBucketId;
  /** plain day-range wording — never "aging" or "AR" in front of an owner */
  label: string;
  /** upper bound in days, inclusive; null = unbounded (the last bucket) */
  maxDays: number | null;
}

export const AGING_BUCKETS: AgingBucketMeta[] = [
  { id: '0-30', label: '0–30 days', maxDays: 30 },
  { id: '31-60', label: '31–60 days', maxDays: 60 },
  { id: '61-90', label: '61–90 days', maxDays: 90 },
  { id: 'over90', label: 'Over 90 days', maxDays: null },
];

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The date aging counts from for one invoice: when it was actually sent, or —
 *  for invoices that predate sentDate — the date it was issued. */
export function agingDate(inv: Pick<Invoice, 'sentDate' | 'issueDate'>): string {
  return inv.sentDate ?? inv.issueDate;
}

/** Whole days between an invoice's aging date and `today`, floored at 0 so a
 *  same-day send (or any clock skew) never reads as negative. */
export function daysOutstanding(inv: Pick<Invoice, 'sentDate' | 'issueDate'>, today: string): number {
  const ms = fromISODate(today).getTime() - fromISODate(agingDate(inv)).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function bucketForDays(days: number): AgingBucketId {
  const hit = AGING_BUCKETS.find((b) => b.maxDays !== null && days <= b.maxDays);
  return hit?.id ?? 'over90';
}

/** Only a sent-and-unpaid invoice is money owed — see the file header. */
export function isReceivable(inv: Pick<Invoice, 'status'>): boolean {
  return inv.status === 'sent';
}

export interface AgingBucketSummary extends AgingBucketMeta {
  amount: number;
  count: number;
  invoiceIds: string[];
}

export interface ReceivablesSummary {
  totalOwed: number;
  totalCount: number;
  /** always all 4 buckets, in order, even when a bucket's amount/count is 0 —
   *  "nothing overdue" is itself useful information, not something to hide. */
  buckets: AgingBucketSummary[];
}

/** Roll every sent-and-unpaid invoice into its aging bucket. `today` is a
 *  parameter (not read internally) so this stays a pure, easily-tested
 *  function — callers pass todayISO(). */
export function summarizeReceivables(invoices: Invoice[], today: string): ReceivablesSummary {
  const buckets: AgingBucketSummary[] = AGING_BUCKETS.map((b) => ({ ...b, amount: 0, count: 0, invoiceIds: [] }));
  const byId = new Map(buckets.map((b) => [b.id, b]));
  let totalOwed = 0;
  let totalCount = 0;
  for (const inv of invoices) {
    if (!isReceivable(inv)) continue;
    const bucket = byId.get(bucketForDays(daysOutstanding(inv, today)))!;
    const amount = invoiceTotals(inv).total;
    bucket.amount = round2(bucket.amount + amount);
    bucket.count += 1;
    bucket.invoiceIds.push(inv.invoiceId);
    totalOwed = round2(totalOwed + amount);
    totalCount += 1;
  }
  return { totalOwed, totalCount, buckets };
}
