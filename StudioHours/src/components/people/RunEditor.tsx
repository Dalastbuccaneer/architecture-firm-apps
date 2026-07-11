// Edit one payroll run. Prefilled from each person's pay setup, but the stored
// numbers on each line are authoritative once here (invoice philosophy) —
// adjust any amount before saving. Take-home (net) is always gross − deductions,
// recomputed on every edit. Local state is authoritative for stable typing and
// every change persists immediately (same pattern as InvoiceEditor).

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, FileText, Plus, Trash2, X } from 'lucide-react';
import { db } from '../../db';
import type { FirmFile, HrRecord, PayrollLine, PayrollRun } from '../../types';
import { fmtMoney } from '../../lib/rates';
import { emptyHrRecord, lineBasePay, lineWithNet, monthLabel, payrollLineFor, runTotals } from '../../lib/hr';
import { monthDayLabel, nowISO, todayISO } from '../../lib/dates';
import { NumField, TextField } from '../invoice/fields';

const round2 = (n: number): number => Math.round(n * 100) / 100;

export default function RunEditor({
  runId,
  firm,
  hrByPerson,
  currency,
  notice,
  onBack,
  onPayslip,
}: {
  runId: string;
  firm: FirmFile;
  hrByPerson: Map<string, HrRecord>;
  currency: string;
  notice?: string;
  onBack: () => void;
  onPayslip: (personId: string) => void;
}) {
  const loaded = useLiveQuery(() => db.payrollRuns.get(runId), [runId]);
  const [run, setRun] = useState<PayrollRun | null>(null);

  // Seed local state from the DB; re-sync only if the stored row is newer
  // (e.g. edited in another tab) — our own autosaves carry the same updatedAt.
  useEffect(() => {
    if (loaded && (!run || loaded.updatedAt > run.updatedAt)) setRun(loaded);
  }, [loaded, run]);

  if (loaded === undefined) return null; // still loading
  if (loaded === null || !run) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-ink-soft">This payroll run no longer exists.</p>
        <button type="button" onClick={onBack} className="min-h-11 w-fit cursor-pointer border border-line px-4 py-2 hover:border-ink">
          Back to Pay
        </button>
      </div>
    );
  }

  const write = (next: PayrollRun) => {
    setRun(next);
    void db.payrollRuns.put(next);
  };
  const patchLine = (personId: string, p: Partial<PayrollLine>) =>
    write({
      ...run,
      lines: run.lines.map((l) => (l.personId === personId ? lineWithNet({ ...l, ...p }) : l)),
      updatedAt: nowISO(),
    });

  // Base and allowances are two slices of gross: editing either keeps the other
  // constant and re-derives gross; net always re-derives from gross − deductions.
  const editBase = (l: PayrollLine, base: number) => patchLine(l.personId, { gross: round2(base + l.allowances) });
  const editAllowances = (l: PayrollLine, allowances: number) =>
    patchLine(l.personId, { allowances, gross: round2(lineBasePay(l) + allowances) });
  const editDeductions = (l: PayrollLine, deductions: number) => patchLine(l.personId, { deductions });

  const removeLine = (l: PayrollLine) => {
    if (window.confirm(`Take ${l.personName} off the ${monthLabel(run.month)} run?`)) {
      write({ ...run, lines: run.lines.filter((x) => x.personId !== l.personId), updatedAt: nowISO() });
    }
  };

  const addPerson = (personId: string) => {
    const person = firm.people.find((p) => p.personId === personId);
    if (!person || run.lines.some((l) => l.personId === personId)) return;
    const line = payrollLineFor(person, hrByPerson.get(personId) ?? emptyHrRecord(personId));
    write({ ...run, lines: [...run.lines, line], updatedAt: nowISO() });
  };

  const markPaid = () => {
    if (run.status === 'paid') return;
    if (window.confirm(`Mark the ${monthLabel(run.month)} payroll as paid? Today's date goes on the record.`)) {
      write({ ...run, status: 'paid', paidDate: todayISO(), updatedAt: nowISO() });
    }
  };
  const backToDraft = () => {
    if (run.status === 'draft') return;
    if (window.confirm(`Put the ${monthLabel(run.month)} payroll back to draft? Its paid date will be cleared.`)) {
      write({ ...run, status: 'draft', paidDate: undefined, updatedAt: nowISO() });
    }
  };
  const onDelete = () => {
    if (
      run.status === 'paid' &&
      !window.confirm(`This run is marked paid${run.paidDate ? ` (on ${monthDayLabel(run.paidDate)}, ${run.paidDate.slice(0, 4)})` : ''} — deleting it removes the record of that payment. Delete anyway?`)
    )
      return;
    if (!window.confirm(`Delete the ${monthLabel(run.month)} payroll run? This can't be undone.`)) return;
    void db.payrollRuns.delete(run.id).then(onBack);
  };

  const t = runTotals(run);
  const addable = firm.people.filter((p) => p.active && !run.lines.some((l) => l.personId === p.personId));
  const isContractor = (personId: string) => hrByPerson.get(personId)?.employmentType === 'contractor';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-11 cursor-pointer items-center gap-2 border border-line px-3 py-1.5 transition-colors duration-200 hover:border-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Pay
        </button>
        <h2 className="font-bold">Payroll — {monthLabel(run.month)}</h2>

        <div className="flex items-center gap-1" role="group" aria-label="Run status">
          <button
            type="button"
            aria-pressed={run.status === 'draft'}
            onClick={backToDraft}
            className={`min-h-11 cursor-pointer border px-3 py-1.5 transition-colors duration-200 ${
              run.status === 'draft' ? 'border-ink bg-ink font-bold text-paper' : 'border-line text-ink-soft hover:border-ink hover:text-ink'
            }`}
          >
            Draft
          </button>
          <button
            type="button"
            aria-pressed={run.status === 'paid'}
            onClick={markPaid}
            className={`min-h-11 cursor-pointer border px-3 py-1.5 transition-colors duration-200 ${
              run.status === 'paid' ? 'border-ink bg-ink font-bold text-paper' : 'border-line text-ink-soft hover:border-ink hover:text-ink'
            }`}
          >
            {run.status === 'paid' ? 'Paid' : 'Mark paid'}
          </button>
        </div>
        {run.status === 'paid' && run.paidDate && (
          <span className="text-ok">Paid on {monthDayLabel(run.paidDate)}, {run.paidDate.slice(0, 4)}</span>
        )}

        <button
          type="button"
          aria-label={`Delete the ${monthLabel(run.month)} payroll run`}
          onClick={onDelete}
          className="ml-auto flex min-h-11 min-w-11 cursor-pointer items-center justify-center border border-line px-3 py-1.5 text-ink-soft transition-colors duration-200 hover:border-alert hover:text-alert"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {notice && (
        <p role="status" className="border border-warn bg-neutral-50 p-3">
          {notice}
        </p>
      )}

      <p className="text-ink-soft">
        Every amount below is editable — the saved numbers are what count. Take-home is always pay minus deductions.
      </p>

      {run.lines.length === 0 ? (
        <p className="border border-dashed border-line p-6 text-ink-soft">
          Nobody on this run yet. Add people below — employees you set a salary for are added automatically on new runs.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-ink text-left">
                <th scope="col" className="py-2 pr-3 font-bold">Person</th>
                <th scope="col" className="w-28 px-3 py-2 text-right font-bold">Base pay</th>
                <th scope="col" className="w-28 px-3 py-2 text-right font-bold">Allowances</th>
                <th scope="col" className="w-28 px-3 py-2 text-right font-bold">Deductions</th>
                <th scope="col" className="w-32 py-2 pl-3 text-right font-bold">Take-home ({currency})</th>
                <th scope="col" className="py-2 pl-4 font-bold">Note</th>
                <th scope="col" className="w-40 py-2" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {run.lines.map((l) => (
                <tr key={l.personId} className="border-b border-line align-middle">
                  <td className="py-1.5 pr-3">
                    <div className="font-bold">{l.personName}</div>
                    {isContractor(l.personId) && <div className="text-ink-soft">contractor</div>}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <NumField
                      value={lineBasePay(l)}
                      onCommit={(n) => editBase(l, n)}
                      ariaLabel={`${l.personName} base pay`}
                      className="w-24 text-right"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <NumField
                      value={l.allowances}
                      onCommit={(n) => editAllowances(l, n)}
                      ariaLabel={`${l.personName} allowances`}
                      className="w-24 text-right"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <NumField
                      value={l.deductions}
                      onCommit={(n) => editDeductions(l, n)}
                      ariaLabel={`${l.personName} deductions`}
                      className="w-24 text-right"
                    />
                  </td>
                  <td className="py-1.5 pl-3 text-right font-bold tabular-nums">{fmtMoney(l.net, currency)}</td>
                  <td className="py-1.5 pl-4">
                    <TextField
                      value={l.note ?? ''}
                      onCommit={(v) => patchLine(l.personId, { note: v || undefined })}
                      ariaLabel={`${l.personName} note`}
                      placeholder="optional"
                      className="w-32"
                    />
                  </td>
                  <td className="py-1.5 pl-2">
                    <div className="flex items-center justify-end gap-1">
                      {isContractor(l.personId) ? (
                        <span className="px-2 text-ink-soft">Payment record</span>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Payslip for ${l.personName}`}
                          onClick={() => onPayslip(l.personId)}
                          className="flex h-11 cursor-pointer items-center gap-1 border border-line px-2 transition-colors duration-200 hover:border-ink"
                        >
                          <FileText className="h-4 w-4" aria-hidden /> Payslip
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Remove ${l.personName} from this run`}
                        onClick={() => removeLine(l)}
                        className="flex h-11 cursor-pointer items-center px-2 text-ink-soft transition-colors duration-200 hover:text-alert"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addable.length > 0 && (
        <label className="flex w-fit flex-wrap items-center gap-2">
          <Plus className="h-4 w-4 text-ink-soft" aria-hidden />
          <span className="text-ink-soft">Add person to this run</span>
          <select
            value=""
            onChange={(e) => e.target.value && addPerson(e.target.value)}
            aria-label="Add person to this run"
            className="h-11 cursor-pointer border border-line px-2"
          >
            <option value="">Choose…</option>
            {addable.map((p) => (
              <option key={p.personId} value={p.personId}>
                {p.name}
                {isContractor(p.personId) ? ' (contractor)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex justify-end">
        <div className="w-full max-w-xs">
          <div className="flex items-center justify-between gap-4 border-b border-line py-1.5">
            <span className="text-ink-soft">Pay before deductions</span>
            <span className="tabular-nums">{fmtMoney(t.gross, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-line py-1.5">
            <span className="text-ink-soft">Deductions</span>
            <span className="tabular-nums">− {fmtMoney(t.deductions, currency)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 pt-3">
            <span className="font-bold">Take-home total</span>
            <span className="text-2xl font-bold tabular-nums">{fmtMoney(t.net, currency)}</span>
          </div>
          <div className="mt-1 text-right text-ink-soft">
            {t.people} {t.people === 1 ? 'person' : 'people'} on this run
          </div>
        </div>
      </div>

      <p className="text-ink-soft">
        This run is a record of what you paid — not a statutory payroll. Taxes, contributions and filings stay with
        your accountant.
      </p>
    </div>
  );
}
