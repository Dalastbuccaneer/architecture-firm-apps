// Fee Burn — the owner's headline view. One project at a time it answers:
// "How many hours have we spent, per stage and in total, against what we
// budgeted — and how much of the fee have we invoiced?"
//
// Design contract (from the P1.5 chart brief):
// - ONE hero figure (overall % of hours budget used), plain ink, severity as a
//   dot + word beside it — never by coloring the number.
// - Per-stage METERS: track = budgeted hours in a lighter step of the same hue
//   ramp as the fill; fill = actual hours colored by burnColor; past 100% an
//   overflow segment extends beyond the track end behind a 2px surface gap.
// - Every row states its numbers in always-visible ink text — color is never
//   the only signal.
// - Hours and money are NEVER mixed on one scale: the invoiced-% of each stage
//   fee is a separate plain-text line under the hours meter, and fee money
//   lives in its own stat tiles. No second axis, no second bar scale.
// - Burn is whole-life by definition (budgets are whole-stage numbers), so this
//   tab deliberately ignores the Dashboard's date-range picker.

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { useApp } from '../../AppContext';
import type { FirmFile, Phase, Project, TimeEntry } from '../../types';
import { claimedPctByPhase, isClaimInvoice } from '../../lib/claims';
import { monthDayLabel } from '../../lib/dates';
import { burnColor, burnStatus, burnTrackColor, sum } from './metrics';

const ALL = '__all__';

/** Tile/label numbers: locale separators, ≤2 decimals trimmed ("1,284", "6.5").
 *  Only truly huge values compact ("1.2M") — below that, exact figures read
 *  plainer, and the always-visible exact number is this view's a11y backbone. */
