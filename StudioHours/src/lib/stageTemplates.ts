// Stage-template presets for Setup → Projects "Prefill stages…": one click
// lays out a project's phase rows from a standard vocabulary so a project won
// in a separate pricing tool (ArchOS) can be typed into Studio Hours in
// minutes instead of hand-adding each phase. Codes land in Phase.aiaCode — a
// free string, so nothing else in the app enforces this vocabulary. Default
// fee-weight % only matter when the user types a total project fee at prefill
// time; every value is a plain editable number afterward, same as a
// hand-added phase.

export interface StageTemplatePhase {
  code: string;
  name: string;
  /** default share of the total project fee, 0-100; each template's weights sum to 100 */
  weightPct: number;
}

export interface StageTemplate {
  id: string;
  label: string;
  /** one line, shown under the radio choice in the Prefill dialog */
  description: string;
  phases: StageTemplatePhase[];
}

export const STAGE_TEMPLATES: StageTemplate[] = [
  {
    id: 'riba-2020',
    label: 'RIBA stages (2020)',
    description: 'Preparation through Handover, 6 stages — matches ArchOS’s stage system.',
    phases: [
      { code: 'S1', name: 'Preparation and Briefing', weightPct: 5 },
      { code: 'S2', name: 'Concept Design', weightPct: 15 },
      { code: 'S3', name: 'Spatial Coordination', weightPct: 25 },
      { code: 'S4', name: 'Technical Design', weightPct: 30 },
      { code: 'S5', name: 'Construction / Site', weightPct: 20 },
      { code: 'S6', name: 'Handover', weightPct: 5 },
    ],
  },
  {
    id: 'aia-phases',
    label: 'AIA phases',
    description: 'Pre-Design through Construction Administration, 6 phases — this app’s own PD–CA vocabulary.',
    phases: [
      { code: 'PD', name: 'Pre-Design', weightPct: 5 },
      { code: 'SD', name: 'Schematic Design', weightPct: 15 },
      { code: 'DD', name: 'Design Development', weightPct: 20 },
      { code: 'CD', name: 'Construction Documents', weightPct: 35 },
      { code: 'BN', name: 'Bidding and Negotiation', weightPct: 5 },
      { code: 'CA', name: 'Construction Administration', weightPct: 20 },
    ],
  },
  {
    id: 'interiors-small',
    label: 'Interiors / small project',
    description: 'Concept through Site Follow-up, 4 short stages — for smaller scopes.',
    phases: [
      { code: 'CN', name: 'Concept', weightPct: 25 },
      { code: 'DV', name: 'Design Development', weightPct: 35 },
      { code: 'DC', name: 'Documentation', weightPct: 25 },
      { code: 'ST', name: 'Site Follow-up', weightPct: 15 },
    ],
  },
];

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Split totalFee across weights (percent-of-total, normally summing to 100)
 *  so the parts always add up to EXACTLY totalFee: round each share to the
 *  cent independently, then fold whatever the independent rounding left over
 *  into the single largest share. Claim invoices bill against these numbers,
 *  so a sum that's off by a cent is not acceptable.
 *
 *  Example: $333.33 split 5/15/25/30/20/5 rounds to 16.67/50.00/83.33/100.00/
 *  66.67/16.67 = $333.34 naively — one cent over — so the largest share
 *  (the 30% stage, $100.00) is trimmed to $99.99 to land on exactly $333.33. */
export function splitFeeByWeight(totalFee: number, weights: number[]): number[] {
  const shares = weights.map((w) => roundCents((totalFee * w) / 100));
  if (shares.length === 0) return shares;
  const sum = roundCents(shares.reduce((a, b) => a + b, 0));
  const remainder = roundCents(totalFee - sum);
  if (remainder !== 0) {
    // Fold the remainder into the largest shares without ever pushing one
    // below zero — tiny totals with tied weights (e.g. $0.02 split 25/25/25/25)
    // could otherwise turn the "largest" share negative. Unreachable with the
    // shipped templates, but the exact-sum contract must hold for any weights.
    let left = remainder;
    const order = shares.map((_, i) => i).sort((a, b) => shares[b] - shares[a]);
    for (const i of order) {
      if (left === 0) break;
      const adjusted = roundCents(shares[i] + left);
      if (adjusted >= 0) {
        shares[i] = adjusted;
        left = 0;
      } else {
        left = roundCents(left + shares[i]);
        shares[i] = 0;
      }
    }
    // Only reachable for a negative totalFee (callers block that): keep the
    // exact-sum contract anyway rather than silently dropping cents.
    if (left !== 0) shares[0] = roundCents(shares[0] + left);
  }
  return shares;
}
