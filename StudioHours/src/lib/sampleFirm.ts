// Sample data — loads a small, believable 3-person demo firm so a first-time
// explorer of the Dashboard sees real signal instead of an empty state: a
// phase running hot (Miller Residence · CD at ~88% of budget), realistic
// staff utilization, and a few out-of-scope entries with their paper trail.
//
// Everything here is deterministic (same data every load) and self-contained —
// no randomness, so the numbers above stay true after edits.

import { db, getFlags, patchFlags, resetAll, setFirm } from '../db';
import type { Activity, NonProjectBucket, Person, Phase, Project, TimeEntry } from '../types';
import { SCHEMA_VERSION } from '../types';
import { addDaysISO, nowISO, todayISO, weekStartISO } from './dates';
import { aiaPhases, newFirm, newPerson, uid } from './seeds';

type PersonKey = 'dana' | 'priya' | 'sam';
type ProjectKey = 'miller' | 'hillside';

/**
 * One row of demo time: [personKey, weekIndex (0 = 3 weeks ago .. 3 = this
 * week), weekday (0 = Mon .. 4 = Fri), target ('miller' | 'hillside' |
 * 'bucket:<id>'), AIA phase code (null for bucket rows), activityId (null
 * for the one PTO row), hours, outOfScope?, requestedBy?].
 */
type RowTuple =
  | [PersonKey, number, number, string, string | null, string | null, number]
  | [PersonKey, number, number, string, string | null, string | null, number, true, string];

