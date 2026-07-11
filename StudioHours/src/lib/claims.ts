// Fee-claim engine — pure functions that turn "bill up to X% of each stage fee"
// into invoice lines, plus the guards that make double-claiming impossible.
// No React, no DB (mirrors invoice.ts). The builder screen owns state and
// persistence; this file owns the math so it can be unit-reasoned and reused.
//
// Domain: architecture firms bill fixed-fee work as monthly progress claims
// stated CUMULATIVELY — "Stage 2 fee is 490,000; last month we billed 40% of
// it, this month we're at 60%, so this invoice = 20% × 490,000 = 98,000."

import type { FirmFile, Invoice, InvoiceLine, Project } from '../types';
import { SCHEMA_VERSION } from '../types';
import { firmRates } from './rates';
import { addDaysISO, nowISO } from './dates';
import { uid } from './seeds';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Absent/undefined invoiceType = 'time': every invoice saved before fee claims
 *  existed keeps meaning what it meant. */
export function isClaimInvoice(inv: Pick<Invoice, 'invoiceType'>): boolean {
  return inv.invoiceType === 'claim';
}

/** Clamp a stored percentage into [0, 100] before it feeds any guard math, so a
 *  hand-edited outlier (a 150 typed into the editor) can never poison future
 *  claims beyond capping that stage at fully-billed. */
const clampPct = (n: number): number => Math.min(100, Math.max(0, n));

/** Cumulative "% billed to date" per phase, from ALL saved claim invoices of the
 *  project REGARDLESS of status — a parked draft still counts, so you can't
 *  double-claim a stage by forgetting a draft exists. (Deleting an invoice frees
 *  its percentages again, matching how deleting a time invoice frees its hours.)
 *
 *  Why max-of-newPct, not sum-of-deltas: claims are stated cumulatively ("we are
 *  at 60% to date"), so the project's true position is the HIGHEST % ever stated
 *  per stage. With clean data max and sum agree (40 then 40→60 gives 60 either
 *  way), but max stays correct when an invoice is edited or a correction is
 *  re-issued at the same %, where summing deltas would double-count or drift.
 *  Within one invoice, duplicate claims against the same phase are collapsed
 *  defensively: the LAST line wins, then that per-invoice value joins the max. */
export function claimedPctByPhase(invoices: Invoice[], projectId: string): Map<string, number> {
  const byPhase = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.projectId !== projectId || !isClaimInvoice(inv)) continue;
    const perInvoice = new Map<string, number>();
    for (const line of inv.lines) {
      if (line.claim) perInvoice.set(line.claim.phaseId, clampPct(line.claim.newPct)); // last wins
    }
    for (const [phaseId, pct] of perInvoice) {
      byPhase.set(phaseId, Math.max(byPhase.get(phaseId) ?? 0, pct));
    }
  }
  return byPhase;
}

/** One stage's requested cumulative position: "bill up to newPct% to date". */
export interface ClaimInput {
  phaseId: string;
  newPct: number;
}

export type ClaimErrorKind = 'over_100' | 'below_previous';

/** A hard-blocking problem with one stage's requested percentage. `message` is
 *  ready-to-show plain language; kind/pcts let the UI place it on the row. */
export interface ClaimError {
  phaseId: string;
  phaseName: string;
  kind: ClaimErrorKind;
  prevPct: number;
  newPct: number;
  message: string;
}

/** Hard guards, evaluated per stage:
 *  - over_100: a stage fee can never be billed past 100%.
 *  - below_previous: this UI can't un-claim — billing "up to" less than what's
 *    already billed would mean a negative invoice line. (Corrections happen by
 *    editing or deleting the earlier invoice, which frees the percentage.) */
export function validateClaims(
  project: Project,
  claimedSoFar: Map<string, number>,
  inputs: ClaimInput[],
): ClaimError[] {
  const errors: ClaimError[] = [];
  for (const input of inputs) {
    const phase = project.phases.find((ph) => ph.phaseId === input.phaseId);
    if (!phase) continue;
    const prevPct = clampPct(claimedSoFar.get(input.phaseId) ?? 0);
    if (input.newPct > 100) {
      errors.push({
        phaseId: input.phaseId,
        phaseName: phase.name,
        kind: 'over_100',
        prevPct,
        newPct: input.newPct,
        message: `Can't bill more than 100% of the ${phase.name} fee.`,
      });
    } else if (input.newPct < prevPct) {
      errors.push({
        phaseId: input.phaseId,
        phaseName: phase.name,
        kind: 'below_previous',
        prevPct,
        newPct: input.newPct,
        message: `You've already billed ${prevPct}% of ${phase.name} — enter ${prevPct} or more.`,
      });
    }
  }
  return errors;
}

