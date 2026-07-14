// Pure aggregation logic behind the Reports screen — no Dexie, no React, so it
// is unit-testable straight from Node (see test-reports.mjs at the repo root).
// Shaped like lib/pipeline.ts: every number the screen shows is computed HERE
// and the screen component stays thin. Division-safe by construction: any
// average or rate whose denominator would be 0 comes back as null (meaning
// "no data yet"), never NaN or Infinity — the screen renders null as a dash.
//
// The '.ts' import extensions are on purpose: Node's native type-stripping
// (which runs the unit test) resolves relative .ts imports only when they are
// explicit. Vite and tsc both accept it (allowImportingTsExtensions).

import { LEAD_STAGES, type Client, type Lead, type LeadStage } from '../types.ts';

const MS_PER_DAY = 86_400_000;

/** Grouping bucket for a missing/blank sector or client type. Free-text fields
 *  are optional everywhere, so the win-rate tables need an honest catch-all —
 *  leads without a sector still closed and still carry signal. */
export const UNSPECIFIED = 'Unspecified';

/** Strays (undefined, NaN, Infinity from bad imports) never poison a sum. */
function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Mean of a list, or null for an empty one — the single place every average
 *  in this file gets its divide-by-zero safety from. */
function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

// ---- pipeline value by stage ------------------------------------------------------

/** One row of the "pipeline value by stage" chart. */
export interface StageValue {
  stage: LeadStage;
  count: number;
  /** raw sum of estimatedFee — leads without a figure count as 0 (same honest
   *  rule as lib/pipeline.ts's column feeSum) */
  rawSum: number;
  /** probability-weighted sum: estimatedFee × (probability ?? 0) / 100 per
   *  lead. A lead with no probability set weighs 0 — an unassessed lead makes
   *  no promise, so it inflates nothing. */
  weightedSum: number;
}

/** All six stages, always, in LEAD_STAGES order — an empty stage still gets a
 *  row with zeros, so the chart never drops a column. */
export function pipelineValueByStage(
  leads: Pick<Lead, 'stage' | 'estimatedFee' | 'probability'>[],
): StageValue[] {
  const rows = new Map<LeadStage, StageValue>(
    LEAD_STAGES.map((stage) => [stage, { stage, count: 0, rawSum: 0, weightedSum: 0 }]),
  );
  for (const lead of leads) {
    const row = rows.get(lead.stage);
    if (!row) continue; // stray/unknown stage in old data — never crash a report
    const fee = isFiniteNumber(lead.estimatedFee) ? lead.estimatedFee : 0;
    const probability = isFiniteNumber(lead.probability) ? lead.probability : 0;
    row.count += 1;
    row.rawSum += fee;
    row.weightedSum += (fee * probability) / 100;
  }
  return LEAD_STAGES.map((stage) => rows.get(stage)!);
}

// ---- win rate by sector / by client type ------------------------------------------

/** One row of the "win rate by sector" table. */
export interface SectorWinRate {
  /** the Lead.sector value (trimmed), or UNSPECIFIED when missing/blank */
  sector: string;
  won: number;
  lost: number;
  /** won / (won + lost), or null when the group has no closed leads yet —
   *  "no data" is null, never NaN */
  rate: number | null;
}

/** One row of the "win rate by client type" table — same shape as
 *  SectorWinRate, grouped on the lead's client's Client.type instead. */
export interface ClientTypeWinRate {
  /** the Client.type value (trimmed), or UNSPECIFIED when the client has no
   *  type — or when the lead's client can't be found at all */
  clientType: string;
  won: number;
  lost: number;
  rate: number | null;
}

/** Missing/blank/whitespace-only grouping values fold into UNSPECIFIED;
 *  everything else groups on its trimmed text (so "Residential " and
 *  "Residential" are one sector, not two). */
function normalizeGroup(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : UNSPECIFIED;
}

/** Shared engine for both win-rate tables. Groups come from EVERY lead (open
 *  ones included) but only closed leads (won/lost) count toward the rate — so
 *  a sector that's in the pipeline but has no closed history yet still shows a
 *  row, with rate null. Rows sort alphabetically, UNSPECIFIED pinned last. */
