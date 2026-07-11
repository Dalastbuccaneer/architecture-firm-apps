// Billing-rate resolution. One rule, used everywhere a rate is needed so the
// invoice builder and any future estimate share identical numbers.
//
// Precedence, most specific first:
//   1. projectRates[projectId]  — a negotiated flat rate for that whole project
//   2. personRates[personId]    — the role-based rate (principal vs. drafter)
//   3. defaultHourlyRate        — the firm-wide fallback
// A missing rate resolves to 0, never NaN, so a half-configured firm still totals.

import type { BillingRates, FirmFile } from '../types';
import { emptyRates } from '../types';

export function firmRates(firm: FirmFile): BillingRates {
  return firm.billingRates ?? emptyRates();
}

/** The rate that applies to one person working on one project. */
export function resolveRate(rates: BillingRates, projectId: string, personId: string): number {
  const project = rates.projectRates?.[projectId];
  if (typeof project === 'number') return project;
  const person = rates.personRates?.[personId];
  if (typeof person === 'number') return person;
  return rates.defaultHourlyRate ?? 0;
}

/** True once the firm has at least one usable rate — gates the invoice CTA and
 *  drives the "set your rates first" nudge. */
export function hasAnyRate(rates: BillingRates): boolean {
  return (
    (rates.defaultHourlyRate ?? 0) > 0 ||
    Object.values(rates.personRates ?? {}).some((r) => r > 0) ||
    Object.values(rates.projectRates ?? {}).some((r) => r > 0)
  );
}

/** Format a money amount for display. Whole numbers drop the decimals; the app is
 *  currency-symbol light on purpose (many small firms bill in mixed currencies). */
export function fmtMoney(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    // Unknown currency code — fall back to a plain number with the code appended.
    return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
  }
}
