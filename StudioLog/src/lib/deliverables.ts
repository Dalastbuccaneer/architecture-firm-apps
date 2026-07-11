// Pure helpers for the drawing register (deliverables). No React, no Dexie —
// unit-testable straight from Node (see test-deadlines.mjs).

import type { DeliverableIssue } from '../types';

/** The chronologically latest issue by DATE (not array-append order), so an
 *  issue backdated after a later one was already recorded still resolves to the
 *  true "last issue". Ties on the same date keep the later array entry.
 *  Returns undefined when there are no issues. */
export function getLatestIssue(issues: DeliverableIssue[]): DeliverableIssue | undefined {
  let latest: DeliverableIssue | undefined;
  for (const issue of issues) {
    if (latest === undefined || issue.date >= latest.date) latest = issue;
  }
  return latest;
}