// prettier-ignore
const ROWS: RowTuple[] = [
  ["priya", 0, 0, "miller", "CD", "drafting", 7],
  ["priya", 0, 0, "miller", "SD", "design", 1],
  ["priya", 0, 1, "miller", "CD", "drafting", 8],
  ["priya", 0, 1, "hillside", "CD", "drafting", 1],
  ["priya", 0, 2, "miller", "CD", "drafting", 8.5],
  ["priya", 0, 3, "miller", "CD", "drafting", 7],
  ["priya", 0, 3, "miller", "DD", "design", 1.5],
  ["priya", 0, 4, "miller", "CD", "drafting", 7],
  ["priya", 0, 4, "bucket:admin", null, "admin-office", 1],
  ["priya", 1, 0, "miller", "CD", "drafting", 7],
  ["priya", 1, 0, "miller", "CD", "client-revision", 1.5],
  ["priya", 1, 1, "miller", "CD", "drafting", 8],
  ["priya", 1, 1, "hillside", "DD", "design", 1],
  ["priya", 1, 2, "bucket:pto", null, null, 8],
  ["priya", 1, 3, "miller", "CD", "drafting", 8],
  ["priya", 1, 3, "miller", "CA", "site-visit", 1],
  ["priya", 1, 4, "miller", "CD", "drafting", 7.5],
  ["priya", 1, 4, "hillside", "CD", "drafting", 1],
  ["priya", 2, 0, "miller", "CD", "drafting", 8],
  ["priya", 2, 1, "miller", "CD", "drafting", 7.5],
  ["priya", 2, 1, "miller", "CD", "coordination", 1],
  ["priya", 2, 2, "hillside", "CD", "drafting", 7],
  ["priya", 2, 3, "miller", "CD", "drafting", 8],
  ["priya", 2, 3, "bucket:admin", null, "admin-office", 1],
  ["priya", 2, 4, "miller", "CD", "drafting", 7],
  ["priya", 2, 4, "miller", "CA", "rfi", 1],
  ["priya", 3, 0, "miller", "CD", "drafting", 8],
  ["priya", 3, 1, "miller", "CD", "drafting", 7.5],
  ["priya", 3, 1, "hillside", "CD", "drafting", 1.5],
  ["priya", 3, 2, "miller", "CD", "drafting", 8],
  ["priya", 3, 3, "miller", "CD", "drafting", 7],
  ["priya", 3, 3, "miller", "CD", "client-revision", 1.5, true, "Client (email) — extra powder room, confirming scope"],
  ["priya", 3, 4, "miller", "CD", "drafting", 6.5],
  ["priya", 3, 4, "bucket:prof-dev", null, "prof-dev", 2],
  ["sam", 0, 0, "miller", "CD", "drafting", 7.5],
  ["sam", 0, 1, "miller", "CD", "drafting", 8],
  ["sam", 0, 1, "hillside", "SD", "design", 1],
  ["sam", 0, 2, "hillside", "CD", "drafting", 6],
  ["sam", 0, 3, "miller", "CD", "drafting", 8],
  ["sam", 0, 4, "miller", "CD", "drafting", 7],
  ["sam", 0, 4, "miller", "CA", "punch-list", 1],
  ["sam", 1, 0, "miller", "CD", "drafting", 8],
  ["sam", 1, 0, "miller", "CD", "coordination", 1],
  ["sam", 1, 1, "hillside", "CD", "drafting", 7],
  ["sam", 1, 2, "miller", "CD", "drafting", 7.5],
  ["sam", 1, 3, "miller", "CD", "drafting", 8],
  ["sam", 1, 3, "bucket:admin", null, "admin-office", 1],
  ["sam", 1, 4, "bucket:pto", null, null, 4],
  ["sam", 1, 4, "miller", "CD", "drafting", 4],
  ["sam", 2, 0, "miller", "CD", "drafting", 7],
  ["sam", 2, 1, "miller", "CD", "drafting", 7.5],
  ["sam", 2, 1, "miller", "CA", "punch-list", 2, true, "Client (site walk) — replace damaged fixture, confirming in writing"],
  ["sam", 2, 2, "hillside", "CD", "drafting", 6.5],
  ["sam", 2, 3, "miller", "CD", "drafting", 7.5],
  ["sam", 2, 4, "miller", "CD", "drafting", 6.5],
  ["sam", 2, 4, "hillside", "DD", "design", 1.5],
  ["sam", 3, 0, "miller", "CD", "drafting", 7.5],
  ["sam", 3, 1, "miller", "CD", "drafting", 7],
  ["sam", 3, 2, "miller", "CA", "rfi", 1, true, "Client (phone) — skylight addition, confirming in writing"],
  ["sam", 3, 2, "miller", "CD", "drafting", 6.5],
  ["sam", 3, 3, "hillside", "CD", "drafting", 7],
  ["sam", 3, 4, "miller", "CD", "drafting", 6.5],
  ["sam", 3, 4, "bucket:prof-dev", null, "prof-dev", 1.5],
  ["dana", 0, 0, "miller", "CD", "client-meeting", 4],
  ["dana", 0, 0, "hillside", "DD", "client-meeting", 2],
  ["dana", 0, 0, "bucket:marketing", null, "bd", 2],
  ["dana", 0, 1, "miller", "CA", "site-visit", 3],
  ["dana", 0, 1, "bucket:marketing", null, "bd", 3],
  ["dana", 0, 1, "bucket:admin", null, "internal-meeting", 1],
  ["dana", 0, 2, "miller", "CD", "coordination", 3],
  ["dana", 0, 2, "hillside", "CD", "client-meeting", 2],
  ["dana", 0, 2, "bucket:admin", null, "admin-office", 1.5],
  ["dana", 0, 3, "miller", "CA", "site-visit", 2],
  ["dana", 0, 3, "bucket:marketing", null, "bd", 3],
  ["dana", 0, 3, "bucket:admin", null, "admin-office", 1.5],
  ["dana", 0, 4, "miller", "CD", "client-meeting", 2.5],
  ["dana", 0, 4, "bucket:marketing", null, "bd", 2.5],
  ["dana", 0, 4, "bucket:admin", null, "internal-meeting", 1],
  ["dana", 1, 0, "hillside", "DD", "client-meeting", 2.5],
  ["dana", 1, 0, "bucket:marketing", null, "bd", 2.5],
  ["dana", 1, 0, "bucket:admin", null, "internal-meeting", 1],
  ["dana", 1, 1, "miller", "CD", "client-meeting", 1.5, true, "Client (phone) — skylight addition, confirming in writing"],
  ["dana", 1, 1, "miller", "CA", "site-visit", 1.5],
  ["dana", 1, 1, "bucket:marketing", null, "bd", 2.5],
  ["dana", 1, 2, "miller", "CD", "coordination", 4],
  ["dana", 1, 2, "bucket:marketing", null, "bd", 3],
  ["dana", 1, 2, "bucket:admin", null, "admin-office", 1],
  ["dana", 1, 3, "miller", "CA", "site-visit", 2],
  ["dana", 1, 3, "hillside", "CD", "client-meeting", 2],
  ["dana", 1, 3, "bucket:admin", null, "admin-office", 1.5],
  ["dana", 1, 4, "bucket:pto", null, null, 4],
  ["dana", 1, 4, "bucket:marketing", null, "bd", 2.5],
  ["dana", 2, 0, "miller", "CD", "client-meeting", 2.5],
  ["dana", 2, 0, "hillside", "DD", "client-meeting", 2],
  ["dana", 2, 0, "bucket:marketing", null, "bd", 2.5],
  ["dana", 2, 1, "miller", "CA", "site-visit", 3],
  ["dana", 2, 1, "bucket:marketing", null, "bd", 3],
  ["dana", 2, 1, "bucket:admin", null, "internal-meeting", 1],
  ["dana", 2, 2, "hillside", "CD", "client-meeting", 3.5],
  ["dana", 2, 2, "bucket:marketing", null, "bd", 3.5],
  ["dana", 2, 2, "bucket:admin", null, "admin-office", 1],
  ["dana", 2, 3, "miller", "CA", "coordination", 2.5],
  ["dana", 2, 3, "bucket:marketing", null, "bd", 2.5],
  ["dana", 2, 3, "bucket:admin", null, "admin-office", 1.5],
  ["dana", 2, 4, "miller", "CD", "client-meeting", 2],
  ["dana", 2, 4, "bucket:marketing", null, "bd", 3],
  ["dana", 2, 4, "bucket:admin", null, "internal-meeting", 1],
  ["dana", 3, 0, "miller", "CD", "client-meeting", 4],
  ["dana", 3, 0, "hillside", "DD", "client-meeting", 2],
  ["dana", 3, 0, "bucket:marketing", null, "bd", 2],
  ["dana", 3, 1, "miller", "CA", "site-visit", 2.5],
  ["dana", 3, 1, "bucket:marketing", null, "bd", 3],
  ["dana", 3, 1, "bucket:admin", null, "internal-meeting", 1],
  ["dana", 3, 2, "hillside", "CD", "client-meeting", 2.5],
  ["dana", 3, 2, "miller", "CD", "coordination", 2],
  ["dana", 3, 2, "bucket:admin", null, "admin-office", 1],
  ["dana", 3, 3, "miller", "CA", "site-visit", 2],
  ["dana", 3, 3, "bucket:marketing", null, "bd", 3],
  ["dana", 3, 3, "bucket:admin", null, "admin-office", 1.5],
  ["dana", 3, 4, "miller", "CD", "client-meeting", 2],
  ["dana", 3, 4, "bucket:marketing", null, "bd", 3],
  ["dana", 3, 4, "bucket:admin", null, "internal-meeting", 1],
];

