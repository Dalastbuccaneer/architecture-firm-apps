// The "new invoice" form: pick a project + period, see a live preview of what
// will bill, then create the draft. All the judgement calls (which hours count,
// at what rate — or what slice of each stage fee) are shown before the manager
// commits.
//
// Fixed-fee projects get a plain two-option mode choice: "Bill a percentage of
// the fee" (the monthly progress claim — default) or "Bill by the hour" (the
// pre-existing flow, typically for out-of-scope additional services). Hourly
// projects skip the choice entirely and go straight to the hourly flow — no
// disabled control to puzzle over.

import { useMemo, useState } from 'react';
import { FileText, Receipt, TriangleAlert } from 'lucide-react';
import type { Expense, FirmFile, Invoice, InvoiceGroupBy, TimeEntry } from '../../types';
import { db, nextInvoiceNumber } from '../../db';
import { buildLines, invoiceTotals, invoicedEntryIds, makeInvoice, selectEntries } from '../../lib/invoice';
import {
  buildClaimLines,
  claimedPctByPhase,
  makeClaimInvoice,
  stageFeeMismatch,
  validateClaims,
  type ClaimInput,
} from '../../lib/claims';
import { EXPENSE_CATEGORY_LABEL, expenseLine, onChargeAmount, unbilledBillableExpenses } from '../../lib/expenses';
import { firmRates, fmtMoney, hasAnyRate } from '../../lib/rates';
import { fromISODate, monthDayLabel, nowISO, todayISO, toISODate } from '../../lib/dates';

const round2 = (n: number): number => Math.round(n * 100) / 100;

function monthStart(iso: string): string {
  const d = fromISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}
