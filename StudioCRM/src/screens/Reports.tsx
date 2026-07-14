// Reports — read-only. Every number here is computed by lib/reports.ts (pure,
// unit-tested in test-reports.mjs); this screen only renders it. No chart
// library: the pipeline-value chart is PipelineValueBars, the div-based
// pattern adapted from StudioHours' WeeklyBars.tsx. Division-safe by
// construction upstream — lib/reports.ts returns null for any average/rate
// whose denominator would be 0, never NaN/Infinity, and this screen renders
// null as a dash (see reports.ts's file header comment). The one screen-wide
// empty case (zero leads at all — nothing to compute yet) uses EmptyState,
// same as every other screen's first-run state; per-stat nulls that can still
// occur with SOME leads logged (e.g. no won lead has both fee figures yet)
// render inline as a dash rather than collapsing the whole section.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useApp } from '../AppContext';
import {
  avgLeadToAward,
  feeCalibration,
  pipelineValueByStage,
  winRateByClientType,
  winRateBySector,
} from '../lib/reports';
import EmptyState from '../components/EmptyState';
import { PipelineValueBars } from '../components/reports/PipelineValueBars';

const FEE_FMT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

// The screen's one glyph for "no data yet" on an otherwise-numeric line —
// matches lib/reports.ts's null convention ("the screen renders null as a dash").
const DASH = '—';

function pct(rate: number | null): string {
  return rate === null ? DASH : `${Math.round(rate * 100)}%`;
}

function fmtDays(n: number | null): string {
  return n === null ? DASH : `${Math.round(n * 10) / 10}`;
}

/** Signed currency — "+" prefix on positive deltas (negative already carries
 *  its own minus sign from Intl's currency formatting), so "came in over vs.
 *  under the proposed fee" reads at a glance. */
function fmtSignedFee(n: number | null): string {
  if (n === null) return DASH;
  return `${n > 0 ? '+' : ''}${FEE_FMT.format(n)}`;
}

function fmtSignedPct(n: number | null): string {
  if (n === null) return DASH;
  const rounded = Math.round(n * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

interface WinRateRow {
  group: string;
  won: number;
  lost: number;
  rate: number | null;
}

/** Shared table for both win-rate breakdowns — sector and client type share
 *  the exact same {group, won, lost, rate} shape from lib/reports.ts. */
function WinRateTable({ label, groupHeader, rows }: { label: string; groupHeader: string; rows: WinRateRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="Not enough data yet" hint={`${label} fills in once a lead closes won or lost.`} />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse">
        <thead>
          <tr className="border-b border-ink text-left">
            <th scope="col" className="py-2 pr-4 font-bold">
              {groupHeader}
            </th>
            <th scope="col" className="py-2 pr-4 font-bold">
              Won
            </th>
            <th scope="col" className="py-2 pr-4 font-bold">
              Lost
            </th>
            <th scope="col" className="py-2 font-bold">
              Win rate
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.group} className="border-b border-line">
              <td className="py-2 pr-4">{r.group}</td>
              <td className="py-2 pr-4 tabular-nums">{r.won}</td>
              <td className="py-2 pr-4 tabular-nums">{r.lost}</td>
              <td className="py-2 tabular-nums">{pct(r.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Reports() {
  const { setView } = useApp();
  const clients = useLiveQuery(() => db.clients.toArray(), []);
  const leads = useLiveQuery(() => db.leads.toArray(), []);

  if (clients === undefined || leads === undefined) return null; // still loading IndexedDB

  if (leads.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <div className="mt-6">
          <EmptyState
            title="Not enough data yet"
            hint="Reports fill in once opportunities exist in the Pipeline — pipeline value, win rates, time to award, and fee calibration all compute from your leads."
            action={
              <button
                type="button"
                onClick={() => setView('pipeline')}
                className="min-h-11 cursor-pointer bg-ink px-4 py-2 font-bold text-paper transition-colors duration-200 hover:bg-ink-soft"
              >
                Go to Pipeline
              </button>
            }
          />
        </div>
      </div>
    );
  }

  const stageValues = pipelineValueByStage(leads);
  const sectorRows: WinRateRow[] = winRateBySector(leads).map((r) => ({
    group: r.sector,
    won: r.won,
    lost: r.lost,
    rate: r.rate,
  }));
  const clientTypeRows: WinRateRow[] = winRateByClientType(leads, clients).map((r) => ({
    group: r.clientType,
    won: r.won,
    lost: r.lost,
    rate: r.rate,
  }));
  const avgDays = avgLeadToAward(leads);
  const calibration = feeCalibration(leads);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="mt-1 text-ink-soft">What the pipeline turns into — read-only, computed from your leads and clients.</p>
      </div>

      <section data-tour="pipeline-value">
        <h2 className="mb-1 font-bold">Pipeline value by stage</h2>
        <p className="mb-3 text-ink-soft">Hover or focus a bar for lead count, raw value, and probability-weighted value.</p>
        <PipelineValueBars stages={stageValues} />
      </section>

      <section data-tour="win-rate-table">
        <h2 className="mb-1 font-bold">Win rate by sector</h2>
        <p className="mb-3 text-ink-soft">Won ÷ (won + lost), grouped on each lead's sector.</p>
        <WinRateTable label="Win rate by sector" groupHeader="Sector" rows={sectorRows} />
      </section>

      <section>
        <h2 className="mb-1 font-bold">Win rate by client type</h2>
        <p className="mb-3 text-ink-soft">Won ÷ (won + lost), grouped on the lead's client type.</p>
        <WinRateTable label="Win rate by client type" groupHeader="Client type" rows={clientTypeRows} />
      </section>

      <section className="border border-line p-4">
        <h2 className="font-bold">Average time from lead to award</h2>
        {avgDays === null ? (
          <p className="mt-1 text-ink-soft">
            Not enough data yet — needs at least one won lead with both a created date and a stage-change date recorded.
          </p>
        ) : (
          <p className="mt-1 tabular-nums">
            <span className="text-2xl font-bold">{fmtDays(avgDays)}</span>{' '}
            <span className="text-ink-soft">days, on average, from a lead's start to being won</span>
          </p>
        )}
      </section>

      <section className="border border-line p-4">
        <h2 className="font-bold">Fee calibration</h2>
        {calibration.count === 0 ? (
          <p className="mt-1 text-ink-soft">
            Not enough data yet — needs at least one won lead with both a proposed fee and a final won fee recorded.
          </p>
        ) : (
          <div className="mt-1 flex flex-col gap-1">
            <p className="tabular-nums">
              <span className="text-2xl font-bold">{fmtSignedFee(calibration.avgDelta)}</span>{' '}
              <span className="text-ink-soft">average delta (won fee − proposed fee)</span>
            </p>
            <p className="tabular-nums text-ink-soft">
              {fmtSignedPct(calibration.avgDeltaPct)} average, as a share of the proposed fee
            </p>
            <p className="text-ink-soft">
              Based on {calibration.count} won {calibration.count === 1 ? 'lead' : 'leads'} with both figures recorded.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
