// The app-wide manager rule, in ONE place. Used by App.tsx (which tabs show up
// front), People.tsx (which sub-tabs exist at all), and the Dashboard's
// renewals strip. The rule: people marked "Can manage the firm" see everything;
// and in a firm where NOBODY carries the flag (firm files from before it
// existed), everyone sees everything — a legacy firm must never lock its owner
// out. Anyone else is staff: Week up front, firm tabs behind "More", and no
// people-operations data anywhere.

import type { FirmFile, Person } from '../types';

export function managerAccess(firm: FirmFile, me: Person | null): boolean {
  const hasAnyManager = firm.people.some((p) => p.isManager === true);
  return me?.isManager === true || !hasAnyManager;
}
