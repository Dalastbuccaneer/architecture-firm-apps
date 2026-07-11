// People → Pay (managers only — gated in screens/People.tsx). Three sections:
// each person's pay setup, the end-of-service savings rule, and payroll runs.
// A run is a RECORD of what was paid (payslips are internal documents, never
// statutory ones). All of it lives in the hr/payrollRuns tables + the eosbRule
// kv key — never in the firm file (confidentiality contract, types.ts).

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarPlus } from 'lucide-react';
import { db, kvGet, KV_EOSB_RULE } from '../../db';
import type { EosbRule, FirmFile, HrRecord, PayrollRunStatus } from '../../types';
import { firmRates, fmtMoney } from '../../lib/rates';
import { currentMonth, KSA_EOSB_PRESET, makePayrollRun, monthLabel, runTotals } from '../../lib/hr';
import { monthDayLabel } from '../../lib/dates';
import PersonPayCard from './PersonPayCard';
import EosbCard from './EosbCard';
import RunEditor from './RunEditor';
import PayslipView from './PayslipView';

type Mode =
  | { kind: 'setup' }
  | { kind: 'run'; id: string; notice?: string }
  | { kind: 'payslip'; runId: string; personId: string };

const STATUS_STYLE: Record<PayrollRunStatus, string> = {
  draft: 'border border-line text-ink-soft',
  paid: 'border border-ok text-ok',
};

export default function PayTab({ firm }: { firm: FirmFile }) {
  const hrRecords = useLiveQuery(() => db.hr.toArray(), []) ?? [];
  const runs = useLiveQuery(() => db.payrollRuns.orderBy('month').reverse().toArray(), []);
  const eosbRule = useLiveQuery(async () => (await kvGet<EosbRule>(KV_EOSB_RULE)) ?? KSA_EOSB_PRESET, []);
  const [mode, setMode] = useState<Mode>({ kind: 'setup' });
  const [month, setMonth] = useState(currentMonth);
  const [runningPayroll, setRunningPayroll] = useState(false);

  const currency = firmRates(firm).currency || 'USD';
  const hrByPerson = new Map(hrRecords.map((r) => [r.personId, r] as [string, HrRecord]));

  if (runs === undefined || eosbRule === undefined) return null; // still loading

  if (mode.kind === 'payslip') {
    return (
      <PayslipView
        firm={firm}
        runId={mode.runId}
        personId={mode.personId}
        currency={currency}
        onBack={() => setMode({ kind: 'run', id: mode.runId })}
      />
    );
  }

  if (mode.kind === 'run') {
    return (
      <RunEditor
        key={mode.id}
        runId={mode.id}
        firm={firm}
        hrByPerson={hrByPerson}
        currency={currency}
        notice={mode.notice}
        onBack={() => setMode({ kind: 'setup' })}
        onPayslip={(personId) => setMode({ kind: 'payslip', runId: mode.id, personId })}
      />
    );
  }

  // Guard: exactly one run per month. Running an existing month opens that run
  // (with a plain notice) instead of creating a duplicate. The `runningPayroll`
  // flag plus a FRESH db read (not the possibly-stale useLiveQuery `runs`) close
  // the double-click race that could otherwise add two runs for one month.
  const runPayroll = async () => {
    if (runningPayroll) return;
    setRunningPayroll(true);
    try {
      const existing = await db.payrollRuns.where('month').equals(month).first();
      if (existing) {
        setMode({
          kind: 'run',
          id: existing.id,
          notice: `Only one payroll run per month — this is the ${monthLabel(month)} run you already have.`,
        });
        return;
      }
      const run = makePayrollRun(month, firm.people, hrByPerson);
      await db.payrollRuns.add(run);
      setMode({ kind: 'run', id: run.id });
    } finally {
      setRunningPayroll(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      {/* 1 — per-person pay setup */}
      <section>
        <h2 className="font-bold">Salaries</h2>
        <p className="mb-4 mt-1 text-ink-soft">
          Set what each person is paid per month. Payroll runs below start from these numbers — you can still adjust
          any amount on the run itself.
        </p>
        <div className="flex flex-col gap-2">
          {firm.people.map((person) => (
            <PersonPayCard
              key={person.personId}
              person={person}
              record={hrByPerson.get(person.personId)}
              currency={currency}
              eosbRule={eosbRule}
            />
          ))}
        </div>
      </section>

      {/* 2 — end-of-service savings rule + firm liability */}
      <EosbCard firm={firm} rule={eosbRule} hrByPerson={hrByPerson} currency={currency} />

      {/* 3 — payroll runs */}
      <section>
        <h2 className="font-bold">Payroll</h2>
        <p className="mb-4 mt-1 text-ink-soft">
          One run per month: check the amounts, save, mark it paid. Each employee line prints a payslip — an internal
          record, not a statutory document.
        </p>
        <div className="flex flex-wrap items-end gap-3 border border-line p-4">
          <label className="flex flex-col gap-1">
            <span className="text-ink-soft">Month</span>
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              aria-label="Payroll month"
              className="h-11 border border-line px-2"
            />
          </label>
          <button
            type="button"
            onClick={() => void runPayroll()}
            disabled={runningPayroll}
            className="flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            <CalendarPlus className="h-4 w-4" aria-hidden />
            Run payroll for {monthLabel(month)}
          </button>
        </div>

        <h3 className="mb-3 mt-6 font-bold">Past runs</h3>
        {runs.length === 0 ? (
          <p className="text-ink-soft">No payroll yet — your first run will appear here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="border-b border-ink text-left">
                  <th scope="col" className="py-2 pr-4 font-bold">Month</th>
                  <th scope="col" className="py-2 pr-4 font-bold">People</th>
                  <th scope="col" className="py-2 pr-4 font-bold">Status</th>
                  <th scope="col" className="py-2 text-right font-bold">Take-home total</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const t = runTotals(run);
                  return (
                    <tr
                      key={run.id}
                      tabIndex={0}
                      onClick={() => setMode({ kind: 'run', id: run.id })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setMode({ kind: 'run', id: run.id });
                        }
                      }}
                      className="min-h-11 cursor-pointer border-b border-line transition-colors duration-200 hover:bg-neutral-50"
                    >
                      <td className="py-2 pr-4 font-bold">{monthLabel(run.month)}</td>
                      <td className="py-2 pr-4">{t.people}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-block px-2 py-0.5 ${STATUS_STYLE[run.status]}`}>
                          {run.status === 'paid' ? `Paid${run.paidDate ? ` on ${monthDayLabel(run.paidDate)}, ${run.paidDate.slice(0, 4)}` : ''}` : 'Draft'}
                        </span>
                      </td>
                      <td className="py-2 text-right font-bold tabular-nums">{fmtMoney(t.net, currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
