// The invoice itself: an editable document that is also the printout. Editing
// controls (bordered inputs, the remove/add buttons) shed their chrome under
// `print:*`, so File → Print produces a clean client-ready page from the same DOM.
//
// Two renderings share this component: hourly invoices show Hours | Rate,
// fee-claim invoices show "% this invoice" | "% to date" in the same two
// columns. On a claim line "% to date" is the editable value (the same number
// the builder asks for) and "% this invoice" is derived from it.

import { Plus, X } from 'lucide-react';
import type { Invoice, InvoiceLine } from '../../types';
import { invoiceTotals } from '../../lib/invoice';
import { isClaimInvoice } from '../../lib/claims';
import { fmtMoney } from '../../lib/rates';
import { monthDayLabel } from '../../lib/dates';
import { NumField, TextField } from './fields';

const round2 = (n: number): number => Math.round(n * 100) / 100;

export default function InvoiceDoc({
  inv,
  onPatch,
  onPatchLine,
  onRemoveLine,
  onAddLine,
}: {
  inv: Invoice;
  onPatch: (patch: Partial<Invoice>) => void;
  onPatchLine: (lineId: string, patch: Partial<InvoiceLine>) => void;
  onRemoveLine: (lineId: string) => void;
  onAddLine: () => void;
}) {
  const t = invoiceTotals(inv);
  const cur = inv.currency;
  const claim = isClaimInvoice(inv);

  // Amount auto-derives from hours × rate ONLY while the line is still in sync.
  // Once a manager manually overrides the amount (a discount, a rounding), later
  // hours/rate edits must not silently wipe it — the amount is authoritative
  // (see the InvoiceLine contract in types.ts).
  const inSync = (l: InvoiceLine) => Math.abs(l.amount - round2(l.hours * l.rate)) < 0.005;
  const editHours = (l: InvoiceLine, hours: number) =>
    onPatchLine(l.lineId, inSync(l) ? { hours, amount: round2(hours * l.rate) } : { hours });
  const editRate = (l: InvoiceLine, rate: number) =>
    onPatchLine(l.lineId, inSync(l) ? { rate, amount: round2(l.hours * rate) } : { rate });
  const editAmount = (l: InvoiceLine, amount: number) => onPatchLine(l.lineId, { amount: round2(amount) });

  // Same contract for claim lines: amount re-derives from (% to date − % before)
  // × stage fee only while still in sync; a manual amount override sticks. The
  // editor is the deliberate escape hatch — unlike the builder it accepts any
  // "% to date" (even below what was billed before, i.e. a correction), and the
  // cumulative guard in lib/claims clamps whatever is stored to 0–100 when it
  // feeds future claims.
  const claimAmount = (c: NonNullable<InvoiceLine['claim']>) => round2(((c.newPct - c.prevPct) / 100) * c.basisFee);
  const claimInSync = (l: InvoiceLine) => !!l.claim && Math.abs(l.amount - claimAmount(l.claim)) < 0.005;
  const editNewPct = (l: InvoiceLine, newPct: number) => {
    if (!l.claim) return;
    const nextClaim = { ...l.claim, newPct: round2(newPct) };
    onPatchLine(
      l.lineId,
      claimInSync(l) ? { claim: nextClaim, amount: claimAmount(nextClaim) } : { claim: nextClaim },
    );
  };

  return (
    <div className="mx-auto max-w-3xl border border-line p-8 print:max-w-none print:border-0 print:p-0">
      {/* Masthead */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink pb-4">
        <div>
          <div className="text-2xl font-bold">{inv.firmName}</div>
          <div className="mt-1 text-ink-soft">Invoice</div>
        </div>
        <div className="text-right">
          <label className="flex flex-col items-end gap-1">
            <span className="text-ink-soft">Invoice #</span>
            <TextField
              value={inv.invoiceNumber}
              onCommit={(v) => onPatch({ invoiceNumber: v })}
              ariaLabel="Invoice number"
              className="w-40 text-right font-bold"
            />
          </label>
        </div>
      </div>

      {/* Bill-to + dates */}
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className="text-ink-soft">Bill to</span>
          <TextField
            value={inv.clientName}
            onCommit={(v) => onPatch({ clientName: v })}
            ariaLabel="Client name"
            placeholder="Client name"
            className="w-full font-bold"
          />
          <TextField
            value={inv.projectName}
            onCommit={(v) => onPatch({ projectName: v })}
            ariaLabel="Project name"
            placeholder="Project"
            className="w-full"
          />
          <span className="text-ink-soft">
            {inv.projectNumber ? `Project ${inv.projectNumber} · ` : ''}
            {monthDayLabel(inv.periodStart)} – {monthDayLabel(inv.periodEnd)}
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <label className="flex items-center gap-2">
            <span className="text-ink-soft">Issue date</span>
            <input
              type="date"
              value={inv.issueDate}
              onChange={(e) => onPatch({ issueDate: e.target.value || inv.issueDate })}
              aria-label="Issue date"
              className="h-11 border border-line px-2 print:border-0 print:px-0"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-ink-soft">Due date</span>
            <input
              type="date"
              value={inv.dueDate}
              min={inv.issueDate}
              onChange={(e) => onPatch({ dueDate: e.target.value || inv.dueDate })}
              aria-label="Due date"
              className="h-11 border border-line px-2 print:border-0 print:px-0"
            />
          </label>
        </div>
      </div>

      {/* Line items */}
      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr className="border-b border-ink text-left">
              <th className="py-2 pr-3 font-bold">Description</th>
              <th className="w-24 py-2 px-3 text-right font-bold">{claim ? '% this invoice' : 'Hours'}</th>
              <th className="w-28 py-2 px-3 text-right font-bold">{claim ? '% to date' : 'Rate'}</th>
              <th className="w-32 py-2 pl-3 text-right font-bold">Amount ({cur})</th>
              <th className="w-28 py-2 print:hidden" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {inv.lines.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-ink-soft">
                  {claim
                    ? 'No lines on this invoice. Add one below.'
                    : 'No billable lines. Add one below, or regenerate with a wider period or different filters.'}
                </td>
              </tr>
            )}
            {inv.lines.map((l) => (
              <tr key={l.lineId} className="border-b border-line align-middle">
                <td className="py-1.5 pr-3">
                  <TextField
                    value={l.description}
                    onCommit={(v) => onPatchLine(l.lineId, { description: v })}
                    ariaLabel="Line description"
                    placeholder="Description"
                    className="w-full"
                  />
                </td>
                {claim ? (
                  <>
                    <td className="py-1.5 px-3 text-right">
                      {l.claim ? (
                        <span className="tabular-nums">{round2(l.claim.newPct - l.claim.prevPct)}%</span>
                      ) : (
                        <span className="text-ink-soft" aria-label="Not a stage-fee line">—</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      {l.claim ? (
                        <span className="inline-flex items-center gap-1">
                          <NumField
                            value={l.claim.newPct}
                            onCommit={(n) => editNewPct(l, n)}
                            ariaLabel={`Percent billed to date for ${l.claim.phaseName}`}
                            className="w-20 text-right"
                          />
                          <span className="text-ink-soft">%</span>
                        </span>
                      ) : (
                        <span className="text-ink-soft" aria-hidden>—</span>
                      )}
                    </td>
                  </>
                ) : l.expense ? (
                  // An on-charged expense has no hours or rate — show blanks,
                  // not editable zeros. The amount stays editable like any line.
                  <>
                    <td className="py-1.5 px-3 text-right">
                      <span className="text-ink-soft" aria-label="Expense line — no hours">—</span>
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <span className="text-ink-soft" aria-hidden>—</span>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-1.5 px-3 text-right">
                      <NumField value={l.hours} onCommit={(n) => editHours(l, n)} ariaLabel="Line hours" className="w-20 text-right" />
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <NumField value={l.rate} onCommit={(n) => editRate(l, n)} ariaLabel="Line rate" className="w-24 text-right" />
                    </td>
                  </>
                )}
                <td className="py-1.5 pl-3 text-right">
                  <NumField value={l.amount} onCommit={(n) => editAmount(l, n)} ariaLabel="Line amount" className="w-28 text-right" />
                </td>
                <td className="py-1.5 pl-1 print:hidden">
                  <button
                    type="button"
                    aria-label={`Remove line ${l.description}`}
                    onClick={() => onRemoveLine(l.lineId)}
                    className="flex h-11 cursor-pointer items-center gap-1 px-2 text-ink-soft transition-colors duration-200 hover:text-alert"
                  >
                    <X className="h-4 w-4" aria-hidden /> Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={onAddLine}
          className="mt-3 flex cursor-pointer items-center gap-1 text-ink-soft transition-colors duration-200 hover:text-ink print:hidden"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add line
        </button>
      </div>

      {/* Totals */}
      <div className="mt-6 flex justify-end">
        <div className="w-full max-w-xs">
          <Row label="Subtotal" value={fmtMoney(t.subtotal, cur)} />
          <div className="flex items-center justify-between gap-4 border-b border-line py-1.5">
            <span className="text-ink-soft">Discount ({cur})</span>
            <NumField
              value={inv.discount}
              onCommit={(n) => onPatch({ discount: n })}
              ariaLabel="Discount amount"
              className="w-24 text-right"
            />
          </div>
          {inv.discount > t.subtotal && (
            <p className="border-b border-line py-1.5 text-warn">
              Discount exceeds the subtotal — {fmtMoney(t.discount, cur)} applied (capped).
            </p>
          )}
          <div className="flex items-center justify-between gap-2 border-b border-line py-1.5">
            <span className="flex items-center gap-2">
              <TextField
                value={inv.taxLabel}
                onCommit={(v) => onPatch({ taxLabel: v })}
                ariaLabel="Tax label"
                className="w-16"
              />
              <NumField
                value={inv.taxRate}
                onCommit={(n) => onPatch({ taxRate: n })}
                ariaLabel="Tax percent"
                className="w-14 text-right"
              />
              <span className="text-ink-soft">%</span>
            </span>
            <span className="tabular-nums">{fmtMoney(t.tax, cur)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 pt-3">
            <span className="font-bold">Total due</span>
            <span className="text-2xl font-bold tabular-nums">{fmtMoney(t.total, cur)}</span>
          </div>
          {/* claim invoices bill percentages of stage fees, not hours */}
          {!claim && <div className="mt-1 text-right text-ink-soft">{t.hours} hours billed</div>}
        </div>
      </div>

      {/* Notes + terms */}
      <div className="mt-8 grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Notes</span>
          <textarea
            value={inv.notes ?? ''}
            onChange={(e) => onPatch({ notes: e.target.value || null })}
            placeholder="Anything the client should see — thank-you, PO number…"
            rows={3}
            className="border border-line px-2 py-1.5 print:border-0 print:px-0"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Payment terms</span>
          <textarea
            value={inv.terms ?? ''}
            onChange={(e) => onPatch({ terms: e.target.value || null })}
            placeholder="e.g. Payment due within 30 days. Wire to…"
            rows={3}
            className="border border-line px-2 py-1.5 print:border-0 print:px-0"
          />
        </label>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-1.5">
      <span className="text-ink-soft">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
