// Money → Expenses: the reimbursables ledger. One screen — an always-visible
// add form on top, the list below (newest first), month + project filters, a
// summary line, and a CSV download. Billed state is words on every row ("Not
// billed yet" / "On invoice INV-0012"), never color alone. Deleting is
// double-confirmed; deleting an already-billed expense warns that the invoice
// keeps its line (the invoice is the bill of record, this list is the ledger).

import { useState } from 'react';
import { CheckCircle2, Download, Pencil, Plus, TriangleAlert, X } from 'lucide-react';
import { db } from '../../db';
import type { Expense, ExpenseCategory, FirmFile, Invoice } from '../../types';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  expenseSummary,
  expensesCsvFilename,
  expensesToCsv,
  newExpense,
} from '../../lib/expenses';
import { firmRates, fmtMoney } from '../../lib/rates';
import { monthDayLabel, nowISO, todayISO } from '../../lib/dates';
import { downloadText } from '../../lib/download';
import { NumField } from './fields';

interface FormState {
  date: string;
  projectId: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  billable: boolean;
  markupPct: number;
  receiptNote: string;
}

const emptyForm = (): FormState => ({
  date: todayISO(),
  projectId: '',
  category: 'travel',
  description: '',
  amount: 0,
  billable: false,
  markupPct: 0,
  receiptNote: '',
});

function BilledCell({ e, invoiceNumber }: { e: Expense; invoiceNumber: string | undefined }) {
  if (e.invoiceId) {
    return (
      <span className="flex items-center gap-1 whitespace-nowrap text-ok">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> On invoice {invoiceNumber ?? '(deleted)'}
      </span>
    );
  }
  if (e.billable) {
    return (
      <span className="flex items-center gap-1 whitespace-nowrap font-bold text-warn">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden /> Not billed yet
      </span>
    );
  }
  return <span className="whitespace-nowrap text-ink-soft">Firm cost — client doesn't pay</span>;
}

