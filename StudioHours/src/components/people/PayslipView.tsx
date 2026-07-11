// One person's payslip for one run — the same print pattern as the invoice
// editor: the toolbar is print:hidden, the document below is the printout
// (People.tsx hides the screen chrome on print). A payslip here is an internal
// record of pay, and says so in its footer — never a statutory document.

import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Printer } from 'lucide-react';
import { db } from '../../db';
import type { FirmFile, PayrollLine, PayrollRun } from '../../types';
import { fmtMoney } from '../../lib/rates';
import { lineBasePay, monthLabel } from '../../lib/hr';
import { monthDayLabel } from '../../lib/dates';

function Row({ label, value, soft }: { label: string; value: string; soft?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-2">
      <span className={soft ? 'text-ink-soft' : ''}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function PayslipDoc({
  firmName,
  run,
  line,
  currency,
}: {
  firmName: string;
  run: PayrollRun;
  line: PayrollLine;
  currency: string;
}) {
  return (
    <div
      data-tour="payslip-doc"
      className="mx-auto w-full max-w-2xl border border-line p-8 print:max-w-none print:border-0 print:p-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink pb-4">
        <div>
          <div className="text-2xl font-bold">{firmName}</div>
          <div className="mt-1 text-ink-soft">Payslip</div>
        </div>
        <div className="text-right">
          <div className="font-bold">{monthLabel(run.month)}</div>
          <div className="text-ink-soft">
            {run.status === 'paid' ? `Paid${run.paidDate ? ` on ${monthDayLabel(run.paidDate)}, ${run.paidDate.slice(0, 4)}` : ''}` : 'Draft — not yet paid'}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <span className="text-ink-soft">Paid to</span>
        <div className="text-2xl font-bold">{line.personName}</div>
      </div>

      <div className="mt-6">
        <Row label="Base salary" value={fmtMoney(lineBasePay(line), currency)} />
        <Row label="Allowances" value={`+ ${fmtMoney(line.allowances, currency)}`} />
        <Row label="Pay before deductions" value={fmtMoney(line.gross, currency)} soft />
        <Row label="Deductions" value={`− ${fmtMoney(line.deductions, currency)}`} />
        <div className="flex items-baseline justify-between gap-4 pt-4">
          <span className="font-bold">Net pay</span>
          <span className="text-2xl font-bold tabular-nums">{fmtMoney(line.net, currency)}</span>
        </div>
      </div>

      {line.note && (
        <p className="mt-6 border-t border-line pt-4">
          <span className="text-ink-soft">Note: </span>
          {line.note}
        </p>
      )}

      <p className="mt-10 border-t border-line pt-4 text-ink-soft">
        Not a statutory document — an internal record of pay kept with Studio Hours. Statutory payslips, taxes and
        filings remain with your accountant.
      </p>
    </div>
  );
}

export default function PayslipView({
  firm,
  runId,
  personId,
  currency,
  onBack,
}: {
  firm: FirmFile;
  runId: string;
  personId: string;
  currency: string;
  onBack: () => void;
}) {
  const run = useLiveQuery(() => db.payrollRuns.get(runId), [runId]);
  if (run === undefined) return null; // still loading
  const line = run?.lines.find((l) => l.personId === personId);
  if (!run || !line) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-ink-soft">This payslip no longer exists.</p>
        <button type="button" onClick={onBack} className="min-h-11 w-fit cursor-pointer border border-line px-4 py-2 hover:border-ink">
          Back to the run
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-11 cursor-pointer items-center gap-2 border border-line px-3 py-1.5 transition-colors duration-200 hover:border-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to {monthLabel(run.month)} run
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
        >
          <Printer className="h-4 w-4" aria-hidden /> Print / PDF
        </button>
      </div>
      <PayslipDoc firmName={firm.firm.firmName} run={run} line={line} currency={currency} />
    </div>
  );
}
