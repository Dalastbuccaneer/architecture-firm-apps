// One person's pay setup: employment type, start date, base salary, allowance
// and deduction rows, and their documents (anything with an expiry date also
// shows in Renewals). Local state is authoritative for stable typing; every
// change also fire-and-forget persists to the hr table — no Save button to
// forget (same pattern as the invoice editor).

import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { db } from '../../db';
import type { EosbRule, HrRecord, PayItem, Person } from '../../types';
import { fmtMoney } from '../../lib/rates';
import { emptyHrRecord, eosbLiability, payItemsTotal, yearsOfService } from '../../lib/hr';
import { todayISO } from '../../lib/dates';
import { NumField, TextField } from '../invoice/fields';

const round2 = (n: number): number => Math.round(n * 100) / 100;

function PayItemRows({
  items,
  kindLabel,
  personName,
  onChange,
}: {
  items: PayItem[];
  kindLabel: 'allowance' | 'deduction';
  personName: string;
  onChange: (next: PayItem[]) => void;
}) {
  const patch = (i: number, p: Partial<PayItem>) => onChange(items.map((it, k) => (k === i ? { ...it, ...p } : it)));
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <TextField
            value={item.label}
            onCommit={(v) => patch(i, { label: v })}
            ariaLabel={`${personName} ${kindLabel} ${i + 1} label`}
            placeholder={kindLabel === 'allowance' ? 'e.g. Housing' : 'e.g. Social insurance'}
            className="w-48 flex-1"
          />
          <NumField
            value={item.amount}
            onCommit={(n) => patch(i, { amount: n })}
            ariaLabel={`${personName} ${kindLabel} ${i + 1} amount`}
            className="w-28 text-right"
          />
          <button
            type="button"
            aria-label={`Remove ${kindLabel} ${item.label || i + 1} for ${personName}`}
            onClick={() => onChange(items.filter((_, k) => k !== i))}
            className="flex h-11 cursor-pointer items-center gap-1 px-2 text-ink-soft transition-colors duration-200 hover:text-alert"
          >
            <X className="h-4 w-4" aria-hidden /> Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { label: '', amount: 0 }])}
        className="flex min-h-11 w-fit cursor-pointer items-center gap-1 py-1 text-ink-soft transition-colors duration-200 hover:text-ink"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add {kindLabel}
      </button>
    </div>
  );
}