function winLossRows(
  entries: { stage: LeadStage; group: string }[],
): { group: string; won: number; lost: number; rate: number | null }[] {
  const groups = new Map<string, { won: number; lost: number }>();
  for (const { stage, group } of entries) {
    let row = groups.get(group);
    if (!row) {
      row = { won: 0, lost: 0 };
      groups.set(group, row);
    }
    if (stage === 'won') row.won += 1;
    else if (stage === 'lost') row.lost += 1;
  }
  return [...groups.entries()]
    .map(([group, { won, lost }]) => ({
      group,
      won,
      lost,
      rate: won + lost === 0 ? null : won / (won + lost),
    }))
    .sort((a, b) => {
      if (a.group === b.group) return 0;
      if (a.group === UNSPECIFIED) return 1;
      if (b.group === UNSPECIFIED) return -1;
      return a.group.localeCompare(b.group);
    });
}

/** Win rate grouped on Lead.sector (the free-text field the plan calls out as
 *  distinct from Client.type). */
export function winRateBySector(leads: Pick<Lead, 'stage' | 'sector'>[]): SectorWinRate[] {
  return winLossRows(
    leads.map((lead) => ({ stage: lead.stage, group: normalizeGroup(lead.sector) })),
  ).map(({ group, won, lost, rate }) => ({ sector: group, won, lost, rate }));
}

/** Win rate grouped on the lead's client's Client.type. A lead whose clientId
 *  matches no client (shouldn't happen — deleteClientCascade — but old backups
 *  are forever) lands in UNSPECIFIED rather than crashing or vanishing. */
export function winRateByClientType(
  leads: Pick<Lead, 'stage' | 'clientId'>[],
  clients: Pick<Client, 'id' | 'type'>[],
): ClientTypeWinRate[] {
  const typeByClientId = new Map(clients.map((c) => [c.id, c.type]));
  return winLossRows(
    leads.map((lead) => ({
      stage: lead.stage,
      group: normalizeGroup(typeByClientId.get(lead.clientId)),
    })),
  ).map(({ group, won, lost, rate }) => ({ clientType: group, won, lost, rate }));
}

// ---- average time from lead to award ----------------------------------------------

/** Mean days from a won lead's createdAt to its stageChangedAt (which
 *  patchLeadStage stamped when it moved to won). Only won leads with BOTH
 *  datetimes set and parseable count; null when none qualify (zero won leads,
 *  or won rows with blank dates from old data). Returns fractional days —
 *  round at the display layer, not here. */
export function avgLeadToAward(
  leads: Pick<Lead, 'stage' | 'createdAt' | 'stageChangedAt'>[],
): number | null {
  const durations: number[] = [];
  for (const lead of leads) {
    if (lead.stage !== 'won') continue;
    if (!lead.createdAt || !lead.stageChangedAt) continue;
    const start = Date.parse(lead.createdAt);
    const end = Date.parse(lead.stageChangedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    durations.push((end - start) / MS_PER_DAY);
  }
  return mean(durations);
}

// ---- fee calibration (proposed vs. won) -------------------------------------------

/** The bid-calibration numbers — how far final negotiated fees land from what
 *  was proposed, across won leads that recorded both figures. */
export interface FeeCalibration {
  /** how many won leads had both feeProposed and feeWon — the sample size the
   *  screen should show next to the averages */
  count: number;
  /** mean of (feeWon − feeProposed); null when count is 0 */
  avgDelta: number | null;
  /** mean of (feeWon − feeProposed) / feeProposed × 100. Leads whose
   *  feeProposed is 0 are skipped here (a percentage of nothing is undefined,
   *  not Infinity) though they still count toward avgDelta; null when no lead
   *  qualifies. */
  avgDeltaPct: number | null;
}

export function feeCalibration(
  leads: Pick<Lead, 'stage' | 'feeProposed' | 'feeWon'>[],
): FeeCalibration {
  const deltas: number[] = [];
  const pcts: number[] = [];
  for (const lead of leads) {
    if (lead.stage !== 'won') continue;
    if (!isFiniteNumber(lead.feeProposed) || !isFiniteNumber(lead.feeWon)) continue;
    const delta = lead.feeWon - lead.feeProposed;
    deltas.push(delta);
    if (lead.feeProposed !== 0) pcts.push((delta / lead.feeProposed) * 100);
  }
  return { count: deltas.length, avgDelta: mean(deltas), avgDeltaPct: mean(pcts) };
}