/** Non-blocking reconciliation warning: the typed-in stage fees don't add up to
 *  the project fee (numbers keyed in from ArchOS et al. often don't reconcile).
 *  The manager must SEE it — "your stage fees add up to X but the project fee is
 *  Y" — but can still bill. Only fires when a project fee is actually entered
 *  (> 0); with no project fee there is nothing to reconcile against. */
export interface StageFeeMismatch {
  stageFeeSum: number;
  projectFee: number;
}

export function stageFeeMismatch(project: Project): StageFeeMismatch | null {
  const fee = project.fee;
  if (typeof fee !== 'number' || fee <= 0) return null;
  const sum = round2(project.phases.reduce((s, ph) => s + (ph.budgetedFee ?? 0), 0));
  return Math.abs(sum - fee) >= 0.005 ? { stageFeeSum: sum, projectFee: fee } : null;
}

/** Roll requested cumulative percentages into invoice lines:
 *  amount = (newPct − prevPct) / 100 × basisFee, rounded to 2dp (same round2 as
 *  invoice.ts), basisFee = phase.budgetedFee ?? 0. Lines come out in the
 *  project's stage order. Skipped defensively (validateClaims is the loud gate;
 *  this function simply never manufactures a bad line):
 *  - stages with no change (newPct == prevPct) and un-claims (newPct < prevPct);
 *  - stages with no fee entered (basisFee <= 0) — a $0 line that still RECORDED
 *    a newPct would silently mark the stage claimed before its fee exists;
 *  - duplicate inputs for one stage (last one wins). */
export function buildClaimLines(
  project: Project,
  claimedSoFar: Map<string, number>,
  inputs: ClaimInput[],
): InvoiceLine[] {
  const requested = new Map<string, number>();
  for (const input of inputs) requested.set(input.phaseId, input.newPct); // last wins
  const phases = [...project.phases].sort((a, b) => a.sequence - b.sequence);
  const lines: InvoiceLine[] = [];
  for (const phase of phases) {
    const newPctRaw = requested.get(phase.phaseId);
    if (newPctRaw === undefined) continue;
    const basisFee = phase.budgetedFee ?? 0;
    if (basisFee <= 0) continue;
    const prevPct = clampPct(claimedSoFar.get(phase.phaseId) ?? 0);
    const newPct = round2(newPctRaw);
    if (newPct <= round2(prevPct)) continue;
    lines.push({
      lineId: uid(),
      description: `${phase.aiaCode ? `${phase.aiaCode} — ` : ''}${phase.name}`,
      hours: 0,
      rate: 0,
      amount: round2(((newPct - prevPct) / 100) * basisFee),
      claim: {
        phaseId: phase.phaseId,
        phaseName: phase.name,
        basisFee,
        prevPct: round2(prevPct),
        newPct,
      },
    });
  }
  return lines;
}

export interface MakeClaimInvoiceArgs {
  firm: FirmFile;
  project: Project;
  invoiceNumber: string;
  issueDate: string;
  periodStart: string;
  periodEnd: string;
  claimedSoFar: Map<string, number>;
  inputs: ClaimInput[];
  netTermsDays?: number;
}

/** Assemble a fresh draft fee-claim invoice. Mirrors makeInvoice: every
 *  client-facing firm/project field is snapshotted so a later upstream edit
 *  never rewrites this document. sourceEntryIds stays [] — a claim consumes no
 *  time entries, so it never collides with the hourly double-billing guard. */
export function makeClaimInvoice(args: MakeClaimInvoiceArgs): Invoice {
  const { firm, project, invoiceNumber, issueDate, periodStart, periodEnd, claimedSoFar, inputs } = args;
  const netDays = args.netTermsDays ?? 30;
  const rates = firmRates(firm);
  const at = nowISO();
  return {
    invoiceId: uid(),
    schemaVersion: SCHEMA_VERSION,
    invoiceNumber,
    status: 'draft',
    invoiceType: 'claim',
    firmName: firm.firm.firmName,
    projectId: project.projectId,
    projectName: project.projectName,
    projectNumber: project.projectNumber,
    clientName: project.clientName,
    billingMethod: project.billingMethod,
    issueDate,
    dueDate: addDaysISO(issueDate, netDays),
    periodStart,
    periodEnd,
    groupBy: 'phase', // claim lines are stages by definition
    includeBillable: false, // no time entries feed a claim
    includeOutOfScope: false,
    currency: rates.currency || 'USD',
    lines: buildClaimLines(project, claimedSoFar, inputs),
    taxRate: 0,
    taxLabel: 'Tax',
    discount: 0,
    notes: null,
    terms: `Payment due within ${netDays} days of the invoice date.`,
    sourceEntryIds: [],
    createdAt: at,
    updatedAt: at,
  };
}