export default function PersonPayCard({
  person,
  record,
  currency,
  eosbRule,
}: {
  person: Person;
  record: HrRecord | undefined;
  currency: string;
  eosbRule: EosbRule;
}) {
  const [open, setOpen] = useState(false);
  // Local copy is authoritative while the card is open (created lazily for a
  // person who has no record yet); every write goes straight to the hr table.
  const [draft, setDraft] = useState<HrRecord | null>(null);
  const hr = draft ?? record ?? emptyHrRecord(person.personId);

  const write = (next: HrRecord) => {
    setDraft(next);
    void db.hr.put(next);
  };
  const patch = (p: Partial<HrRecord>) => write({ ...hr, ...p });

  const allowances = payItemsTotal(hr.allowances);
  const deductions = payItemsTotal(hr.deductions);
  const net = round2(hr.baseSalary + allowances - deductions);
  const contractor = hr.employmentType === 'contractor';
  const years = yearsOfService(hr.startDate, todayISO());
  const eosb = eosbLiability(eosbRule, hr.baseSalary, years);
  const hasPay = record !== undefined || draft !== null;

  return (
    <div className="border border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Edit pay for ${person.name}`}
        className="flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 p-3 text-left transition-colors duration-200 hover:bg-neutral-50"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
        )}
        <span className="font-bold">{person.name}</span>
        <span className="text-ink-soft">
          {contractor ? 'Contractor' : 'Employee'}
          {!person.active && ' · not active'}
        </span>
        <span className="ml-auto tabular-nums">
          {hasPay ? (
            <>
              <span className="font-bold">{fmtMoney(net, currency)}</span>
              <span className="text-ink-soft"> / month</span>
            </>
          ) : (
            <span className="text-ink-soft">No pay set — click to set up</span>
          )}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-5 border-t border-line p-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Works as</span>
              <select
                value={hr.employmentType}
                onChange={(e) => patch({ employmentType: e.target.value as HrRecord['employmentType'] })}
                aria-label={`${person.name} works as`}
                className="h-11 cursor-pointer border border-line px-2"
              >
                <option value="employee">Employee</option>
                <option value="contractor">Contractor</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Start date</span>
              <input
                type="date"
                value={hr.startDate}
                onChange={(e) => e.target.value && patch({ startDate: e.target.value })}
                aria-label={`${person.name} start date`}
                className="h-11 border border-line px-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-soft">Base pay per month ({currency})</span>
              <NumField
                value={hr.baseSalary}
                onCommit={(n) => patch({ baseSalary: n })}
                ariaLabel={`${person.name} base salary per month`}
                className="w-36 text-right"
              />
            </label>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 font-bold">Allowances</h3>
              <p className="mb-2 text-ink-soft">Paid on top of base pay — housing, transport…</p>
              <PayItemRows
                items={hr.allowances}
                kindLabel="allowance"
                personName={person.name}
                onChange={(next) => patch({ allowances: next })}
              />
            </div>
            <div>
              <h3 className="mb-2 font-bold">Deductions</h3>
              <p className="mb-2 text-ink-soft">Taken out each month — social insurance, loans…</p>
              <PayItemRows
                items={hr.deductions}
                kindLabel="deduction"
                personName={person.name}
                onChange={(next) => patch({ deductions: next })}
              />
            </div>
          </div>

          <p className="border border-line bg-neutral-50 p-3">
            Each month: {fmtMoney(hr.baseSalary, currency)} base
            {allowances > 0 && <> + {fmtMoney(allowances, currency)} allowances</>}
            {deductions > 0 && <> − {fmtMoney(deductions, currency)} deductions</>} ={' '}
            <span className="font-bold">{fmtMoney(net, currency)} take-home</span>
          </p>

          {!contractor && (
            <p className="text-ink-soft">
              End-of-service owed today: <span className="font-bold text-ink">{fmtMoney(eosb, currency)}</span> —{' '}
              {years < 0.05 ? 'just started' : `${round2(years)} years of service`}. Rule and math below.
            </p>
          )}

          <div>
            <h3 className="mb-2 font-bold">Documents</h3>
            <p className="mb-2 text-ink-soft">
              Passport, visa or permit, medical insurance card, professional license… Anything given an expiry date
              also appears under Renewals so it can't sneak up on you.
            </p>
            <div className="flex flex-col gap-2">
              {hr.documents.map((doc, i) => (
                <div key={doc.id} className="flex flex-wrap items-end gap-2 border border-line p-2">
                  <label className="flex min-w-40 flex-1 flex-col gap-1">
                    <span className="text-ink-soft">What</span>
                    <TextField
                      value={doc.label}
                      onCommit={(v) =>
                        patch({ documents: hr.documents.map((d, k) => (k === i ? { ...d, label: v } : d)) })
                      }
                      ariaLabel={`${person.name} document ${i + 1} label`}
                      placeholder="e.g. Medical insurance"
                      className="w-full"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-ink-soft">Number</span>
                    <TextField
                      value={doc.number ?? ''}
                      onCommit={(v) =>
                        patch({ documents: hr.documents.map((d, k) => (k === i ? { ...d, number: v || undefined } : d)) })
                      }
                      ariaLabel={`${person.name} document ${i + 1} number`}
                      className="w-36"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-ink-soft">Expires</span>
                    <input
                      type="date"
                      value={doc.expiryDate ?? ''}
                      onChange={(e) =>
                        patch({
                          documents: hr.documents.map((d, k) =>
                            k === i ? { ...d, expiryDate: e.target.value || undefined } : d,
                          ),
                        })
                      }
                      aria-label={`${person.name} document ${i + 1} expiry date`}
                      className="h-11 border border-line px-2"
                    />
                  </label>
                  <label className="flex min-w-32 flex-1 flex-col gap-1">
                    <span className="text-ink-soft">Note</span>
                    <TextField
                      value={doc.note ?? ''}
                      onCommit={(v) =>
                        patch({ documents: hr.documents.map((d, k) => (k === i ? { ...d, note: v || undefined } : d)) })
                      }
                      ariaLabel={`${person.name} document ${i + 1} note`}
                      className="w-full"
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove document ${doc.label || i + 1} for ${person.name}`}
                    onClick={() => {
                      if (window.confirm(`Remove "${doc.label || 'this document'}" from ${person.name}?`)) {
                        patch({ documents: hr.documents.filter((_, k) => k !== i) });
                      }
                    }}
                    className="flex h-11 cursor-pointer items-center gap-1 px-2 text-ink-soft transition-colors duration-200 hover:text-alert"
                  >
                    <X className="h-4 w-4" aria-hidden /> Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  patch({ documents: [...hr.documents, { id: crypto.randomUUID(), label: '' }] })
                }
                className="flex min-h-11 w-fit cursor-pointer items-center gap-1 py-1 text-ink-soft transition-colors duration-200 hover:text-ink"
              >
                <Plus className="h-4 w-4" aria-hidden /> Add document
              </button>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Notes</span>
            <textarea
              value={hr.notes ?? ''}
              onChange={(e) => patch({ notes: e.target.value || undefined })}
              rows={2}
              aria-label={`${person.name} pay notes`}
              placeholder="Anything worth remembering — contract terms, review dates…"
              className="border border-line px-2 py-1.5"
            />
          </label>
        </div>
      )}
    </div>
  );
}