function setBudgets(phases: Phase[], budgets: Partial<Record<string, number>>): void {
  for (const phase of phases) {
    const hours = budgets[phase.aiaCode];
    if (hours !== undefined) phase.budgetedHours = hours;
  }
}

function setFees(phases: Phase[], fees: Partial<Record<string, number>>): void {
  for (const phase of phases) {
    const fee = fees[phase.aiaCode];
    if (fee !== undefined) phase.budgetedFee = fee;
  }
}

function mkEntry(args: {
  person: Person;
  date: string;
  projectId: string;
  projectName: string;
  phase: Phase | null;
  bucket: NonProjectBucket | null;
  activity: Activity | null;
  hours: number;
  outOfScope: boolean;
  requestedBy: string | null;
}): TimeEntry {
  const { person, date, projectId, projectName, phase, bucket, activity, hours, outOfScope, requestedBy } = args;
  const baseBillable = bucket?.billableDefault ?? phase?.billableDefault ?? true;
  const billable = activity ? activity.billableDefault && baseBillable : baseBillable;
  const at = nowISO();
  return {
    id: uid(),
    schemaVersion: SCHEMA_VERSION,
    personId: person.personId,
    personName: person.name,
    date,
    projectId,
    projectName,
    phaseId: phase?.phaseId ?? null,
    phaseName: phase?.name ?? null,
    activityId: activity?.activityId ?? null,
    activityName: activity?.name ?? null,
    hours,
    billable,
    outOfScope,
    requestedBy,
    notes: null,
    source: 'manual',
    createdAt: at,
    updatedAt: at,
  };
}

