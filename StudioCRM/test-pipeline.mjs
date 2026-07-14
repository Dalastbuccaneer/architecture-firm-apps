// Unit test for the pure Pipeline-screen logic in src/lib/pipeline.ts.
// Runs on plain Node (v23.6+ strips TS types natively): node test-pipeline.mjs
import assert from 'node:assert/strict';
import {
  isClosedStage,
  wonClientIds,
  nextLeadDate,
  leadsByStage,
  LEAD_DATE_HORIZON_DAYS,
  duePhrase,
  leadDateDaysLeft,
  leadDateLabel,
  submissionDeadlineLabel,
  decisionDateLabel,
} from './src/lib/pipeline.ts';
import { LEAD_STAGES } from './src/types.ts';

const TODAY = '2026-07-14';

let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log('PASS', name);
};

const mkLead = (over = {}) => ({
  schemaVersion: 1,
  id: over.id ?? 'l-1',
  clientId: 'c-1',
  title: 'Lead',
  stage: 'inquiry',
  stageChangedAt: '',
  createdAt: '',
  updatedAt: '',
  ...over,
});

// ---- stage predicates -------------------------------------------------------------

test('isClosedStage: only won and lost are closed', () => {
  assert.equal(isClosedStage('won'), true);
  assert.equal(isClosedStage('lost'), true);
  for (const s of ['inquiry', 'qualified', 'proposal_sent', 'shortlisted']) {
    assert.equal(isClosedStage(s), false, s);
  }
});

test('wonClientIds: clients with at least one won lead, duplicates collapsed', () => {
  const ids = wonClientIds([
    mkLead({ id: 'a', clientId: 'c-won', stage: 'won' }),
    mkLead({ id: 'b', clientId: 'c-won', stage: 'won' }), // second win, same client
    mkLead({ id: 'c', clientId: 'c-won', stage: 'lost' }), // a loss doesn't undo the win
    mkLead({ id: 'd', clientId: 'c-lost', stage: 'lost' }),
    mkLead({ id: 'e', clientId: 'c-open', stage: 'shortlisted' }),
  ]);
  assert.deepEqual([...ids].sort(), ['c-won']);
});

test('wonClientIds: no won leads -> empty set', () => {
  assert.equal(wonClientIds([]).size, 0);
  assert.equal(wonClientIds([mkLead({ stage: 'inquiry' }), mkLead({ id: 'l-2', stage: 'lost' })]).size, 0);
});

// ---- stage grouping (Pipeline columns) ----------------------------------------------

test('leadsByStage: always all six groups in LEAD_STAGES order, even when empty', () => {
  const out = leadsByStage([]);
  assert.deepEqual(out.map((g) => g.stage), LEAD_STAGES);
  assert.deepEqual(out.map((g) => g.stage), [
    'inquiry',
    'qualified',
    'proposal_sent',
    'shortlisted',
    'won',
    'lost',
  ]);
  for (const g of out) {
    assert.deepEqual(g.leads, []);
    assert.equal(g.count, 0);
    assert.equal(g.feeSum, 0);
  }
});

test('leadsByStage: counts and estimatedFee sums per stage; missing fee counts as 0', () => {
  const out = leadsByStage([
    mkLead({ id: 'a', stage: 'inquiry', estimatedFee: 10_000 }),
    mkLead({ id: 'b', stage: 'inquiry' }), // no fee yet — sums as 0
    mkLead({ id: 'c', stage: 'inquiry', estimatedFee: 2_500 }),
    mkLead({ id: 'd', stage: 'won', estimatedFee: 80_000 }),
  ]);
  const byStage = Object.fromEntries(out.map((g) => [g.stage, g]));
  assert.equal(byStage.inquiry.count, 3);
  assert.equal(byStage.inquiry.feeSum, 12_500);
  assert.equal(byStage.won.count, 1);
  assert.equal(byStage.won.feeSum, 80_000);
  assert.equal(byStage.qualified.count, 0);
  assert.equal(byStage.qualified.feeSum, 0);
});

test('leadsByStage: within a stage, nearest watched date first, undated last, ties by title', () => {
  const out = leadsByStage([
    mkLead({ id: 'a', stage: 'qualified', title: 'Zeta', submissionDeadline: '2026-07-20' }),
    mkLead({ id: 'b', stage: 'qualified', title: 'Beta' }), // undated -> last
    mkLead({ id: 'c', stage: 'qualified', title: 'Alpha' }), // undated, title before Beta
    mkLead({ id: 'd', stage: 'qualified', title: 'Late', decisionDate: '2026-07-01' }), // overdue -> first
    // decision date sooner than its submission deadline -> sorts on the decision date
    mkLead({
      id: 'e',
      stage: 'qualified',
      title: 'Mid',
      submissionDeadline: '2026-08-01',
      decisionDate: '2026-07-16',
    }),
  ]);
  const qualified = out.find((g) => g.stage === 'qualified');
  assert.deepEqual(qualified.leads.map((l) => l.id), ['d', 'e', 'a', 'c', 'b']);
});