function fmtH(n: number): string {
  const r = Math.round(n * 100) / 100;
  if (Math.abs(r) >= 1_000_000) {
    return r.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  }
  return r.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtMoney(n: number, currency: string): string {
  if (Math.abs(n) >= 1_000_000) {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** "S2 — Concept Design" when a stage code exists; custom stages may have a
 *  blank code, so fall back to the bare name (no dangling dash). */
const stageLabel = (ph: Phase): string => (ph.aiaCode ? `${ph.aiaCode} — ${ph.name}` : ph.name);

interface StageRow {
  phase: Phase;
  /** in-scope hours logged against this stage */
  actual: number;
  /** null = no budget entered (a 0 in the field counts as "not entered") */
  budget: number | null;
}

interface ProjectBurn {
  rows: StageRow[];
  /** hours on stages that HAVE a budget — the hero numerator */
  actualBudgeted: number;
  /** sum of entered stage budgets — the hero denominator */
  budgetTotal: number;
  /** all in-scope hours on the project (incl. unbudgeted stages + unassigned) */
  totalLogged: number;
  /** in-scope hours carrying no stage (imports can produce these) */
  unassignedHours: number;
  oosEntries: TimeEntry[];
}

/** Whole-life burn for one project. Out-of-scope hours are additional services
 *  (billed separately), so they never count against stage budgets — same rule
 *  the phase-burn bars have always used. */
function computeBurn(project: Project, allEntries: TimeEntry[]): ProjectBurn {
  const projEntries = allEntries.filter((e) => e.projectId === project.projectId);
  const oosEntries = projEntries.filter((e) => e.outOfScope).sort((a, b) => a.date.localeCompare(b.date));
  const inScope = projEntries.filter((e) => !e.outOfScope);

  const byPhase = new Map<string, number>();
  for (const e of inScope) {
    if (e.phaseId) byPhase.set(e.phaseId, (byPhase.get(e.phaseId) ?? 0) + e.hours);
  }

  const phases = [...project.phases].sort((a, b) => a.sequence - b.sequence);
  const phaseIds = new Set(phases.map((p) => p.phaseId));
  const rows: StageRow[] = phases.map((phase) => ({
    phase,
    actual: byPhase.get(phase.phaseId) ?? 0,
    budget: phase.budgetedHours != null && phase.budgetedHours > 0 ? phase.budgetedHours : null,
  }));

  const budgeted = rows.filter((r) => r.budget != null);
  const unassignedHours = sum(inScope.filter((e) => !e.phaseId || !phaseIds.has(e.phaseId)).map((e) => e.hours));

  return {
    rows,
    actualBudgeted: sum(budgeted.map((r) => r.actual)),
    budgetTotal: sum(budgeted.map((r) => r.budget ?? 0)),
    totalLogged: sum(inScope.map((e) => e.hours)),
    unassignedHours,
    oosEntries,
  };
}

function OpenSetupButton({ children = 'Open Setup' }: { children?: string }) {
  const { setView } = useApp();
  return (
    <button
      type="button"
      onClick={() => setView('setup')}
      className="flex min-h-11 cursor-pointer items-center border border-line px-4 transition-colors duration-200 hover:border-ink"
    >
      {children}
    </button>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-36 border border-line p-3">
      <div className="text-ink-soft">{label}</div>
      {/* Proportional figures on tile values (brief rule): no tabular-nums here. */}
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

/** One stage's hours meter. Track length = budget, fill = hours logged (both on
 *  the shared scale so stage sizes compare across rows); past 100% the fill
 *  caps at the track end and an overflow segment continues after a 2px surface
 *  gap. The bar is aria-hidden: the text line beside the label carries every
 *  number. `claimedPct` (money, not hours) renders as its own text line. */
function StageMeter({
  label,
  actual,
  budget,
  scaleMax,
  claimedPct,
}: {
  label: string;
  actual: number;
  budget: number;
  scaleMax: number;
  claimedPct: number | null;
}) {
  const ratio = actual / budget;
  const over = ratio > 1;
  const text = `${fmtH(actual)} of ${fmtH(budget)} hrs · ${Math.round(ratio * 100)}% of budget${over ? ' — over budget' : ''}`;
  const trackPct = (budget / scaleMax) * 100;
  const fillPct = Math.min(1, ratio) * 100; // relative to the track
  const overflowPct = over ? ((actual - budget) / scaleMax) * 100 : 0;
  return (
    <div className="flex min-h-11 flex-col justify-center gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span>{label}</span>
        <span className="shrink-0 tabular-nums text-ink-soft">{text}</span>
      </div>
      <div className="flex items-center" aria-hidden>
        <div className={`h-4 rounded-r ${burnTrackColor(ratio)}`} style={{ width: `${trackPct}%` }}>
          <div className={`h-4 rounded-r ${burnColor(ratio)} transition-all duration-200`} style={{ width: `${fillPct}%` }} />
        </div>
        {over && <div className="ml-0.5 h-4 shrink-0 rounded-r bg-alert" style={{ width: `${overflowPct}%` }} />}
      </div>
      {claimedPct != null && <p className="text-ink-soft">{Math.round(claimedPct)}% of fee invoiced</p>}
    </div>
  );
}

/** A stage with hours but no entered budget: plain text, never a silent hide. */
function StageNoBudget({ label, actual }: { label: string; actual: number }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4">
      <span>
        {label} <span className="text-ink-soft">· no budget entered for this stage</span>
      </span>
      <span className="shrink-0 tabular-nums text-ink-soft">{fmtH(actual)} hrs logged</span>
    </div>
  );
}

function SingleProject({ project, allEntries, firm }: { project: Project; allEntries: TimeEntry[]; firm: FirmFile }) {
  const currency = firm.billingRates?.currency || 'USD';
  const invoices =
    useLiveQuery(() => db.invoices.where('projectId').equals(project.projectId).toArray(), [project.projectId]) ?? [];

  const burn = useMemo(() => computeBurn(project, allEntries), [project, allEntries]);
  const { rows, actualBudgeted, budgetTotal, totalLogged, unassignedHours, oosEntries } = burn;

  // ---- money (fee claims), kept strictly apart from the hours scale ---------
  const claimed = useMemo(() => claimedPctByPhase(invoices, project.projectId), [invoices, project.projectId]);
  const hasClaims = invoices.some(isClaimInvoice);
  const stageFeeTotal = round2(sum(project.phases.map((ph) => ph.budgetedFee ?? 0)));
  const feeBasis = project.fee ?? (stageFeeTotal > 0 ? stageFeeTotal : null);
  const invoicedOfFee = round2(
    sum(project.phases.map((ph) => ((claimed.get(ph.phaseId) ?? 0) * (ph.budgetedFee ?? 0)) / 100)),
  );
  const timeInvoiced = round2(
    sum(invoices.filter((inv) => !isClaimInvoice(inv)).flatMap((inv) => inv.lines.map((l) => l.amount))),
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 border border-line p-4">
        <p className="font-bold">This project has no stages yet.</p>
        <p className="text-ink-soft">
          Add stages in Setup — the "Prefill stages…" button lays out a standard set, with budget columns, in one
          click.
        </p>
        {totalLogged > 0 && (
          <p className="text-ink-soft">{fmtH(totalLogged)} hrs are already logged on this project — they'll appear here as soon as stages exist.</p>
        )}
        <OpenSetupButton />
      </div>
    );
  }

  const heroRatio = budgetTotal > 0 ? actualBudgeted / budgetTotal : null;
  const scaleMax = Math.max(...rows.filter((r) => r.budget != null).map((r) => Math.max(r.actual, r.budget ?? 0)), 0);
  const remaining = budgetTotal - actualBudgeted;
  const offBudgetHours = round2(totalLogged - actualBudgeted);

  const meterRows = rows.map((r) =>
    r.budget != null ? (
      <StageMeter
        key={r.phase.phaseId}
        label={stageLabel(r.phase)}
        actual={r.actual}
        budget={r.budget}
        scaleMax={scaleMax}
        claimedPct={hasClaims && (r.phase.budgetedFee ?? 0) > 0 ? (claimed.get(r.phase.phaseId) ?? 0) : null}
      />
    ) : (
      <StageNoBudget key={r.phase.phaseId} label={stageLabel(r.phase)} actual={r.actual} />
    ),
  );

  return (
    <div className="flex flex-col gap-6">
      {heroRatio == null ? (
        <div className="flex flex-col items-start gap-3 border border-line p-4">
          <p className="font-bold">Add budgeted hours in Setup to see burn.</p>
          <p className="text-ink-soft">
            {totalLogged > 0
              ? `${fmtH(totalLogged)} hrs are logged on this project so far — enter each stage's budgeted hours and this becomes a stage-by-stage burn chart.`
              : "Enter each stage's budgeted hours and this becomes a stage-by-stage burn chart."}
          </p>
          <OpenSetupButton />
        </div>
      ) : (
        <section className="flex flex-wrap items-start gap-x-12 gap-y-6">
          <div data-tour="burn-hero">
            <div className="flex flex-wrap items-baseline gap-x-4">
              <span className="text-hero font-bold">{Math.round(heroRatio * 100)}%</span>
              <span className="flex items-baseline gap-2 whitespace-nowrap">
                <span
                  className={`inline-block h-3.5 w-3.5 shrink-0 self-center rounded-full ${burnStatus(heroRatio).dotClass}`}
                  aria-hidden
                />
                <span className="font-bold">{burnStatus(heroRatio).label}</span>
              </span>
            </div>
            <p className="mt-1 text-ink-soft">of the hours budget used</p>
          </div>
          <div>
            <div className="flex flex-wrap gap-3">
              <StatTile label="Hours logged" value={fmtH(totalLogged)} />
              <StatTile label="Hours budgeted" value={fmtH(budgetTotal)} />
              {remaining >= 0 ? (
                <StatTile label="Hours remaining" value={fmtH(remaining)} />
              ) : (
                <StatTile label="Hours over budget" value={fmtH(-remaining)} />
              )}
              {feeBasis != null && (
                <>
                  <StatTile label="Fee" value={fmtMoney(feeBasis, currency)} />
                  <StatTile label="Invoiced so far" value={fmtMoney(invoicedOfFee, currency)} />
                  <StatTile label="Not yet invoiced" value={fmtMoney(Math.max(0, feeBasis - invoicedOfFee), currency)} />
                </>
              )}
            </div>
            {feeBasis != null && (
              <p className="mt-2 text-ink-soft">
                "Invoiced so far" counts fee claims to date, drafts included.
                {timeInvoiced > 0 &&
                  ` A further ${fmtMoney(timeInvoiced, currency)} has been billed on hourly invoices for this project, outside the fee.`}
              </p>
            )}
            {offBudgetHours > 0 && (
              <p className="mt-2 text-ink-soft">
                {fmtH(offBudgetHours)} of the logged hrs sit on stages without a budget (listed below) — they aren't in
                the {Math.round(heroRatio * 100)}% figure.
              </p>
            )}
          </div>
        </section>
      )}

      {totalLogged === 0 && rows.length > 0 && (
        <p role="status" className="border border-line bg-neutral-50 p-3">
          No hours logged yet — the bars fill up as timesheets come in.
        </p>
      )}

      <div>
        <p className="mb-3 text-ink-soft">
          Each stage: the pale band is the hours budget, the darker fill is hours logged. Green means on track, amber
          getting close, red at or over budget — the words on each line say the same thing.
        </p>
        <div className="flex flex-col gap-4" data-tour="burn-bars">
          {meterRows}
          {unassignedHours > 0 && (
            <p className="text-ink-soft">
              {fmtH(unassignedHours)} hrs were logged with no stage — they count in "Hours logged" but toward no stage
              bar.
            </p>
          )}
        </div>
      </div>

      {oosEntries.length > 0 && (
        <details className="border-t border-line pt-3">
          <summary className="cursor-pointer">
            <span className="font-bold text-warn">{fmtH(sum(oosEntries.map((e) => e.hours)))} hrs out of scope</span>
            <span className="text-ink-soft">
              {' '}
              — {oosEntries.length} flagged {oosEntries.length === 1 ? 'entry' : 'entries'}, billed separately, not
              counted in the bars above
            </span>
          </summary>
          <table className="mt-3 w-full border-collapse">
            <thead>
              <tr className="border-b border-line text-left text-ink-soft">
                <th className="py-1 pr-4 font-normal">Person</th>
                <th className="py-1 pr-4 font-normal">Date</th>
                <th className="py-1 pr-4 text-right font-normal">Hours</th>
                <th className="py-1 font-normal">Requested by</th>
              </tr>
            </thead>
            <tbody>
              {oosEntries.map((e) => (
                <tr key={e.id} className="border-b border-line align-top">
                  <td className="py-1 pr-4">{e.personName}</td>
                  <td className="py-1 pr-4 whitespace-nowrap">{monthDayLabel(e.date)}</td>
                  <td className="py-1 pr-4 text-right tabular-nums">{fmtH(e.hours)}</td>
                  <td className="py-1">{e.requestedBy || <span className="text-alert">missing</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

/** The condensed every-project card list behind the "All projects" option —
 *  one overall meter per project; clicking a card opens its full view. */
function AllProjectsSummary({
  firm,
  allEntries,
  onPick,
}: {
  firm: FirmFile;
  allEntries: TimeEntry[];
  onPick: (projectId: string) => void;
}) {
  const cards = useMemo(() => {
    const withBurn = firm.projects.map((p) => ({ project: p, burn: computeBurn(p, allEntries) }));
    return withBurn
      .filter(({ project, burn }) => burn.totalLogged > 0 || project.status === 'active')
      .sort(
        (a, b) =>
          b.burn.totalLogged - a.burn.totalLogged || a.project.projectName.localeCompare(b.project.projectName),
      );
  }, [firm, allEntries]);

  if (cards.length === 0) {
    return <p className="text-ink-soft">No projects yet. Add projects in Setup.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-soft">
        Every project's overall hours burn, biggest first. Click a project — or pick it above — for the stage-by-stage
        view.
      </p>
      {cards.map(({ project, burn }) => {
        const ratio = burn.budgetTotal > 0 ? burn.actualBudgeted / burn.budgetTotal : null;
        return (
          <button
            key={project.projectId}
            type="button"
            onClick={() => onPick(project.projectId)}
            className="w-full cursor-pointer border border-line p-4 text-left transition-colors duration-200 hover:border-ink"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <span>
                <span className="font-bold">{project.projectName}</span>
                {project.clientName ? <span className="text-ink-soft"> · {project.clientName}</span> : null}
                {project.status !== 'active' ? (
                  <span className="text-ink-soft"> ({project.status === 'on_hold' ? 'on hold' : 'closed'})</span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums text-ink-soft">
                {ratio == null
                  ? `${fmtH(burn.totalLogged)} hrs logged · no stage budgets entered`
                  : `${fmtH(burn.actualBudgeted)} of ${fmtH(burn.budgetTotal)} hrs · ${Math.round(ratio * 100)}% of budget${ratio > 1 ? ' — over budget' : ''}`}
              </span>
            </div>
            {ratio != null && (
              <>
                <div className="mt-2 flex items-center" aria-hidden>
                  <div className={`h-2 rounded-r ${burnTrackColor(ratio)}`} style={{ width: `${Math.min(1, 1 / Math.max(ratio, 1)) * 100}%` }}>
                    <div className={`h-2 rounded-r ${burnColor(ratio)}`} style={{ width: `${Math.min(1, ratio) * 100}%` }} />
                  </div>
                  {ratio > 1 && (
                    <div className="ml-0.5 h-2 shrink-0 rounded-r bg-alert" style={{ width: `${((ratio - 1) / ratio) * 100}%` }} />
                  )}
                </div>
                <p className="mt-1 flex items-center gap-2 text-ink-soft">
                  <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${burnStatus(ratio).dotClass}`} aria-hidden />
                  {burnStatus(ratio).label}
                </p>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function FeeBurnTab({
  firm,
  allEntries,
  selectedId,
  onSelect,
}: {
  firm: FirmFile;
  allEntries: TimeEntry[];
  /** projectId, '__all__', or null = auto (most recently worked-on project) */
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // Picker order: active projects first, then on hold, then closed; alphabetical
  // within each group so the list reads the same every visit.
  const ordered = useMemo(() => {
    const rank: Record<Project['status'], number> = { active: 0, on_hold: 1, closed: 2 };
    return [...firm.projects].sort(
      (a, b) => rank[a.status] - rank[b.status] || a.projectName.localeCompare(b.projectName),
    );
  }, [firm]);

  // Auto-selection: the project with the most recent time entry — the one the
  // owner is most likely asking about.
  const defaultId = useMemo(() => {
    const ids = new Set(firm.projects.map((p) => p.projectId));
    let best: { id: string; date: string } | null = null;
    for (const e of allEntries) {
      if (!ids.has(e.projectId)) continue;
      if (!best || e.date > best.date) best = { id: e.projectId, date: e.date };
    }
    return best?.id ?? ordered[0]?.projectId ?? null;
  }, [allEntries, firm, ordered]);

  const effective = selectedId ?? defaultId;
  const project = effective === ALL ? null : (ordered.find((p) => p.projectId === effective) ?? null);

  if (ordered.length === 0) {
    return (
      <p className="text-ink-soft">No projects yet. Add projects (and their stage budgets) in Setup to see fee burn.</p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="flex max-w-md flex-col gap-1">
          <span className="text-ink-soft">Project</span>
          <select
            value={effective ?? ''}
            onChange={(e) => onSelect(e.target.value)}
            aria-label="Project"
            className="h-11 w-full cursor-pointer border border-line px-2"
          >
            {ordered.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                {p.projectName}
                {p.status === 'on_hold' ? ' (on hold)' : p.status === 'closed' ? ' (closed)' : ''}
              </option>
            ))}
            <option value={ALL}>All projects</option>
          </select>
        </label>
        <p className="mt-2 text-ink-soft">
          Since project start — every logged hour counts toward burn, whatever date range is picked above.
        </p>
      </div>

      {effective === ALL ? (
        <AllProjectsSummary firm={firm} allEntries={allEntries} onPick={onSelect} />
      ) : project ? (
        <SingleProject key={project.projectId} project={project} allEntries={allEntries} firm={firm} />
      ) : null}
    </div>
  );
}
