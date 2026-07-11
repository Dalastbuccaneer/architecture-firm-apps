// The Money screen (internal view key: 'invoices') — a local register of
// invoices billed from tracked hours. Three modes: the list, the "new invoice"
// builder, and the editor. Creating a draft inserts it (so it's never lost)
// and drops straight into the editor.
//
// Money carries the same sub-tab scaffold as Dashboard/Week/People. Two
// sub-tabs: Invoices (the receivables strip + the register) and Expenses (the
// reimbursables ledger). Everything invoice-specific — the strip's numbers,
// the info box, the list — is gated behind tab === 'invoices' so the Expenses
// tab shows only expenses UI.

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FilePlus2, Info } from 'lucide-react';
import { db } from '../db';
import { useApp } from '../AppContext';
import type { InvoiceStatus } from '../types';
import { invoiceTotals } from '../lib/invoice';
import { firmRates, fmtMoney, hasAnyRate } from '../lib/rates';
import { monthDayLabel, todayISO } from '../lib/dates';
import { summarizeReceivables, type AgingBucketId } from '../lib/receivables';
import InvoiceBuilder from '../components/invoice/InvoiceBuilder';
import InvoiceEditor from '../components/invoice/InvoiceEditor';
import ReceivablesStrip from '../components/invoice/ReceivablesStrip';
import ExpensesTab from '../components/invoice/ExpensesTab';

type Mode = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; id: string };

type Tab = 'invoices' | 'expenses';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'invoices', label: 'Invoices' },
  { id: 'expenses', label: 'Expenses' },
];

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  draft: 'border border-line text-ink-soft',
  sent: 'border border-ink',
  paid: 'border border-ok text-ok',
};

