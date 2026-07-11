// People → Renewals (managers only — gated in screens/People.tsx). ONE list of
// everything with an expiry date: firm-level insurances / licenses /
// registrations / subscriptions, person-level items, AND every person document
// (from Pay) that carries an expiry date — those rows are read-only here and
// say where to edit them. Status is icon + words + color on every row; color
// is never the only signal. Deleting is double-confirmed.

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Pencil, Plus, TriangleAlert, X } from 'lucide-react';
import { db } from '../../db';
import type { FirmFile, Renewal, RenewalCategory } from '../../types';
import {
  DEFAULT_REMINDER_DAYS,
  newRenewal,
  renewalRows,
  renewalStatusWords,
  type RenewalRow,
} from '../../lib/hr';
import { monthDayLabel, todayISO } from '../../lib/dates';
import { NumField } from '../invoice/fields';

const CATEGORY_LABEL: Record<RenewalCategory, string> = {
  insurance: 'Insurance',
  license: 'License',
  registration: 'Registration',
  subscription: 'Subscription',
  other: 'Other',
};

function StatusCell({ row }: { row: RenewalRow }) {
  const words = renewalStatusWords(row.status);
  if (row.status.state === 'overdue') {
    return (
      <span className="flex items-center gap-1 font-bold text-alert">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden /> {words}
      </span>
    );
  }
  if (row.status.state === 'due') {
    return (
      <span className="flex items-center gap-1 font-bold text-warn">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden /> {words}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-ok">
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> {words}
    </span>
  );
}

interface FormState {
  label: string;
  who: string; // 'firm' or a personId
  category: RenewalCategory;
  expiryDate: string;
  reminderDays: number;
  note: string;
}

const emptyForm = (): FormState => ({
  label: '',
  who: 'firm',
  category: 'insurance',
  expiryDate: '',
  reminderDays: DEFAULT_REMINDER_DAYS,
  note: '',
});

export default function RenewalsTab({ firm }: { firm: FirmFile }) {
  const renewals = useLiveQuery(() => db.renewals.toArray(), []) ?? [];
  const hrRecords = useLiveQuery(() => db.hr.toArray(), []) ?? [];
  const today = todayISO();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');

  const peopleById = new Map(firm.people.map((p) => [p.personId, p.name]));
  const rows = renewalRows(renewals, hrRecords, peopleById, today);

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  const save = () => {
    if (!form.label.trim()) {
      setError('Give it a name — e.g. "Professional indemnity insurance".');
      return;
    }
    if (!form.expiryDate) {
      setError('Pick the expiry date.');
      return;
    }
    setError('');
    const base = {
      scope: (form.who === 'firm' ? 'firm' : 'person') as Renewal['scope'],
      personId: form.who === 'firm' ? undefined : form.who,
      label: form.label.trim(),
      category: form.category,
      expiryDate: form.expiryDate,
      reminderDays: form.reminderDays,
      note: form.note.trim() || undefined,
    };
    if (editingId) {
      const existing = renewals.find((r) => r.id === editingId);
      if (existing) void db.renewals.put({ ...existing, ...base });
    } else {
      void db.renewals.add(newRenewal(base));
    }
    setEditingId(null);
    setForm(emptyForm());
  };

  const startEdit = (r: Renewal) => {
    setEditingId(r.id);
    setError('');
    setForm({
      label: r.label,
      who: r.scope === 'person' && r.personId ? r.personId : 'firm',
      category: r.category,
      expiryDate: r.expiryDate,
      reminderDays: r.reminderDays,
      note: r.note ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError('');
    setForm(emptyForm());
  };

  const del = (r: Renewal) => {
    if (!window.confirm(`Delete "${r.label}" from the renewals list?`)) return;
    if (!window.confirm(`Really delete "${r.label}"? Nothing will remind you about it any more. This can't be undone.`)) return;
    if (editingId === r.id) cancelEdit();
    void db.renewals.delete(r.id);
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-soft">
        Everything with an expiry date, in one list — the firm's insurances, registrations and subscriptions, plus
        each person's documents from Pay. The Dashboard shows what's coming up.
      </p>

      {/* add / edit form */}
      <div className="border border-line p-4">
        <h3 className="mb-3 font-bold">{editingId ? 'Edit renewal' : 'Add a renewal'}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-52 flex-1 flex-col gap-1">
            <span className="text-ink-soft">What</span>
            <input
              value={form.label}
              onChange={(e) => patch({ label: e.target.value })}
              aria-label="Renewal name"
              placeholder="e.g. Professional indemnity insurance"
              className="h-11 border border-line px-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">For</span>
            <select
              value={form.who}
              onChange={(e) => patch({ who: e.target.value })}
              aria-label="Renewal is for"
              className="h-11 cursor-pointer border border-line px-2"
            >
              <option value="firm">Whole firm</option>
              {firm.people.map((p) => (
                <option key={p.personId} value={p.personId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Kind</span>
            <select
              value={form.category}
              onChange={(e) => patch({ category: e.target.value as RenewalCategory })}
              aria-label="Renewal kind"
              className="h-11 cursor-pointer border border-line px-2"
            >
              {(Object.keys(CATEGORY_LABEL) as RenewalCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Expires</span>
            <input
              type="date"
              value={form.expiryDate}
              onChange={(e) => patch({ expiryDate: e.target.value })}
              aria-label="Renewal expiry date"
              className="h-11 border border-line px-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Remind me (days ahead)</span>
            <NumField
              value={form.reminderDays}
              onCommit={(n) => patch({ reminderDays: Math.round(n) })}
              ariaLabel="Remind me this many days ahead"
              className="w-24 text-right"
            />
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1">
            <span className="text-ink-soft">Note</span>
            <input
              value={form.note}
              onChange={(e) => patch({ note: e.target.value })}
              aria-label="Renewal note"
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
              <Plus className="h-4 w-4" aria-hidden /> {editingId ? 'Save changes' : 'Add renewal'}
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

      {/* the register */}
      {rows.length === 0 ? (
        <p className="border border-dashed border-line p-6 text-ink-soft">
          Nothing to watch yet. Add the firm's insurance and registrations above — and give each person's documents an
          expiry date in Pay to see them here automatically.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-ink text-left">
                <th scope="col" className="py-2 pr-4 font-bold">Status</th>
                <th scope="col" className="py-2 pr-4 font-bold">What</th>
                <th scope="col" className="py-2 pr-4 font-bold">For</th>
                <th scope="col" className="py-2 pr-4 font-bold">Kind</th>
                <th scope="col" className="py-2 pr-4 font-bold">Expires</th>
                <th scope="col" className="py-2 pr-4 font-bold">Note</th>
                <th scope="col" className="py-2" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line align-middle">
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <StatusCell row={row} />
                  </td>
                  <td className="py-2 pr-4 font-bold">{row.label || '(unnamed)'}</td>
                  <td className="py-2 pr-4">{row.whoLabel}</td>
                  <td className="py-2 pr-4 text-ink-soft">
                    {row.source === 'document' ? 'Document' : CATEGORY_LABEL[row.category as RenewalCategory] ?? row.category}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap tabular-nums">
                    {monthDayLabel(row.expiryDate)}, {row.expiryDate.slice(0, 4)}
                  </td>
                  <td className="py-2 pr-4 text-ink-soft">{row.note}</td>
                  <td className="py-2">
                    {row.source === 'renewal' && row.renewal ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          aria-label={`Edit ${row.label}`}
                          onClick={() => startEdit(row.renewal!)}
                          className="flex h-11 cursor-pointer items-center gap-1 px-2 text-ink-soft transition-colors duration-200 hover:text-ink"
                        >
                          <Pencil className="h-4 w-4" aria-hidden /> Edit
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${row.label}`}
                          onClick={() => del(row.renewal!)}
                          className="flex h-11 cursor-pointer items-center gap-1 px-2 text-ink-soft transition-colors duration-200 hover:text-alert"
                        >
                          <X className="h-4 w-4" aria-hidden /> Delete
                        </button>
                      </div>
                    ) : (
                      <span className="block text-right text-ink-soft">from Pay — edit on the person</span>
                    )}
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