function monthEnd(iso: string): string {
  const d = fromISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
function prevMonth(iso: string, which: 'start' | 'end'): string {
  const d = fromISODate(iso);
  const base = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return which === 'start' ? toISODate(base) : toISODate(new Date(base.getFullYear(), base.getMonth() + 1, 0));
}

const GROUP_LABELS: Record<InvoiceGroupBy, string> = {
  phase: 'By phase',
  person: 'By person',
  activity: 'By activity',
};

/** Which of the two billing modes the builder is in. Internal names only — the
 *  UI always says "Bill a percentage of the fee" / "Bill by the hour". */
type BillMode = 'claim' | 'time';

export default function InvoiceBuilder({
  firm,
  allEntries,
  invoices,
  expenses,
  onCreate,
  onCancel,
}: {
  firm: FirmFile;
  allEntries: TimeEntry[];
  invoices: Invoice[];
  expenses: Expense[];
  onCreate: (draft: Invoice) => void | Promise<void>;
  onCancel: () => void;
}) {
  const today = todayISO();
  const projects = firm.projects.filter((p) => p.status !== 'closed');
  const [projectId, setProjectId] = useState('');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(monthEnd(today));
  const [groupBy, setGroupBy] = useState<InvoiceGroupBy>('phase');
  const [includeBillable, setIncludeBillable] = useState(true);
  const [includeOutOfScope, setIncludeOutOfScope] = useState(true);
  const [mode, setMode] = useState<BillMode>('time');
  /** raw text per phaseId for the "Bill up to (%)" inputs — kept as strings so
   *  typing "62.5" never fights the caret */
  const [pctText, setPctText] = useState<Record<string, string>>({});
  /** expense ids the manager UN-ticked in the on-charge section. Stored as the
   *  exclusion set (default empty = everything ticked) so expenses that stream
   *  in from the live query after the project is picked start ticked too. */
  const [excludedExpenseIds, setExcludedExpenseIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const project = projects.find((p) => p.projectId === projectId);
  const rates = firmRates(firm);
  const ratesReady = hasAnyRate(rates);

  const selectProject = (id: string) => {
    setProjectId(id);
    const p = projects.find((x) => x.projectId === id);
    if (p) {
      // Hourly flow on fixed-fee projects usually invoices ONLY additional
      // services; on hourly projects it bills everything.
      setIncludeBillable(p.billingMethod === 'hourly');
      setIncludeOutOfScope(true);
      // Fixed-fee projects default to the progress-claim mode; hourly projects
      // have no fee to claim against, so the mode choice never appears for them.
      setMode(p.billingMethod === 'fixed_fee' ? 'claim' : 'time');
      // Prefill every stage with its current billed-to-date % (drafts included),
      // so "no change" is the starting point and typing a higher number IS the claim.
      const claimed = claimedPctByPhase(invoices, p.projectId);
      const seeded: Record<string, string> = {};
      for (const ph of p.phases) seeded[ph.phaseId] = String(round2(Math.min(100, Math.max(0, claimed.get(ph.phaseId) ?? 0))));
      setPctText(seeded);
      // every unbilled reimbursable starts ticked for the newly picked project
      setExcludedExpenseIds(new Set());
    }
  };

  // ---- reimbursable expenses waiting to be on-charged --------------------------
  // ALL unbilled billable expenses of the project, regardless of the invoice's
  // period — expenses aren't period-scoped like time entries (see lib/expenses).
  const unbilledExpenses = useMemo(
    () => (project ? unbilledBillableExpenses(expenses, project.projectId) : []),
    [expenses, project],
  );
  const includedExpenses = unbilledExpenses.filter((e) => !excludedExpenseIds.has(e.id));
  const waitingTotal = round2(unbilledExpenses.reduce((s, e) => s + onChargeAmount(e), 0));
  const toggleExpense = (id: string, include: boolean) =>
    setExcludedExpenseIds((cur) => {
      const next = new Set(cur);
      if (include) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Cumulative % already billed per stage — from ALL saved claim invoices of
   *  this project, drafts included (see claimedPctByPhase). */
  const claimedSoFar = useMemo(
    () => (project ? claimedPctByPhase(invoices, project.projectId) : new Map<string, number>()),
    [invoices, project],
  );

  // ---- live state of the percentage path --------------------------------------
  const claimState = useMemo(() => {
    if (!project || project.billingMethod !== 'fixed_fee') return null;
    const phases = [...project.phases].sort((a, b) => a.sequence - b.sequence);
    const inputs: ClaimInput[] = [];
    let invalidCount = 0;
    const parsed = phases.map((phase) => {
      const fee = phase.budgetedFee ?? 0;
      const prevPct = round2(Math.min(100, Math.max(0, claimedSoFar.get(phase.phaseId) ?? 0)));
      const raw = pctText[phase.phaseId] ?? '';
      const s = raw.trim().replace(',', '.');
      let invalid = false;
      let newPct: number | null = null; // null = leave this stage as it is
      if (s !== '') {
        const n = Number(s);
        if (Number.isFinite(n) && n >= 0) newPct = n;
        else {
          invalid = true;
          invalidCount++;
        }
      }
      if (newPct !== null && fee > 0) inputs.push({ phaseId: phase.phaseId, newPct });
      return { phase, fee, prevPct, raw, invalid, newPct };
    });
    const errors = validateClaims(project, claimedSoFar, inputs);
    const errByPhase = new Map(errors.map((e) => [e.phaseId, e]));
    const lines = buildClaimLines(
      project,
      claimedSoFar,
      inputs.filter((i) => !errByPhase.has(i.phaseId)),
    );
    const byPhase = new Map(lines.map((l) => [l.claim?.phaseId ?? '', l]));
    const rows = parsed.map((r) => ({
      ...r,
      error: errByPhase.get(r.phase.phaseId) ?? null,
      line: byPhase.get(r.phase.phaseId) ?? null,
    }));
    return {
      rows,
      inputs,
      errors,
      invalidCount,
      lineCount: lines.length,
      total: round2(lines.reduce((s, l) => s + l.amount, 0)),
      mismatch: stageFeeMismatch(project),
      /** false on freshly-imported fixed-fee projects — nothing claimable until
       *  stage fees are typed into Setup */
      hasAnyStageFee: rows.some((r) => r.fee > 0),
    };
  }, [project, claimedSoFar, pctText]);

  // ---- live preview of the hourly path -----------------------------------------
  const preview = useMemo(() => {
    if (!project) return null;
    const selected = selectEntries(allEntries, project.projectId, start, end, { includeBillable, includeOutOfScope });
    const lines = buildLines(selected, groupBy, firm);
    const totals = invoiceTotals({ lines, discount: 0, taxRate: 0 });
    const alreadyInvoiced = invoicedEntryIds(invoices);
    const overlap = selected.filter((e) => alreadyInvoiced.has(e.id)).length;

    // Answer "I logged 50 hours — why does this say less?" before it's asked:
    // account for every hour on this project that is NOT on the invoice.
    const projectEntries = allEntries.filter((e) => e.projectId === project.projectId && e.hours > 0);
    const inPeriod = projectEntries.filter((e) => e.date >= start && e.date <= end);
    const inPeriodHours = inPeriod.reduce((s, e) => s + e.hours, 0);
    const selectedHours = selected.reduce((s, e) => s + e.hours, 0);
    const excludedInPeriod = round2(inPeriodHours - selectedHours);
    const outsidePeriod = round2(
      projectEntries.filter((e) => e.billable && (e.date < start || e.date > end)).reduce((s, e) => s + e.hours, 0),
    );

    return {
      lineCount: lines.length,
      hours: totals.hours,
      subtotal: totals.subtotal,
      entryCount: selected.length,
      overlap,
      excludedInPeriod,
      outsidePeriod,
    };
  }, [project, allEntries, start, end, includeBillable, includeOutOfScope, groupBy, firm, invoices]);

  /** Append the ticked reimbursables as extra lines BELOW the time/claim lines.
   *  sourceEntryIds and claim fields are never touched. */
  const attachExpenseLines = (draft: Invoice) => {
    if (includedExpenses.length === 0) return;
    draft.lines = [...draft.lines, ...includedExpenses.map(expenseLine)];
  };

  /** Stamp each included expense with the invoice's id — the double-charge
   *  guard, mirroring sourceEntryIds for time entries. Runs AFTER the invoice
   *  row is persisted (onCreate) so a failed save can never strand an expense
   *  stamped against an invoice that doesn't exist. */
  const stampExpenses = async (draft: Invoice) => {
    if (includedExpenses.length === 0) return;
    const at = nowISO();
    await db.expenses.bulkPut(includedExpenses.map((e) => ({ ...e, invoiceId: draft.invoiceId, updatedAt: at })));
  };

  const create = async () => {
    if (!project) return;
    setBusy(true);
    try {
      const invoiceNumber = await nextInvoiceNumber();
      const draft = makeInvoice({
        firm,
        project,
        invoiceNumber,
        issueDate: today,
        periodStart: start,
        periodEnd: end,
        groupBy,
        filters: { includeBillable, includeOutOfScope },
        allEntries,
      });
      attachExpenseLines(draft);
      await onCreate(draft);
      await stampExpenses(draft);
    } finally {
      setBusy(false);
    }
  };

  const createClaim = async () => {
    if (!project || !claimState) return;
    if (claimState.errors.length > 0 || claimState.invalidCount > 0) return;
    if (claimState.lineCount === 0 && includedExpenses.length === 0) return;
    setBusy(true);
    try {
      const invoiceNumber = await nextInvoiceNumber();
      const draft = makeClaimInvoice({
        firm,
        project,
        invoiceNumber,
        issueDate: today,
        periodStart: start,
        periodEnd: end,
        claimedSoFar,
        inputs: claimState.inputs,
      });
      attachExpenseLines(draft);
      await onCreate(draft);
      await stampExpenses(draft);
    } finally {
      setBusy(false);
    }
  };

  const chip = (active: boolean) =>
    `min-h-11 cursor-pointer border px-3 py-1.5 transition-colors duration-200 ${
      active ? 'border-ink bg-ink text-paper font-bold' : 'border-line hover:border-ink'
    }`;
  const modeChip = (active: boolean) =>
    `min-h-11 cursor-pointer border px-4 py-2.5 transition-colors duration-200 ${
      active ? 'border-ink bg-ink text-paper font-bold' : 'border-line hover:border-ink'
    }`;

  const claimMode = mode === 'claim' && project?.billingMethod === 'fixed_fee';

  // The on-charge section — shown in BOTH billing modes whenever the project has
  // reimbursables waiting. Everything starts ticked; untick to hold one back.
  const expenseSection = unbilledExpenses.length > 0 && (
    <div className="border border-line p-4" data-tour="oncharge-expenses">
      <p className="flex items-center gap-2 font-bold">
        <Receipt className="h-4 w-4 shrink-0" aria-hidden />
        Add expenses the client pays back ({unbilledExpenses.length} waiting, {fmtMoney(waitingTotal, rates.currency)})
      </p>
      <p className="mt-1 text-ink-soft">
        Ticked expenses become extra lines at the bottom of this invoice, at the marked-up amount shown here.
      </p>
      <div className="mt-2 flex flex-col">
        {unbilledExpenses.map((e) => {
          const included = !excludedExpenseIds.has(e.id);
          return (
            <label
              key={e.id}
              className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-1.5 last:border-b-0"
            >
              <input
                type="checkbox"
                checked={included}
                onChange={(ev) => toggleExpense(e.id, ev.target.checked)}
                aria-label={`Put "${e.description}" on this invoice`}
                className="h-4 w-4 cursor-pointer accent-ink"
              />
              <span className="whitespace-nowrap tabular-nums text-ink-soft">{monthDayLabel(e.date)}</span>
              <span>
                {EXPENSE_CATEGORY_LABEL[e.category]} — {e.description}
              </span>
              <span className="ml-auto whitespace-nowrap tabular-nums">
                {e.markupPct ? (
                  <span className="text-ink-soft">
                    {fmtMoney(e.amount, rates.currency)} + {e.markupPct}% markup ={' '}
                  </span>
                ) : null}
                <span className="font-bold">{fmtMoney(onChargeAmount(e), rates.currency)}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">New invoice</h1>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto min-h-11 cursor-pointer border border-line px-3 py-1.5 transition-colors duration-200 hover:border-ink"
        >
          Cancel
        </button>
      </div>

      {/* Rates only matter when billing by the hour — a fee claim needs none. */}
      {!ratesReady && !claimMode && (
        <div className="flex items-start gap-3 border border-warn bg-neutral-50 p-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
          <p>
            No billing rates set yet, so amounts will start at 0. Set a default rate (or per-person / per-project rates) in{' '}
            <span className="font-bold">Setup → Billing rates</span> — you can still create the invoice and type amounts by hand.
          </p>
        </div>
      )}

      <label className="flex max-w-md flex-col gap-1">
        <span className="text-ink-soft">Project</span>
        <select
          value={projectId}
          onChange={(e) => selectProject(e.target.value)}
          className="h-11 cursor-pointer border border-line px-2"
        >
          <option value="">Select a project…</option>
          {projects.map((p) => (
            <option key={p.projectId} value={p.projectId}>
              {p.projectName}
              {p.clientName ? ` — ${p.clientName}` : ''} ({p.billingMethod === 'hourly' ? 'hourly' : 'fixed fee'})
            </option>
          ))}
        </select>
      </label>

      {project && (
        <>
          {project.billingMethod === 'fixed_fee' && (
            <div className="flex flex-col gap-2">
              <span className="text-ink-soft">What is this invoice for?</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="What is this invoice for?">
                <button type="button" aria-pressed={mode === 'claim' ? 'true' : 'false'} onClick={() => setMode('claim')} className={modeChip(mode === 'claim')}>
                  Bill a percentage of the fee
                </button>
                <button type="button" aria-pressed={mode === 'time' ? 'true' : 'false'} onClick={() => setMode('time')} className={modeChip(mode === 'time')}>
                  Bill by the hour
                </button>
              </div>
              <p className="text-ink-soft">
                {claimMode
                  ? 'Your monthly progress bill against the fixed fee: say how far along each stage is, and the invoice is the difference since last time.'
                  : 'Bill tracked hours at your rates — typically for extra services outside the fixed fee.'}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={chip(start === monthStart(today) && end === monthEnd(today))}
                onClick={() => { setStart(monthStart(today)); setEnd(monthEnd(today)); }}>
                This month
              </button>
              <button type="button" className={chip(start === prevMonth(today, 'start') && end === prevMonth(today, 'end'))}
                onClick={() => { setStart(prevMonth(today, 'start')); setEnd(prevMonth(today, 'end')); }}>
                Last month
              </button>
            </div>
            <label className="flex items-center gap-1">
              <span className="text-ink-soft">From</span>
              <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value || start)}
                aria-label="Period start" className="h-11 border border-line px-2" />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-ink-soft">To</span>
              <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value || end)}
                aria-label="Period end" className="h-11 border border-line px-2" />
            </label>
          </div>

          {claimMode && claimState ? (
            <>
              {/* with NO stage fees at all, the empty-state below says it better than "$0 ≠ fee" */}
              {claimState.mismatch && claimState.hasAnyStageFee && (
                <div className="flex items-start gap-3 border border-warn bg-neutral-50 p-3">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
                  <p>
                    Your stage fees add up to <span className="font-bold tabular-nums">{fmtMoney(claimState.mismatch.stageFeeSum, rates.currency)}</span>{' '}
                    but the project fee is <span className="font-bold tabular-nums">{fmtMoney(claimState.mismatch.projectFee, rates.currency)}</span>.
                    You can still bill — the invoice uses the stage fees below. Fix them in{' '}
                    <span className="font-bold">Setup → Projects</span> when you get a chance.
                  </p>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="border-b border-ink text-left">
                      <th scope="col" className="py-2 pr-4 font-bold">Stage</th>
                      <th scope="col" className="py-2 pr-4 text-right font-bold">Stage fee</th>
                      <th scope="col" className="py-2 pr-4 text-right font-bold">Billed so far</th>
                      <th scope="col" className="py-2 pr-4 text-right font-bold">Bill up to (%)</th>
                      <th scope="col" className="py-2 text-right font-bold">This invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claimState.rows.map(({ phase, fee, prevPct, raw, invalid, error, line }) => {
                      const noFee = fee <= 0;
                      return (
                        <tr key={phase.phaseId} className={`border-b border-line align-middle ${noFee ? 'text-ink-soft' : ''}`}>
                          <td className="py-2 pr-4">
                            {phase.aiaCode ? `${phase.aiaCode} — ` : ''}
                            {phase.name}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {noFee ? 'no fee entered for this stage' : fmtMoney(fee, rates.currency)}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">{noFee ? '—' : `${prevPct}%`}</td>
                          <td className="py-2 pr-4 text-right">
                            <span className="inline-flex items-center gap-1">
                              <input
                                type="text"
                                inputMode="decimal"
                                disabled={noFee}
                                value={noFee ? '' : raw}
                                onChange={(e) => setPctText((t) => ({ ...t, [phase.phaseId]: e.target.value }))}
                                aria-label={`Bill up to (%) for ${phase.name}`}
                                aria-invalid={invalid || error ? 'true' : undefined}
                                className={`h-11 w-24 border px-2 text-right tabular-nums ${
                                  invalid || error ? 'border-alert' : 'border-line'
                                } disabled:cursor-not-allowed disabled:bg-neutral-50`}
                              />
                              <span aria-hidden>%</span>
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            {noFee ? (
                              <span aria-hidden>—</span>
                            ) : invalid ? (
                              <span className="flex items-center justify-end gap-1 text-alert">
                                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden /> Enter a number
                              </span>
                            ) : error ? (
                              <span className="flex items-center justify-end gap-1 text-alert">
                                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden /> {error.message}
                              </span>
                            ) : line?.claim ? (
                              <span className="tabular-nums">
                                <span className="text-ink-soft">+{round2(line.claim.newPct - line.claim.prevPct)}% · </span>
                                <span className="font-bold">{fmtMoney(line.amount, rates.currency)}</span>
                              </span>
                            ) : (
                              <span className="text-ink-soft">no change</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="border border-line p-4">
                {!claimState.hasAnyStageFee ? (
                  <p className="text-ink-soft">
                    No stage fees entered for this project yet, so there's nothing to bill a percentage of. Enter each
                    stage's fee in <span className="font-bold">Setup → Projects</span> first — or switch to{' '}
                    <span className="font-bold">Bill by the hour</span> above.
                  </p>
                ) : claimState.errors.length > 0 || claimState.invalidCount > 0 ? (
                  <p className="flex items-center gap-2 text-alert">
                    <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                    Fix the stages marked above to continue.
                  </p>
                ) : claimState.lineCount === 0 ? (
                  <p className="text-ink-soft">
                    {includedExpenses.length > 0 ? (
                      <>No stage percentage raised — this invoice will carry only the ticked expenses below.</>
                    ) : (
                      <>
                        Nothing to bill yet — raise <span className="font-bold">Bill up to (%)</span> on at least one stage. Each
                        stage starts at what you've billed so far.
                      </>
                    )}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
                    <span>
                      <span className="font-bold tabular-nums">{claimState.lineCount}</span> stage{claimState.lineCount === 1 ? '' : 's'}
                    </span>
                    <span>
                      This invoice <span className="font-bold tabular-nums">{fmtMoney(claimState.total, rates.currency)}</span>
                    </span>
                  </div>
                )}
              </div>

              {expenseSection}

              <div>
                <button
                  type="button"
                  disabled={
                    busy ||
                    claimState.errors.length > 0 ||
                    claimState.invalidCount > 0 ||
                    (claimState.lineCount === 0 && includedExpenses.length === 0)
                  }
                  onClick={() => void createClaim()}
                  className="flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-neutral-300"
                >
                  <FileText className="h-4 w-4" aria-hidden /> Create draft invoice
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-6">
                <label className="flex flex-col gap-1">
                  <span className="text-ink-soft">Group lines</span>
                  <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as InvoiceGroupBy)}
                    className="h-11 cursor-pointer border border-line px-2">
                    {(Object.keys(GROUP_LABELS) as InvoiceGroupBy[]).map((g) => (
                      <option key={g} value={g}>{GROUP_LABELS[g]}</option>
                    ))}
                  </select>
                </label>
                <label className="flex cursor-pointer items-center gap-2 pb-2">
                  <input type="checkbox" checked={includeBillable} onChange={(e) => setIncludeBillable(e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-ink" />
                  Billable hours
                </label>
                <label className="flex cursor-pointer items-center gap-2 pb-2">
                  <input type="checkbox" checked={includeOutOfScope} onChange={(e) => setIncludeOutOfScope(e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-ink" />
                  Out-of-scope / additional services
                </label>
              </div>

              {project.billingMethod === 'fixed_fee' && !includeBillable && (
                <p className="text-ink-soft">
                  This is a <span className="font-bold">fixed-fee</span> project, so regular hours start unticked — bill the fee
                  itself with <span className="font-bold">Bill a percentage of the fee</span> above, and use this to bill only
                  out-of-scope extras by the hour. Tick <span className="font-bold">Billable hours</span> to bill all its time
                  hourly instead.
                  {project.imported && ' (Imported projects default to fixed fee — change it in Setup if this is hourly work.)'}
                </p>
              )}

              {preview && (
                <div className="border border-line p-4">
                  {preview.entryCount === 0 ? (
                    <p className="text-ink-soft">
                      No matching hours in this period.
                      {preview.outsidePeriod > 0 && (
                        <>
                          {' '}
                          <span className="text-ink">
                            This project has <span className="font-bold tabular-nums">{preview.outsidePeriod}</span> billable
                            hours outside these dates — widen the period to pick them up.
                          </span>
                        </>
                      )}
                      {preview.outsidePeriod === 0 && ' Widen the dates, or toggle the include options above.'}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
                        <span><span className="font-bold tabular-nums">{preview.lineCount}</span> line{preview.lineCount === 1 ? '' : 's'}</span>
                        <span><span className="font-bold tabular-nums">{preview.hours}</span> hours</span>
                        <span>Subtotal <span className="font-bold tabular-nums">{fmtMoney(preview.subtotal, rates.currency)}</span></span>
                        {preview.overlap > 0 && (
                          <span className="flex items-center gap-2 text-warn">
                            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                            {preview.overlap} of these entries are already on another invoice
                          </span>
                        )}
                      </div>
                      {(preview.excludedInPeriod > 0 || preview.outsidePeriod > 0) && (
                        <p className="text-ink-soft">
                          Not on this invoice:
                          {preview.excludedInPeriod > 0 && (
                            <> <span className="tabular-nums">{preview.excludedInPeriod}</span> h in this period (non-billable, or switched off above)</>
                          )}
                          {preview.excludedInPeriod > 0 && preview.outsidePeriod > 0 && ' · '}
                          {preview.outsidePeriod > 0 && (
                            <> <span className="tabular-nums">{preview.outsidePeriod}</span> billable h outside these dates</>
                          )}
                          .
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {expenseSection}

              <div>
                <button
                  type="button"
                  disabled={busy || !preview || (preview.entryCount === 0 && includedExpenses.length === 0)}
                  onClick={() => void create()}
                  className="flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-neutral-300"
                >
                  <FileText className="h-4 w-4" aria-hidden /> Create draft invoice
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