export default function Invoices() {
  const { firm } = useApp();
  const invoices = useLiveQuery(() => db.invoices.orderBy('issueDate').reverse().toArray(), []);
  const allEntries = useLiveQuery(() => db.entries.toArray(), []) ?? [];
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) ?? [];
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [tab, setTab] = useState<Tab>('invoices');
  const [agingFilter, setAgingFilter] = useState<AgingBucketId | null>(null);
  // `invoices ?? []` keeps this hook call unconditional (Rules of Hooks) while
  // `invoices` is still loading; the result is unused in that render anyway
  // since the early return below fires first.
  const receivables = useMemo(() => summarizeReceivables(invoices ?? [], todayISO()), [invoices]);
  // A stale filter id (its bucket emptied, then refilled later) would make the
  // first click on that bucket a silent no-op — drop the filter as soon as it
  // stops resolving to a non-empty bucket.
  useEffect(() => {
    if (agingFilter && !receivables.buckets.some((b) => b.id === agingFilter && b.count > 0)) {
      setAgingFilter(null);
    }
  }, [agingFilter, receivables]);

  if (!firm) return null;
  if (invoices === undefined) return null;

  const rates = firmRates(firm);
  const ratesReady = hasAnyRate(rates);
  const currency = rates.currency || 'USD';
  // A bucket that just emptied out (its one invoice got marked paid while
  // filtered) must drop the filter on its own — otherwise the strip goes to
  // its "nothing outstanding" empty state while the list below stays stuck
  // showing zero rows for a bucket that no longer exists.
  const activeBucket = agingFilter ? receivables.buckets.find((b) => b.id === agingFilter && b.count > 0) : undefined;
  const visibleInvoices = activeBucket
    ? invoices.filter((inv) => activeBucket.invoiceIds.includes(inv.invoiceId))
    : invoices;

  if (mode.kind === 'new') {
    return (
      <InvoiceBuilder
        firm={firm}
        allEntries={allEntries}
        invoices={invoices}
        expenses={allExpenses}
        onCancel={() => setMode({ kind: 'list' })}
        onCreate={async (draft) => {
          // Persist the invoice BEFORE the builder stamps on-charged expenses,
          // so a failed insert can't strand an expense against a missing invoice.
          await db.invoices.add(draft);
          setMode({ kind: 'edit', id: draft.invoiceId });
        }}
      />
    );
  }

  if (mode.kind === 'edit') {
    // key by id so the editor's init-once local state always remounts fresh per invoice
    return <InvoiceEditor key={mode.id} invoiceId={mode.id} onBack={() => setMode({ kind: 'list' })} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Money</h1>
        <button
          type="button"
          onClick={() => setMode({ kind: 'new' })}
          className="ml-auto flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
        >
          <FilePlus2 className="h-4 w-4" aria-hidden /> New invoice
        </button>
      </div>

      <div className="-mt-2 flex flex-wrap gap-6 border-b border-line" role="tablist" aria-label="Money views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-money-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="money-panel"
            onClick={() => setTab(t.id)}
            className={`inline-flex min-h-11 cursor-pointer items-center border-b-2 pb-2 transition-colors duration-200 ${
              tab === t.id ? 'border-ink font-bold' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        id="money-panel"
        role="tabpanel"
        aria-labelledby={`tab-money-${tab}`}
        tabIndex={0}
        className="flex flex-col gap-6"
      >
        {tab === 'expenses' ? (
          <ExpensesTab firm={firm} expenses={allExpenses} invoices={invoices} />
        ) : (
          <>
        <ReceivablesStrip
          summary={receivables}
          currency={currency}
          selectedId={activeBucket?.id ?? null}
          onSelect={(id) => setAgingFilter((cur) => (cur === id ? null : id))}
        />

        <div className="flex items-start gap-3 border border-line bg-neutral-50 p-3 text-ink-soft">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Bill straight from the hours your team already logged. Pick a project and a period, and the tracked time becomes
            editable invoice lines — print to PDF or export for QuickBooks.
            {!ratesReady && (
              <>
                {' '}
                <span className="text-ink">Set your billing rates in <span className="font-bold">Setup → Billing rates</span> first</span>{' '}
                so amounts fill in automatically.
              </>
            )}
          </p>
        </div>

        {invoices.length === 0 ? (
          <div className="flex flex-col items-start gap-3 border border-dashed border-line p-8">
            <p className="font-bold">No invoices yet.</p>
            <p className="text-ink-soft">Create your first invoice from this month's billable hours.</p>
            <button
              type="button"
              onClick={() => setMode({ kind: 'new' })}
              className="flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
            >
              <FilePlus2 className="h-4 w-4" aria-hidden /> New invoice
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-ink text-left">
                  <th scope="col" className="py-2 pr-4 font-bold">Invoice</th>
                  <th scope="col" className="py-2 pr-4 font-bold">Client / project</th>
                  <th scope="col" className="py-2 pr-4 font-bold">Period</th>
                  <th scope="col" className="py-2 pr-4 font-bold">Issued</th>
                  <th scope="col" className="py-2 pr-4 font-bold">Status</th>
                  <th scope="col" className="py-2 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {visibleInvoices.map((inv) => {
                  const t = invoiceTotals(inv);
                  return (
                    <tr
                      key={inv.invoiceId}
                      tabIndex={0}
                      onClick={() => setMode({ kind: 'edit', id: inv.invoiceId })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setMode({ kind: 'edit', id: inv.invoiceId });
                        }
                      }}
                      className="min-h-11 cursor-pointer border-b border-line transition-colors duration-200 hover:bg-neutral-50"
                    >
                      <td className="py-2 pr-4 font-bold">{inv.invoiceNumber}</td>
                      <td className="py-2 pr-4">
                        {inv.clientName || inv.projectName}
                        {inv.clientName && <span className="block text-ink-soft">{inv.projectName}</span>}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-ink-soft">
                        {monthDayLabel(inv.periodStart)} – {monthDayLabel(inv.periodEnd)}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-ink-soft">{monthDayLabel(inv.issueDate)}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-block px-2 py-0.5 ${STATUS_STYLE[inv.status]}`}>
                          {inv.status[0].toUpperCase() + inv.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums font-bold">{fmtMoney(t.total, inv.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
