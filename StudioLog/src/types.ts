// StudioLog — shared data contracts. Every persisted/exported object carries
// schemaVersion so future versions can migrate old files instead of rejecting
// them. Stages carry NO fees — money lives in StudioHours, never here.

export const SCHEMA_VERSION = 1;

// ---- projects -----------------------------------------------------------------

export type ProjectStatus = 'active' | 'on_hold' | 'closed';
export type StageStatus = 'pending' | 'in_progress' | 'done';

/** One delivery stage of a project (e.g. RIBA S3 "Spatial Coordination").
 *  Lives embedded in its Project row — stages are few and always edited in
 *  the project's context. */
export interface Stage {
  /** Stable per-project sequence number, NOT the array position. Never
   *  renumbered when a stage is removed, so a Deliverable.stageIndex written
   *  by a later version keeps pointing at the same stage forever. New stages
   *  get max(stageIndex)+1; display order is ascending stageIndex. */
  stageIndex: number;
  code: string; // 'S3', 'DD', … — free text, templates just prefill it
  name: string;
  startDate?: string; // YYYY-MM-DD
  /** the stage DEADLINE — what the Today screen watches */
  endDate?: string; // YYYY-MM-DD
  status: StageStatus;
}

/** A pointer to where the real files live (cloud drive, server folder link).
 *  StudioLog never stores files — links only. */
export interface ProjectLink {
  label: string;
  url: string;
}

export interface Project {
  schemaVersion: number;
  projectId: string;
  projectNumber?: string;
  projectName: string;
  clientName?: string;
  status: ProjectStatus;
  startDate?: string; // YYYY-MM-DD
  stages: Stage[];
  links: ProjectLink[];
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

// ---- deliverables (drawing register) — table exists, UI comes later ------------

export type DeliverableStatus = 'not_started' | 'in_progress' | 'issued' | 'superseded';
export type IssuePurpose = 'information' | 'approval' | 'tender' | 'construction';

/** One issue event of a drawing: "rev B went out on 2026-03-02 for approval". */
export interface DeliverableIssue {
  rev: string;
  date: string; // YYYY-MM-DD
  purpose: IssuePurpose;
  notes?: string;
}

export interface Deliverable {
  schemaVersion: number;
  id: string;
  projectId: string;
  /** points at Stage.stageIndex within the project (stable, see Stage) */
  stageIndex?: number;
  discipline?: string; // 'A', 'S', 'MEP', … — free text
  number: string; // sheet number, e.g. 'A-101'
  title: string;
  scale?: string;
  size?: string; // 'A1', 'ARCH D', …
  currentRev: string;
  status: DeliverableStatus;
  issues: DeliverableIssue[];
  /** manual ordering within the register (drag/sort later) */
  sortKey: number;
  createdAt: string;
  updatedAt: string;
}

// ---- log items (RFI / correspondence log) — table exists, UI comes later -------

export type LogItemType = 'rfi' | 'submittal' | 'approval' | 'instruction' | 'decision' | 'general';
export type LogItemStatus = 'open' | 'answered' | 'closed';

export interface LogItem {
  schemaVersion: number;
  id: string;
  projectId: string;
  type: LogItemType;
  /** external reference, e.g. 'RFI-014' */
  ref?: string;
  /** who raised it / who it's with — contractor, client, authority name */
  party: string;
  subject: string;
  dateRaised: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD — what the Today screen watches
  status: LogItemStatus;
  answer?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- tasks — table exists, UI comes later ---------------------------------------

export interface Task {
  schemaVersion: number;
  id: string;
  /** absent = a firm-level to-do not tied to one project */
  projectId?: string;
  title: string;
  due?: string; // YYYY-MM-DD
  /** NOTE: booleans are not valid IndexedDB keys, so the `done` index in db.ts
   *  never matches boolean values — query tasks with .filter(), not
   *  .where('done'). Kept boolean for honest modeling; a future version can
   *  migrate to 0|1 if an index is ever needed. */
  done: boolean;
  doneAt?: string; // ISO datetime
  notes?: string;
}

// ---- notes (meeting / site visit) — table exists, UI comes later ----------------

export type NoteKind = 'meeting' | 'site_visit';

export interface NoteAction {
  id: string;
  text: string;
  done: boolean;
}

export interface Note {
  schemaVersion: number;
  id: string;
  projectId: string;
  kind: NoteKind;
  date: string; // YYYY-MM-DD
  title: string;
  attendees?: string;
  body: string;
  /** links to photos in the user's own storage — StudioLog stores no files */
  photoLinks?: string[];
  actions: NoteAction[];
  createdAt: string;
  updatedAt: string;
}

// ---- contacts — table exists, UI comes later ------------------------------------

export type ContactRole = 'client' | 'consultant' | 'contractor' | 'authority' | 'other';

export interface Contact {
  schemaVersion: number;
  id: string;
  /** absent = a firm-wide contact, not tied to one project */
  projectId?: string;
  name: string;
  org?: string;
  role: ContactRole;
  email?: string;
  phone?: string;
  notes?: string;
}

// ---- local app flags (kv-stored) -------------------------------------------------

export interface AppFlags {
  lastBackupAt: string | null;
  installBannerDismissedAt: string | null;
}

export const DEFAULT_FLAGS: AppFlags = {
  lastBackupAt: null,
  installBannerDismissedAt: null,
};

// ---- shared display words ---------------------------------------------------------

/** Status words shown next to (never instead of) status colors. */
export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  done: 'Done',
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  on_hold: 'On hold',
  closed: 'Closed',
};

export const DELIVERABLE_STATUS_LABEL: Record<DeliverableStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  issued: 'Issued',
  superseded: 'Superseded',
};

export const ISSUE_PURPOSE_LABEL: Record<IssuePurpose, string> = {
  information: 'For information',
  approval: 'For approval',
  tender: 'For tender',
  construction: 'For construction',
};

export const LOG_ITEM_TYPE_LABEL: Record<LogItemType, string> = {
  rfi: 'RFI',
  submittal: 'Submittal',
  approval: 'Approval',
  instruction: 'Instruction',
  decision: 'Decision',
  general: 'General',
};

export const LOG_ITEM_STATUS_LABEL: Record<LogItemStatus, string> = {
  open: 'Open',
  answered: 'Answered',
  closed: 'Closed',
};

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  meeting: 'Meeting',
  site_visit: 'Site visit',
};

/** Key order here is the display/grouping order on the Contacts tab. */
export const CONTACT_ROLE_LABEL: Record<ContactRole, string> = {
  client: 'Client',
  consultant: 'Consultant',
  contractor: 'Contractor',
  authority: 'Authority',
  other: 'Other',
};
