// Pure logic behind the Pipeline screen (and the export-eligibility rule) — no
// Dexie, no React, so it is unit-testable straight from Node (see
// test-pipeline.mjs at the repo root). Shaped on StudioLog's lib/deadlines.ts:
// keep every aggregation HERE and the screen components thin. Follow-up
// reminder surfacing is NOT here — that's lib/reminders.ts (dueRemindersToday).
//
// The '.ts' import extensions are on purpose: Node's native type-stripping
// (which runs the unit test) resolves relative .ts imports only when they are
// explicit. Vite and tsc both accept it (allowImportingTsExtensions).

import { LEAD_STAGES, type Lead, type LeadStage } from '../types.ts';
import { daysBetween } from './dates.ts';

// ---- stage predicates -------------------------------------------------------------

/** Won and lost leads are CLOSED: their dates are settled history, so they are
 *  never flagged as near/overdue (same rule as StudioLog, where a done task is
 *  never overdue however late it was finished). */
export function isClosedStage(stage: LeadStage): boolean {
  return stage === 'won' || stage === 'lost';
}

/** Clients with at least one WON lead. This is the eligibility set for the
 *  clients-for-studio export and the Overview tab's "past won work" block —
 *  both must use THIS function so the rule can never drift between them. */
export function wonClientIds(leads: Pick<Lead, 'clientId' | 'stage'>[]): Set<string> {
  const ids = new Set<string>();
  for (const lead of leads) if (lead.stage === 'won') ids.add(lead.clientId);
  return ids;
}

// ---- stage grouping (the Pipeline board's columns) ---------------------------------

/** One Pipeline column: every lead in the stage plus the column header's
 *  numbers. `feeSum` is the raw sum of `estimatedFee` (leads without a figure
 *  count as 0 — a column of unpriced inquiries honestly sums to 0). */
export interface StageGroup {
  stage: LeadStage;
  leads: Lead[];
  count: number;
  feeSum: number;
}

/** The soonest date worth watching on a lead — the earlier of its submission
 *  deadline and decision date (either may be absent). null = nothing to watch. */
export function nextLeadDate(
  lead: Pick<Lead, 'submissionDeadline' | 'decisionDate'>,
): string | null {
  const a = lead.submissionDeadline;
  const b = lead.decisionDate;
  if (a && b) return a < b ? a : b; // YYYY-MM-DD strings compare chronologically
  return a || b || null;
}

/** Cards with a watched date come first, soonest (most overdue) first; undated
 *  cards follow; ties by title then id so the order is stable. */
function compareCards(a: Lead, b: Lead): number {
  const da = nextLeadDate(a);
  const db = nextLeadDate(b);
  if (da !== null && db !== null && da !== db) return da < db ? -1 : 1;
  if ((da === null) !== (db === null)) return da === null ? 1 : -1;
  return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

/** Every lead grouped into the six pipeline stages, ALWAYS in LEAD_STAGES
 *  order and always all six groups — an empty stage still renders as an empty
 *  column with count 0 / sum 0, never disappears. Within a stage, cards sort
 *  via compareCards (nearest watched date first, undated last). */
export function leadsByStage(leads: Lead[]): StageGroup[] {
  const byStage = new Map<LeadStage, Lead[]>(LEAD_STAGES.map((s) => [s, []]));
  for (const lead of leads) byStage.get(lead.stage)?.push(lead);
  return LEAD_STAGES.map((stage) => {
    const group = byStage.get(stage)!.sort(compareCards);
    return {
      stage,
      leads: group,
      count: group.length,
      feeSum: group.reduce((sum, l) => sum + (l.estimatedFee ?? 0), 0),
    };
  });
}

// ---- near/overdue date labels (submissionDeadline / decisionDate) -------------------

/** How far ahead a lead date is flagged on its card, in days (~2 weeks — same
 *  window StudioLog's Today screen uses for log items and tasks). */
export const LEAD_DATE_HORIZON_DAYS = 14;

/** Plain-language due phrase — the suite's exact wording (StudioLog's
 *  deadlines.ts): "Overdue by 3 days" / "Due today" / "Due in 5 days". */
export function duePhrase(daysLeft: number): string {
  if (daysLeft < 0) return `Overdue by ${-daysLeft} day${daysLeft === -1 ? '' : 's'}`;
  if (daysLeft === 0) return 'Due today';
  return `Due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
}

/** Whole days until a lead date (negative = overdue), or null when the lead
 *  has no such date — an unset date can never be near or overdue. */
export function leadDateDaysLeft(dateStr: string | undefined, today: string): number | null {
  if (!dateStr) return null;
  return daysBetween(today, dateStr);
}

/** The card label for a lead date, or null when nothing should show: no date,
 *  or still comfortably beyond `horizonDays`. Every overdue date labels,
 *  however old. The caller adds its own context word ("Submission" /
 *  "Decision") — this returns only the duePhrase wording. */
export function leadDateLabel(
  dateStr: string | undefined,
  today: string,
  horizonDays: number = LEAD_DATE_HORIZON_DAYS,
): string | null {
  const daysLeft = leadDateDaysLeft(dateStr, today);
  if (daysLeft === null || daysLeft > horizonDays) return null;
  return duePhrase(daysLeft);
}

/** Near/overdue label for a lead's SUBMISSION deadline — null for won/lost
 *  leads (closed opportunities have nothing left to submit). */
export function submissionDeadlineLabel(
  lead: Pick<Lead, 'stage' | 'submissionDeadline'>,
  today: string,
  horizonDays: number = LEAD_DATE_HORIZON_DAYS,
): string | null {
  if (isClosedStage(lead.stage)) return null;
  return leadDateLabel(lead.submissionDeadline, today, horizonDays);
}

/** Near/overdue label for a lead's DECISION date — null for won/lost leads
 *  (the decision already happened; that's what won/lost means). */
export function decisionDateLabel(
  lead: Pick<Lead, 'stage' | 'decisionDate'>,
  today: string,
  horizonDays: number = LEAD_DATE_HORIZON_DAYS,
): string | null {
  if (isClosedStage(lead.stage)) return null;
  return leadDateLabel(lead.decisionDate, today, horizonDays);
}
