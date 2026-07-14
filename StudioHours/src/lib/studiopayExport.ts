// StudioPay export — builds the invoice hand-off for the sibling StudioPay app.
// A pure module: the builder takes ONLY an invoice list and a firm name, so by
// construction it cannot reach the hr / payrollRuns / renewals / expenses
// tables or any other confidential data — same discipline as
// lib/serialize.ts's buildFirmFileExport, applied here to a second shareable
// artifact. Only 'sent' and 'paid' invoices travel; drafts aren't final yet
// and never leave this app. Each line carries ONLY description + amount —
// hours, rates, taxRate/taxLabel/discount, notes, terms, billingMethod,
// groupBy, period dates, and sourceEntryIds never travel. `total` already
// reflects discount + tax via invoiceTotals(), so nothing is lost by dropping
// those fields.

import type { Invoice } from '../types';
import { invoiceTotals } from './invoice';
import { nowISO, todayISO } from './dates';

/** Bumped only when THIS file's payload shape changes — kept independent of
 *  the app's internal SCHEMA_VERSION (types.ts) since StudioPay is a separate
 *  app that evolves on its own schedule. */
const STUDIOPAY_SCHEMA_VERSION = 1;

export type StudioPayInvoiceStatus = 'sent' | 'paid';

export interface StudioPayInvoiceLine {
  description: string;
  amount: number;
}

export interface StudioPayInvoice {
  invoiceId: string;
  invoiceNumber: string;
  status: StudioPayInvoiceStatus;
  /** ISO date — key is omitted entirely (not present as undefined) when the
   *  source invoice doesn't have one yet. */
  sentDate?: string;
  paidDate?: string;
  projectName: string;
  projectNumber: string;
  clientName: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  total: number;
  lines: StudioPayInvoiceLine[];
}

export interface StudioPayExportFile {
  schemaVersion: number;
  exportType: 'invoices-for-studiopay';
  exportedAt: string;
  firmName: string;
  invoices: StudioPayInvoice[];
}

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
}

/** Build the StudioPay hand-off from a plain invoice list + firm name — no
 *  database access, no HR/payroll/renewals/expenses tables in scope, ever.
 *  EXCLUDES draft invoices (only 'sent' and 'paid' are included). Do not add
 *  parameters that widen what this function can reach. */
export function buildStudioPayExport(invoices: Invoice[], firmName: string): StudioPayExportFile {
  const eligible = invoices.filter(
    (inv): inv is Invoice & { status: StudioPayInvoiceStatus } => inv.status === 'sent' || inv.status === 'paid',
  );
  return {
    schemaVersion: STUDIOPAY_SCHEMA_VERSION,
    exportType: 'invoices-for-studiopay',
    exportedAt: nowISO(),
    firmName,
    invoices: eligible.map((inv) => ({
      invoiceId: inv.invoiceId,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      ...(inv.sentDate !== undefined ? { sentDate: inv.sentDate } : {}),
      ...(inv.paidDate !== undefined ? { paidDate: inv.paidDate } : {}),
      projectName: inv.projectName,
      projectNumber: inv.projectNumber,
      clientName: inv.clientName,
      currency: inv.currency,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      total: invoiceTotals(inv).total,
      lines: inv.lines.map((l) => ({ description: l.description, amount: l.amount })),
    })),
  };
}

/** e.g. "atelier-north_studio-pay-invoices-2026-07-13.json" */
export function studiopayExportFilename(firmName: string): string {
  return `${slug(firmName)}_studio-pay-invoices-${todayISO()}.json`;
}
