import type { Activity, FirmFile, NonProjectBucket, Person, Phase } from '../types';
import { SCHEMA_VERSION } from '../types';

export function uid(): string {
  return crypto.randomUUID();
}

/** AIA six-phase template (+ optional Closeout) — the vocabulary US small firms
 *  already speak. Budgets are set per-project by the manager. */
export function aiaPhases(includeCloseout = true): Phase[] {
  const defs: Array<[string, string]> = [
    ['Pre-Design', 'PD'],
    ['Schematic Design', 'SD'],
    ['Design Development', 'DD'],
    ['Construction Documents', 'CD'],
    ['Bidding / Negotiation', 'BN'],
    ['Construction Administration', 'CA'],
  ];
  if (includeCloseout) defs.push(['Closeout', 'CO']);
  return defs.map(([name, aiaCode], i) => ({
    phaseId: uid(),
    name,
    aiaCode,
    sequence: i + 1,
    budgetedHours: null,
    budgetedFee: null,
    billableDefault: true,
    status: 'open',
  }));
}

export const DEFAULT_BUCKETS: NonProjectBucket[] = [
  { id: 'marketing', name: 'Marketing / Business Development', billableDefault: false },
  { id: 'admin', name: 'Firm Admin / Internal', billableDefault: false },
  { id: 'pto', name: 'PTO / Vacation / Sick / Holiday', billableDefault: false },
  { id: 'prof-dev', name: 'Professional Development', billableDefault: false },
];

export const DEFAULT_ACTIVITIES: Activity[] = [
  { activityId: 'design', name: 'Design', billableDefault: true },
  { activityId: 'drafting', name: 'Drafting / Production', billableDefault: true },
  { activityId: 'client-meeting', name: 'Client Meeting', billableDefault: true },
  { activityId: 'client-revision', name: 'Client-Requested Revision', billableDefault: true },
  { activityId: 'coordination', name: 'Consultant Coordination', billableDefault: true },
  { activityId: 'site-visit', name: 'Site Visit / Observation', billableDefault: true },
  { activityId: 'research', name: 'Research / Code Review', billableDefault: true },
  { activityId: 'specs', name: 'Specifications', billableDefault: true },
  { activityId: 'renderings', name: 'Renderings / Visualization', billableDefault: true },
  { activityId: 'permitting', name: 'Permitting', billableDefault: true },
  { activityId: 'rfi', name: 'RFI Response / Submittal Review', billableDefault: true },
  { activityId: 'punch-list', name: 'Punch List', billableDefault: true },
  { activityId: 'admin-office', name: 'Admin / Office', billableDefault: false },
  { activityId: 'bd', name: 'Business Development / Proposals', billableDefault: false },
  { activityId: 'internal-meeting', name: 'Internal / Firm Meeting', billableDefault: false },
  { activityId: 'prof-dev', name: 'Professional Development / CE', billableDefault: false },
];

export function newPerson(name: string, weeklyCapacityHours = 40): Person {
  return {
    personId: uid(),
    name,
    weeklyCapacityHours,
    targetUtilization: { min: 75, max: 85 },
    active: true,
  };
}

export function newFirm(firmName: string): FirmFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportType: 'firm',
    firm: { firmName, defaultWeeklyCapacityHours: 40 },
    people: [],
    projects: [],
    nonProjectBuckets: DEFAULT_BUCKETS.map((b) => ({ ...b })),
    activities: DEFAULT_ACTIVITIES.map((a) => ({ ...a })),
  };
}
