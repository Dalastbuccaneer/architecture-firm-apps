// Edit one invoice. Local state is authoritative for stable typing; every patch
// also fire-and-forget persists to IndexedDB, so there is no Save button to
// forget. The toolbar (print:hidden) drives status, export, print and delete;
// InvoiceDoc below it is the client-facing page that actually prints.

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Download, Printer, Trash2 } from 'lucide-react';
import { db } from '../../db';
import type { Invoice, InvoiceLine, InvoiceStatus } from '../../types';
import { nowISO } from '../../lib/dates';
import { invoiceFilename, invoiceToCsv, statusChangePatch } from '../../lib/invoice';
import { releaseExpenses } from '../../lib/expenses';
import { downloadText } from '../../lib/download';
import { uid } from '../../lib/seeds';
import InvoiceDoc from './InvoiceDoc';

const STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid'];
const STATUS_LABEL: Record<InvoiceStatus, string> = { draft: 'Draft', sent: 'Sent', paid: 'Paid' };

export default function InvoiceEditor({ invoiceId, onBack }: { invoiceId: string; onBack: () => void }) {
  const loaded = useLiveQuery(() => db.invoices.get(invoiceId), [invoiceId]);
  const [inv, setInv] = useState<Invoice | null>(null);

  // Seed local state from the DB, and re-sync whenever the stored row is NEWER
  // than the local copy (e.g. the same invoice edited in another tab). Our own
  // autosaves carry the same updatedAt back, so they never trigger a reset.
  useEffect(() => {
    if (loaded && (!inv || loaded.updatedAt > inv.updatedAt)) setInv(loaded);
  }, [loaded, inv]);

  if (loaded === undefined) return null; // still loading
  if (loaded === null || !inv) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-ink-soft">This invoice no longer exists.</p>
        <button type="button" onClick={onBack} className="min-h-11 w-fit cursor-pointer border border-line px-4 py-2 hover:border-ink">
          Back to invoices
        </button>
      </div>
    );
  }

  const write = (next: Invoice) => {
    setInv(next);
    void db.invoices.put(next);
  };
  const patch = (p: Partial<Invoice>) => write({ ...inv, ...p, updatedAt: nowISO() });
  const patchLine = (lineId: string, p: Partial<InvoiceLine>) =>
    write({ ...inv, lines: inv.lines.map((l) => (l.lineId === lineId ? { ...l, ...p } : l)), updatedAt: nowISO() });
  const removeLine = (lineId: string) => {
    // If the removed line is an on-charged expense, free that expense back to
    // "Not billed yet" — otherwise it stays stamped against this invoice forever
    // (badge lies, on-charge never re-offers it) even though the line is gone.
    const removed = inv.lines.find((l) => l.lineId === lineId);
    if (removed?.expense) {
      const expenseId = removed.expense.expenseId;
      void (async () => {
        const e = await db.expenses.get(expenseId);
        if (e && e.invoiceId === inv.invoiceId) await db.expenses.bulkPut(releaseExpenses([e], inv.invoiceId));
      })();
    }
    write({ ...inv, lines: inv.lines.filter((l) => l.lineId !== lineId), updatedAt: nowISO() });
  };
  const addLine = () =>
    write({
      ...inv,
      lines: [...inv.lines, { lineId: uid(), description: '', hours: 0, rate: 0, amount: 0 }],
      updatedAt: nowISO(),
    });

  const onDelete = () => {
    // A sent/paid invoice is a billing record — deleting it also frees its hours
    // (or, on a fee claim, its billed percentages) to be billed again: both
    // double-billing guards key off saved invoices.
    const freed = inv.invoiceType === 'claim' ? 'its billed percentages could be claimed again' : 'its hours could be invoiced again';
    if (
      inv.status !== 'draft' &&
      !window.confirm(
        `${inv.invoiceNumber} is marked ${STATUS_LABEL[inv.status]}. Deleting a ${STATUS_LABEL[inv.status].toLowerCase()} invoice removes the billing record and ${freed}. Delete anyway?`,
      )
    )
      return;
    if (!window.confirm(`Delete invoice ${inv.invoiceNumber}? This can't be undone.`)) return;
    // THE single delete path. Any expenses on-charged onto this invoice go back
    // to "Not billed yet" (their invoiceId clears) — released BEFORE the invoice
    // row is removed so an interruption can never strand an expense stamped
    // against a missing invoice.
    void (async () => {
      const attached = await db.expenses.where('invoiceId').equals(inv.invoiceId).toArray();
      if (attached.length) await db.expenses.bulkPut(releaseExpenses(attached, inv.invoiceId));
      await db.invoices.delete(inv.invoiceId);
      onBack();
    })();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar — never printed */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-11 cursor-pointer items-center gap-2 border border-line px-3 py-1.5 transition-colors duration-200 hover:border-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Invoices
        </button>

        <div className="flex items-center gap-1" role="group" aria-label="Invoice status">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={inv.status === s}
              onClick={() => patch(statusChangePatch(inv, s))}
              className={`min-h-11 cursor-pointer border px-3 py-1.5 transition-colors duration-200 ${
                inv.status === s ? 'border-ink bg-ink font-bold text-paper' : 'border-line text-ink-soft hover:border-ink hover:text-ink'
              }`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadText(invoiceFilename(inv, 'csv'), invoiceToCsv(inv), 'text/csv')}
            className="flex min-h-11 cursor-pointer items-center gap-2 border border-line px-3 py-1.5 transition-colors duration-200 hover:border-ink"
          >
            <Download className="h-4 w-4" aria-hidden /> Spreadsheet (CSV)
          </button>
          <button
            type="button"
            onClick={() => downloadText(invoiceFilename(inv, 'json'), JSON.stringify(inv, null, 2))}
            className="flex min-h-11 cursor-pointer items-center gap-2 border border-line px-3 py-1.5 transition-colors duration-200 hover:border-ink"
          >
            <Download className="h-4 w-4" aria-hidden /> Backup copy (JSON)
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
          >
            <Printer className="h-4 w-4" aria-hidden /> Print / PDF
          </button>
          <button
            type="button"
            aria-label={`Delete invoice ${inv.invoiceNumber}`}
            onClick={onDelete}
            className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 border border-line px-3 py-1.5 text-ink-soft transition-colors duration-200 hover:border-alert hover:text-alert"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <p className="text-ink-soft print:hidden">
        Everything below is editable — click any field. Changes save automatically. Print for a clean, client-ready PDF.
      </p>

      <InvoiceDoc inv={inv} onPatch={patch} onPatchLine={patchLine} onRemoveLine={removeLine} onAddLine={addLine} />
    </div>
  );
}