export async function loadSampleFirm(): Promise<void> {
  const firm = newFirm('Atelier North');

  const dana = newPerson('Dana Wright');
  dana.targetUtilization = { min: 40, max: 65 };
  dana.isManager = true; // the principal — the explorer lands as her and sees all five tabs
  const priya = newPerson('Priya Raman');
  const sam = newPerson('Sam Ortiz');
  firm.people.push(dana, priya, sam);

  const millerPhases = aiaPhases();
  setBudgets(millerPhases, { SD: 120, DD: 160, CD: 320, CA: 140 });
  // Stage fees sum EXACTLY to the 85,000 project fee, so the fee-claim builder
  // demos clean (no reconciliation warning). PD/BN/CO stay unfeed on purpose —
  // they demo the grayed "no fee entered for this stage" rows.
  setFees(millerPhases, { SD: 12750, DD: 17000, CD: 34000, CA: 21250 });
  const miller: Project = {
    projectId: uid(),
    clientName: 'Miller Family',
    projectNumber: '2026-014',
    projectName: 'Miller Residence',
    status: 'active',
    billingMethod: 'fixed_fee',
    fee: 85000,
    phases: millerPhases,
  };

  const hillsidePhases = aiaPhases();
  setBudgets(hillsidePhases, { SD: 200, DD: 260, CD: 480 });
  const hillside: Project = {
    projectId: uid(),
    clientName: 'Hillside Health',
    projectNumber: '2026-021',
    projectName: 'Hillside Clinic',
    status: 'active',
    billingMethod: 'hourly',
    fee: null,
    phases: hillsidePhases,
  };

  firm.projects.push(miller, hillside);

  // Billing rates so the Invoices screen works the moment you land: a firm default
  // plus role-based per-person rates (principal higher than staff). Hillside is the
  // hourly project you'd typically invoice; Miller is fixed-fee (bill only its
  // out-of-scope additional services).
  firm.billingRates = {
    defaultHourlyRate: 150,
    personRates: { [dana.personId]: 195, [priya.personId]: 130, [sam.personId]: 115 },
    projectRates: {},
    currency: 'USD',
  };

  await setFirm(firm);

  const people: Record<PersonKey, Person> = { dana, priya, sam };
  const projects: Record<ProjectKey, Project> = { miller, hillside };

  const currentWeekStart = weekStartISO(todayISO());
  const weekStarts = [21, 14, 7, 0].map((daysBack) => addDaysISO(currentWeekStart, -daysBack));

  const entries: TimeEntry[] = ROWS.map((row) => {
    const [personKey, week, weekday, target, aiaCode, activityId, hours, outOfScope, requestedBy] = row;
    const person = people[personKey];
    const date = addDaysISO(weekStarts[week], weekday);
    const activity = activityId ? (firm.activities.find((a) => a.activityId === activityId) ?? null) : null;

    if (target.startsWith('bucket:')) {
      const bucketId = target.slice('bucket:'.length);
      const bucket = firm.nonProjectBuckets.find((b) => b.id === bucketId);
      if (!bucket) throw new Error(`sampleFirm: unknown bucket "${bucketId}"`);
      return mkEntry({
        person,
        date,
        projectId: bucket.id,
        projectName: bucket.name,
        phase: null,
        bucket,
        activity,
        hours,
        outOfScope: !!outOfScope,
        requestedBy: requestedBy ?? null,
      });
    }

    const project = projects[target as ProjectKey];
    const phase = project.phases.find((p) => p.aiaCode === aiaCode) ?? null;
    if (!phase) throw new Error(`sampleFirm: unknown phase "${aiaCode}" on "${target}"`);
    return mkEntry({
      person,
      date,
      projectId: project.projectId,
      projectName: project.projectName,
      phase,
      bucket: null,
      activity,
      hours,
      outOfScope: !!outOfScope,
      requestedBy: requestedBy ?? null,
    });
  });

  await db.entries.bulkPut(entries);
  // The explorer lands as the principal so the Dashboard — not an empty Week grid — is what they see first.
  await patchFlags({ meId: dana.personId, sampleLoaded: true });
}

/** Returns the app to first-run: clears the sample firm, its entries, and flags. */
export async function clearSampleData(): Promise<void> {
  const flags = await getFlags();
  if (flags.sampleLoaded) await resetAll();
}

export async function isSampleLoaded(): Promise<boolean> {
  return (await getFlags()).sampleLoaded;
}
