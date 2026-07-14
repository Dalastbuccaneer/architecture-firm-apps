// StudioCRM — shared data contracts. Every persisted/exported object carries
// schemaVersion so future versions can migrate old files instead of rejecting
// them. This app owns the WIN-WORK side of the suite: clients, contacts, the
// opportunity pipeline, interactions, and follow-up reminders. Delivery lives
// in StudioLog, billing in StudioHours — no shared IDs cross app boundaries;
// the only hand-off is the manual clients-for-studio export.

export const SCHEMA_VERSION = 1;

// ---- clients (organizations) ----------------------------------------------------

/** An organization in your network — not just paying customers. `type` is the
 *  org's role in your world (client/developer/consultant/contractor/authority/
 *  other). It's free text with a UI <datalist> of common values — same
 *  "suggest, don't force" convention as StudioLog's discipline/code fields —
 *  so Reports can still group meaningfully without the app rejecting a value
 *  nobody anticipated. */
export interface Client {
  schemaVersion: number;
  id: string;
  name: string;
  /** the org's role in your network — free text, see CLIENT_TYPE_SUGGESTIONS */
  type?: string;
  website?: string;
  address?: string;
  /** how this org first came in — referral / RFP portal / repeat / cold outreach */
  source?: string;
  tags: string[];
  notes?: string;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

// ---- contacts (people) -----------------------------------------------------------

/** A person. Every contact belongs to a client — that's what makes this
 *  directory normalized, unlike StudioLog's optional-projectId contacts. */
export interface Contact {
  schemaVersion: number;
  id: string;
  clientId: string;
  name: string;
  /** free text — "Development Director", "Project Manager", … (no fixed enum) */
  role?: string;
  email?: string;
  phone?: string;
  /** primary contacts are who the clients-for-studio export prefers */
  isPrimary?: boolean;
  /** Contact.id of the person who referred/introduced this contact — this is
   *  the referral graph behind the Client Overview's "introduced by / has
   *  introduced" block. Absent = external/unknown. */
  introducedBy?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- leads (opportunities / proposals / tenders) ---------------------------------

/** The six pipeline stages. Board/column order lives in LEAD_STAGES. */
export type LeadStage =
  | 'inquiry'
  | 'qualified'
  | 'proposal_sent'
  | 'shortlisted'
  | 'won'
  | 'lost';

export type GoNoGoDecision = 'go' | 'no_go';

/** One opportunity. Proposal/tender tracking (go/no-go, fee proposed vs. fee
 *  won, submission deadline) is deliberately modeled as fields HERE, not a
 *  separate table — keeps the schema to 5 domain tables for a lightweight CRM. */
export interface Lead {
  schemaVersion: number;
  id: string;
  clientId: string;
  title: string;
  stage: LeadStage;
  /** free text + <datalist> — see PROJECT_TYPE_SUGGESTIONS */
  projectType?: string;
  /** free text + <datalist> — what Reports' "win rate by sector" groups on
   *  (distinct from Client.type). See SECTOR_SUGGESTIONS. */
  sector?: string;
  /** early ballpark figure */
  estimatedFee?: number;
  /** what was actually submitted in the proposal/tender */
  feeProposed?: number;
  /** final negotiated figure — estimated vs. proposed vs. won is the
   *  bid-calibration data Reports exists for */
  feeWon?: number;
  /** 0–100 — drives the probability-weighted pipeline value in Reports */
  probability?: number;
  /** YYYY-MM-DD — the RFP/tender SUBMISSION date (watched by Today/Pipeline) */
  submissionDeadline?: string;
  /** YYYY-MM-DD — expected or actual client DECISION date; a distinct date
   *  from the submission deadline, also watched by Today/Pipeline */
  decisionDate?: string;
  /** the go/no-go call — settable as soon as a lead is logged, before
   *  committing effort to a full proposal */
  goNoGoDecision?: GoNoGoDecision;
  /** the reasoning behind the go/no-go call */
  goNoGoNotes?: string;
  /** who's leading this response — free text; earns its keep once the firm
   *  isn't solo */
  leadOwner?: string;
  /** WHY this was won or lost — the fee-strategy data. The UI requires it on
   *  transition to EITHER 'won' or 'lost' (win reasons matter too, not just
   *  losses); it stays optional in the DB so old data never breaks. */
  outcomeReason?: string;
  /** ISO datetime of the last stage change — stamped by patchLeadStage (set it
   *  to createdAt when creating a lead) */
  stageChangedAt: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- interactions (activity log) ---------------------------------------------------

export type InteractionKind = 'call' | 'email' | 'meeting' | 'site_visit' | 'other';

/** One touchpoint — always tied to a client, optionally to a specific contact
 *  and/or a specific lead. */
export interface Interaction {
  schemaVersion: number;
  id: string;
  clientId: string;
  contactId?: string;
  leadId?: string;
  kind: InteractionKind;
  date: string; // YYYY-MM-DD
  summary: string;
  /** YYYY-MM-DD — optional convenience: when set AND logInteraction is called
   *  with {createFollowUp: true}, a linked Reminder is written in the same call */
  followUpDate?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- reminders (follow-ups) ----------------------------------------------------------

/** A follow-up. Reuses StudioHours' renewal math shape — due on `dueDate`,
 *  start surfacing `reminderDays` before it — rather than inventing a new one. */
export interface Reminder {
  schemaVersion: number;
  id: string;
  clientId: string;
  leadId?: string;
  label: string;
  dueDate: string; // YYYY-MM-DD
  /** start surfacing this many days before dueDate (default 0 = on the day) */
  reminderDays: number;
  /** NOTE: booleans are not valid IndexedDB keys, so the `done` index in db.ts
   *  never matches boolean values — query reminders with .filter(), not
   *  .where('done'). Kept boolean for honest modeling; a future version can
   *  migrate to 0|1 if an index is ever needed. */
  done: boolean;
  doneAt?: string; // ISO datetime
  createdAt: string;
  updatedAt: string;
}

// ---- local app flags (kv-stored) ------------------------------------------------------

export interface AppFlags {
  lastBackupAt: string | null;
  installBannerDismissedAt: string | null;
  /** once-per-install gates for the per-screen onboarding tours (driver.js) —
   *  one flag per screen, flipped when that screen's tour finishes or is
   *  dismissed, checked by maybeStartTourFor(view) */
  tourClientsDone: boolean;
  tourPipelineDone: boolean;
  tourTodayDone: boolean;
  tourReportsDone: boolean;
  tourSettingsDone: boolean;
}

export const DEFAULT_FLAGS: AppFlags = {
  lastBackupAt: null,
  installBannerDismissedAt: null,
  tourClientsDone: false,
  tourPipelineDone: false,
  tourTodayDone: false,
  tourReportsDone: false,
  tourSettingsDone: false,
};

// ---- shared display words ----------------------------------------------------------------

/** Pipeline board/column order. Iterate THIS for stage columns and stage
 *  <select>s — never Object.keys(LEAD_STAGE_LABEL). */
export const LEAD_STAGES: LeadStage[] = [
  'inquiry',
  'qualified',
  'proposal_sent',
  'shortlisted',
  'won',
  'lost',
];

/** Stage words shown next to (never instead of) any stage styling. */
export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  inquiry: 'Inquiry',
  qualified: 'Qualified',
  proposal_sent: 'Proposal sent',
  shortlisted: 'Shortlisted',
  won: 'Won',
  lost: 'Lost',
};

export const INTERACTION_KIND_LABEL: Record<InteractionKind, string> = {
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  site_visit: 'Site visit',
  other: 'Other',
};

export const GO_NO_GO_LABEL: Record<GoNoGoDecision, string> = {
  go: 'Go',
  no_go: 'No-go',
};

// ---- <datalist> suggestions (suggest, don't force — values stay free text) ----------------

/** Common values for Client.type — offered via <datalist>, never enforced. */
export const CLIENT_TYPE_SUGGESTIONS: string[] = [
  'Client',
  'Developer',
  'Consultant',
  'Contractor',
  'Authority',
  'Other',
];

/** Common values for Lead.sector — what "win rate by sector" groups on. */
export const SECTOR_SUGGESTIONS: string[] = [
  'Residential',
  'Commercial',
  'Hospitality',
  'Education',
  'Healthcare',
  'Government',
  'Mixed-use',
];

/** Common values for Lead.projectType. */
export const PROJECT_TYPE_SUGGESTIONS: string[] = [
  'New build',
  'Renovation',
  'Extension',
  'Fit-out',
  'Interior',
  'Masterplan',
  'Feasibility study',
];

/** Common values for Client.source — how this org first came into your
 *  network. Distinct from Lead.goNoGoNotes/outcomeReason: this is about the
 *  relationship's origin, not any one opportunity. */
export const CLIENT_SOURCE_SUGGESTIONS: string[] = [
  'Referral',
  'RFP portal',
  'Repeat client',
  'Cold outreach',
];