export default function ExpensesTab({
  firm,
  expenses,
  invoices,
}: {
  firm: FirmFile;
  expenses: Expense[];
  invoices: Invoice[];
}) {
  const currency = firmRates(firm).currency || 'USD';
  const projects = firm.projects.filter((p) => p.status !== 'closed');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  const invoiceNumbers = new Map(invoices.map((inv) => [inv.invoiceId, inv.invoiceNumber]));
  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  const visible = expenses
    .filter((e) => (monthFilter ? e.date.startsWith(monthFilter) : true))
    .filter((e) => (projectFilter ? e.projectId === projectFilter : true))
    .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : a.createdAt > b.createdAt ? -1 : 1));
  const summary = expenseSummary(visible);

  const save = () => {
    const project = firm.projects.find((p) => p.projectId === form.projectId);
    if (!project) {
      setError('Pick which project this was for.');
      return;
    }
    if (!form.description.trim()) {
      setError('Say what it was — e.g. "Taxi to site" or "3 sets of drawings".');
      return;
    }
    if (!(form.amount > 0)) {
      setError('Enter what it cost.');
      return;
    }
    setError('');
    const base = {
      date: form.date || todayISO(),
      projectId: project.projectId,
      projectName: project.projectName,
      category: form.category,
      description: form.description.trim(),
      amount: form.amount,
      billable: form.billable,
      markupPct: form.billable && form.markupPct > 0 ? form.markupPct : undefined,
      receiptNote: form.receiptNote.trim() || undefined,
    };
    if (editingId) {
      const existing = expenses.find((e) => e.id === editingId);
      // keep the invoiceId stamp exactly as it was — editing the ledger row
      // never attaches or detaches it from an invoice
      if (existing) void db.expenses.put({ ...existing, ...base, updatedAt: nowISO() });
    } else {
      void db.expenses.add(newExpense(base));
    }
    setEditingId(null);
    setForm(emptyForm());
  };

  const startEdit = (e: Expense) => {
    setEditingId(e.id);
    setError('');
    setForm({
      date: e.date,
      projectId: e.projectId,
      category: e.category,
      description: e.description,
      amount: e.amount,
      billable: e.billable,
      markupPct: e.markupPct ?? 0,
      receiptNote: e.receiptNote ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError('');
    setForm(emptyForm());
  };

  const del = (e: Expense) => {
    if (e.invoiceId) {
      const num = invoiceNumbers.get(e.invoiceId) ?? '(deleted)';
      if (
        !window.confirm(
          `"${e.description}" is already on invoice ${num}. Deleting it here removes it from this list ONLY — invoice ${num} keeps its line and is not changed. Delete the expense record anyway?`,
        )
      )
        return;
    } else if (!window.confirm(`Delete "${e.description}" (${fmtMoney(e.amount, currency)})?`)) {
      return;
    }
    if (!window.confirm(`Really delete "${e.description}"? This can't be undone.`)) return;
    if (editingId === e.id) cancelEdit();
    void db.expenses.delete(e.id);
  };

  const downloadCsv = () => {
    // build content synchronously in the click handler (see lib/download)
    downloadText(expensesCsvFilename(firm.firm.firmName), expensesToCsv(visible, invoiceNumbers), 'text/csv');
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-soft">
        Project costs the firm paid for — travel, printing, permits, a consultant's bill. Tick{' '}
        <span className="font-bold">Client pays this back</span> and it will be offered as an extra line the next time you
        invoice that project.
      </p>

      {/* add / edit form — always visible */}
      <div className="border border-line p-4">
        <h3 className="mb-3 font-bold">{editingId ? 'Edit expense' : 'Add an expense'}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Date</span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => patch({ date: e.target.value || form.date })}
              aria-label="Expense date"
              className="h-11 border border-line px-2"
            />
          </label>
          <label className="flex min-w-48 flex-col gap-1">
            <span className="text-ink-soft">Project</span>
            <select
              value={form.projectId}
              onChange={(e) => patch({ projectId: e.target.value })}
              aria-label="Expense project"
              className="h-11 cursor-pointer border border-line px-2"
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.projectName}
                  {p.clientName ? ` — ${p.clientName}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Kind</span>
            <select
              value={form.category}
              onChange={(e) => patch({ category: e.target.value as ExpenseCategory })}
              aria-label="Expense kind"
              className="h-11 cursor-pointer border border-line px-2"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-52 flex-1 flex-col gap-1">
            <span className="text-ink-soft">What was it?</span>
            <input
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              aria-label="Expense description"
              placeholder="e.g. Taxi to site"
              className="h-11 border border-line px-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Amount ({currency})</span>
            <NumField
              value={form.amount}
              onCommit={(n) => patch({ amount: n })}
              ariaLabel="Expense amount"
              className="w-28 text-right"
            />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 pb-2">
            <input
              type="checkbox"
              checked={form.billable}
              onChange={(e) => patch({ billable: e.target.checked })}
              className="h-4 w-4 cursor-pointer accent-ink"
            />
            Client pays this back
          </label>
          {form.billable && (
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Add markup (%) — optional</span>
              <NumField
                value={form.markupPct}
                onCommit={(n) => patch({ markupPct: n })}
                ariaLabel="Markup percent"
                className="w-24 text-right"
              />
            </label>
          )}
          <label className="flex min-w-52 flex-1 flex-col gap-1">
            <span className="text-ink-soft">Receipt (where you filed it — e.g. Drive file name)</span>
            <input
              value={form.receiptNote}
              onChange={(e) => patch({ receiptNote: e.target.value })}
              aria-label="Receipt note"
              placeholder="optional"
              className="h-11 border border-line px-2"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              className="flex min-h-11 cursor-pointer items-center gap-1 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
            >
              <Plus className="h-4 w-4" aria-hidden /> {editingId ? 'Save changes' : 'Add expense'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="min-h-11 cursor-pointer border border-line px-4 py-2 transition-colors duration-200 hover:border-ink"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-2 font-bold text-alert">
            {error}
          </p>
        )}
      </div>

      {/* filters + summary + CSV */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Month</span>
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            aria-label="Filter by month"
            className="h-11 border border-line px-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Project</span>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            aria-label="Filter by project"
            className="h-11 cursor-pointer border border-line px-2"
          >
            <option value="">All projects</option>
            {firm.projects.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                {p.projectName}
              </option>
            ))}
          </select>
        </label>
        <p className="pb-2.5" data-tour="expense-summary">
          <span className="font-bold tabular-nums">{summary.count}</span> expense{summary.count === 1 ? '' : 's'} —{' '}
          <span className="font-bold tabular-nums">{fmtMoney(summary.total, currency)}</span> —{' '}
          <span className="font-bold tabular-nums">{fmtMoney(summary.unbilled, currency)}</span> not billed yet
        </p>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={visible.length === 0}
          className="ml-auto flex min-h-11 cursor-pointer items-center gap-2 border border-line px-3 py-1.5 transition-colors duration-200 hover:border-ink disabled:cursor-not-allowed disabled:text-ink-soft"
        >
          <Download className="h-4 w-4" aria-hidden /> Download expenses (CSV)
        </button>
      </div>

      {/* the ledger */}
      {expenses.length === 0 ? (
        <p className="border border-dashed border-line p-6 text-ink-soft">
          No expenses written down yet. Add the first one above — a taxi to site, a print run, a permit fee, a
          consultant's bill. Tick <span className="font-bold">Client pays this back</span> if it belongs on their next
          invoice.
        </p>
      ) : visible.length === 0 ? (
        <p className="border border-dashed border-line p-6 text-ink-soft">
          No expenses match these filters. Clear the month or project filter above to see everything again.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="border-b border-ink text-left">
                <th scope="col" className="py-2 pr-4 font-bold">Date</th>
                <th scope="col" className="py-2 pr-4 font-bold">Project</th>
                <th scope="col" className="py-2 pr-4 font-bold">Kind</th>
                <th scope="col" className="py-2 pr-4 font-bold">What</th>
                <th scope="col" className="py-2 pr-4 text-right font-bold">Amount</th>
                <th scope="col" className="py-2 pr-4 font-bold">Billed</th>
                <th scope="col" className="py-2" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id} className="border-b border-line align-middle">
                  <td className="py-2 pr-4 whitespace-nowrap tabular-nums">
                    {monthDayLabel(e.date)}, {e.date.slice(0, 4)}
                  </td>
                  <td className="py-2 pr-4">{e.projectName}</td>
                  <td className="py-2 pr-4 text-ink-soft">{EXPENSE_CATEGORY_LABEL[e.category] ?? e.category}</td>
                  <td className="py-2 pr-4">
                    {e.description}
                    {e.receiptNote && <span className="block text-ink-soft">Receipt: {e.receiptNote}</span>}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {fmtMoney(e.amount, currency)}
                    {e.billable && (e.markupPct ?? 0) > 0 && (
                      <span className="block text-ink-soft">+{e.markupPct}% markup</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <BilledCell e={e} invoiceNumber={e.invoiceId ? invoiceNumbers.get(e.invoiceId) : undefined} />
                  </td>
                  <td className="py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        aria-label={`Edit expense ${e.description}`}
                        onClick={() => startEdit(e)}
                        className="flex h-11 cursor-pointer items-center gap-1 px-2 text-ink-soft transition-colors duration-200 hover:text-ink"
                      >
                        <Pencil className="h-4 w-4" aria-hidden /> Edit
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete expense ${e.description}`}
                        onClick={() => del(e)}
                        className="flex h-11 cursor-pointer items-center gap-1 px-2 text-ink-soft transition-colors duration-200 hover:text-alert"
                      >
                        <X className="h-4 w-4" aria-hidden /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
