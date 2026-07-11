// People → Leave (managers only — gated in screens/People.tsx). Per employee:
// the yearly entitlement, what's been taken, and a big remaining number, with
// the same HBar visual the Dashboard uses (text always present — color is
// never the only signal). Only ANNUAL leave draws the entitlement down; sick
// and unpaid days are recorded but never subtracted, and the caption says so.

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import type { FirmFile, HrRecord, LeaveType, Person } from '../../types';
import { emptyHrRecord, leaveSummary } from '../../lib/hr';
import { monthDayLabel, todayISO } from '../../lib/dates';
import { uid } from '../../lib/seeds';
import { HBar } from '../dashboard/Bar';
import { NumField } from '../invoice/fields';

const TYPE_LABEL: Record<LeaveType, string> = { annual: 'annual', sick: 'sick', unpaid: 'unpaid' };

function LeaveCard({ person, record, year }: { person: Person; record: HrRecord | undefined; year: string }) {
  // Local draft is authoritative once edited (created lazily); every change
  // persists straight to the hr table — same pattern as PersonPayCard.
  const [draft, setDraft] = useState<HrRecord | null>(null);
  const hr = draft ?? record ?? emptyHrRecord(person.personId);
  const write = (next: HrRecord) => {
    setDraft(next);
    void db.hr.put(next);
  };

  const [date, setDate] = useState(todayISO());
  const [days, setDays] = useState(1);
  const [type, setType] = useState<LeaveType>('annual');
  const [note, setNote] = useState('');

  const s = leaveSummary(hr, year);
  const over = s.remaining < 0;

  const addEntry = () => {
    if (days <= 0) {
      window.alert('Days must be more than 0 (half days like 0.5 are fine).');
      return;
    }
    write({
      ...hr,
      leaveLedger: [...hr.leaveLedger, { id: uid(), date, days, type, note: note.trim() || undefined }],
    });
    setDays(1);
    setNote('');
  };

  const removeEntry = (id: string) => {
    const entry = hr.leaveLedger.find((e) => e.id === id);
    if (!entry) return;
    if (window.confirm(`Remove ${entry.days} ${TYPE_LABEL[entry.type]} ${entry.days === 1 ? 'day' : 'days'} on ${monthDayLabel(entry.date)} for ${person.name}?`)) {
      write({ ...hr, leaveLedger: hr.leaveLedger.filter((e) => e.id !== id) });
    }
  };

  const entries = [...hr.leaveLedger].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="border border-line p-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 className="font-bold">{person.name}</h3>
        <span className={`text-2xl font-bold ${over ? 'text-alert' : ''}`}>
          {over ? `${Math.abs(s.remaining)} days over` : `${s.remaining} days left`}
        </span>
        <label className="ml-auto flex items-center gap-2">
          <span className="text-ink-soft">Days per year</span>
          <NumField
            value={hr.leaveAnnualDays}
            onCommit={(n) => write({ ...hr, leaveAnnualDays: n })}
            ariaLabel={`${person.name} annual leave days per year`}
            className="w-20 text-right"
          />
        </label>
      </div>

      <div className="mt-3">
        <HBar
          label="Annual leave used"
          valueLabel={`${s.annualTaken} of ${s.entitlement} days`}
          ratio={s.entitlement > 0 ? s.annualTaken / s.entitlement : 0}
          colorClass={over ? 'bg-alert' : 'bg-ink'}
        />
        <p className="mt-1 text-ink-soft">
          Also this year: {s.sickTaken} sick, {s.unpaidTaken} unpaid — recorded, but they don't reduce the {s.entitlement} days.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">First day</span>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label={`Leave date for ${person.name}`}
            className="h-11 border border-line px-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Days</span>
          <NumField
            value={days}
            onCommit={setDays}
            ariaLabel={`Leave days for ${person.name}`}
            className="w-20 text-right"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Kind</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as LeaveType)}
            aria-label={`Leave kind for ${person.name}`}
            className="h-11 cursor-pointer border border-line px-2"
          >
            <option value="annual">Annual</option>
            <option value="sick">Sick</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1">
          <span className="text-ink-soft">Note</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label={`Leave note for ${person.name}`}
            placeholder="optional"
            className="h-11 border border-line px-2"
          />
        </label>
        <button
          type="button"
          aria-label={`Add leave for ${person.name}`}
          onClick={addEntry}
          className="flex min-h-11 cursor-pointer items-center gap-1 border border-line px-4 py-2 transition-colors duration-200 hover:border-ink"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add leave
        </button>
      </div>

      {entries.length > 0 && (
        <div className="mt-4 flex flex-col">
          {entries.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-0 border-t border-line py-1">
              <span className="tabular-nums">{monthDayLabel(e.date)}, {e.date.slice(0, 4)}</span>
              <span className="font-bold">
                {e.days} {e.days === 1 ? 'day' : 'days'} {TYPE_LABEL[e.type]}
              </span>
              {e.note && <span className="text-ink-soft">{e.note}</span>}
              {!e.date.startsWith(`${year}-`) && <span className="text-ink-soft">(not this year)</span>}
              <button
                type="button"
                aria-label={`Remove leave entry on ${e.date} for ${person.name}`}
                onClick={() => removeEntry(e.id)}
                className="ml-auto flex h-11 cursor-pointer items-center gap-1 px-2 text-ink-soft transition-colors duration-200 hover:text-alert"
              >
                <X className="h-4 w-4" aria-hidden /> Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LeaveTab({ firm }: { firm: FirmFile }) {
  const hrRecords = useLiveQuery(() => db.hr.toArray(), []) ?? [];
  const year = todayISO().slice(0, 4);
  const hrByPerson = new Map(hrRecords.map((r) => [r.personId, r] as [string, HrRecord]));

  // Employees only — contractors don't carry a leave entitlement here.
  const people = firm.people.filter(
    (p) => p.active && (hrByPerson.get(p.personId)?.employmentType ?? 'employee') === 'employee',
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-soft">
        Balances for {year}. Only <span className="font-bold text-ink">annual</span> leave counts against each
        person's days — sick and unpaid leave are written down but never subtracted. Contractors aren't listed.
      </p>
      {people.length === 0 ? (
        <p className="border border-dashed border-line p-6 text-ink-soft">No active employees to show.</p>
      ) : (
        people.map((p) => <LeaveCard key={p.personId} person={p} record={hrByPerson.get(p.personId)} year={year} />)
      )}
    </div>
  );
}