test('nextLeadDate: the sooner of the two dates; either alone; neither -> null', () => {
  assert.equal(
    nextLeadDate({ submissionDeadline: '2026-07-20', decisionDate: '2026-08-01' }),
    '2026-07-20',
  );
  assert.equal(
    nextLeadDate({ submissionDeadline: '2026-08-01', decisionDate: '2026-07-20' }),
    '2026-07-20',
  );
  assert.equal(nextLeadDate({ submissionDeadline: '2026-07-20' }), '2026-07-20');
  assert.equal(nextLeadDate({ decisionDate: '2026-07-20' }), '2026-07-20');
  assert.equal(nextLeadDate({}), null);
});

// ---- near/overdue date labels --------------------------------------------------------

test('duePhrase plain language (suite wording)', () => {
  assert.equal(duePhrase(-3), 'Overdue by 3 days');
  assert.equal(duePhrase(-1), 'Overdue by 1 day');
  assert.equal(duePhrase(0), 'Due today');
  assert.equal(duePhrase(1), 'Due in 1 day');
  assert.equal(duePhrase(14), 'Due in 14 days');
});

test('leadDateDaysLeft: signed day counts; no date is never near/overdue', () => {
  assert.equal(leadDateDaysLeft('2026-07-10', TODAY), -4);
  assert.equal(leadDateDaysLeft(TODAY, TODAY), 0);
  assert.equal(leadDateDaysLeft('2026-07-28', TODAY), 14);
  assert.equal(leadDateDaysLeft(undefined, TODAY), null);
});

test('leadDateLabel horizon: within 14 days in, boundary day in, beyond out', () => {
  assert.equal(LEAD_DATE_HORIZON_DAYS, 14);
  assert.equal(leadDateLabel('2026-07-15', TODAY), 'Due in 1 day'); // +1
  assert.equal(leadDateLabel('2026-07-28', TODAY), 'Due in 14 days'); // +14 boundary
  assert.equal(leadDateLabel('2026-07-29', TODAY), null); // +15 out
});

test('leadDateLabel: due today labels; overdue always labels, however old', () => {
  assert.equal(leadDateLabel(TODAY, TODAY), 'Due today');
  assert.equal(leadDateLabel('2026-07-13', TODAY), 'Overdue by 1 day');
  assert.equal(leadDateLabel('2025-01-01', TODAY), 'Overdue by 559 days'); // long overdue still shows
});

test('leadDateLabel: no date -> null; custom horizon respected', () => {
  assert.equal(leadDateLabel(undefined, TODAY), null);
  assert.equal(leadDateLabel('2026-07-21', TODAY, 7), 'Due in 7 days'); // +7 boundary in
  assert.equal(leadDateLabel('2026-07-22', TODAY, 7), null); // +8 out
});

test('submissionDeadlineLabel: reads submissionDeadline on open leads only', () => {
  const open = mkLead({ stage: 'proposal_sent', submissionDeadline: '2026-07-10', decisionDate: TODAY });
  assert.equal(submissionDeadlineLabel(open, TODAY), 'Overdue by 4 days'); // not the decision date
  assert.equal(submissionDeadlineLabel(mkLead({ stage: 'qualified' }), TODAY), null); // no date
  // closed leads never flag, even with an "overdue" date on record
  assert.equal(submissionDeadlineLabel(mkLead({ stage: 'won', submissionDeadline: '2026-07-01' }), TODAY), null);
  assert.equal(submissionDeadlineLabel(mkLead({ stage: 'lost', submissionDeadline: '2026-07-01' }), TODAY), null);
});

test('decisionDateLabel: reads decisionDate on open leads only', () => {
  const open = mkLead({ stage: 'shortlisted', decisionDate: '2026-07-18', submissionDeadline: '2026-07-01' });
  assert.equal(decisionDateLabel(open, TODAY), 'Due in 4 days'); // not the submission deadline
  assert.equal(decisionDateLabel(mkLead({ stage: 'inquiry' }), TODAY), null); // no date
  assert.equal(decisionDateLabel(mkLead({ stage: 'won', decisionDate: '2026-07-01' }), TODAY), null);
  assert.equal(decisionDateLabel(mkLead({ stage: 'lost', decisionDate: '2026-07-01' }), TODAY), null);
});

console.log(`\n${n}/${n} unit tests passed`);
