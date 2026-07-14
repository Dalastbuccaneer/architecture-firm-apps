// Unit test for the pure reminder logic in src/lib/reminders.ts.
// Runs on plain Node (v23.6+ strips TS types natively): node test-reminders.mjs
import assert from 'node:assert/strict';
import {
  reminderStatus,
  reminderStatusWords,
  dueRemindersToday,
} from './src/lib/reminders.ts';

const TODAY = '2026-07-14';

let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log('PASS', name);
};

const mkReminder = (over = {}) => ({
  schemaVersion: 1,
  id: over.id ?? 'r-1',
  clientId: 'c-1',
  label: 'Follow up',
  dueDate: TODAY,
  reminderDays: 0,
  done: false,
  createdAt: '',
  updatedAt: '',
  ...over,
});

// ---- reminderStatus boundary math -------------------------------------------------

test('overdue: strictly past the due date, days goes negative', () => {
  assert.deepEqual(reminderStatus('2026-07-13', 0, TODAY), { state: 'overdue', days: -1 });
  assert.deepEqual(reminderStatus('2026-07-01', 0, TODAY), { state: 'overdue', days: -13 });
  // reminderDays never rescues a past date
  assert.deepEqual(reminderStatus('2026-07-13', 60, TODAY), { state: 'overdue', days: -1 });
});

test('due: on the day itself, even with reminderDays 0', () => {
  assert.deepEqual(reminderStatus(TODAY, 0, TODAY), { state: 'due', days: 0 });
  assert.deepEqual(reminderStatus(TODAY, 30, TODAY), { state: 'due', days: 0 });
});

test('due window boundary: exactly reminderDays out is due, one past it is ok', () => {
  assert.deepEqual(reminderStatus('2026-07-21', 7, TODAY), { state: 'due', days: 7 }); // +7 boundary in
  assert.deepEqual(reminderStatus('2026-07-22', 7, TODAY), { state: 'ok', days: 8 }); // +8 out
});

test('ok: tomorrow with no lead-time window, and anything far out', () => {
  assert.deepEqual(reminderStatus('2026-07-15', 0, TODAY), { state: 'ok', days: 1 });
  assert.deepEqual(reminderStatus('2027-01-01', 30, TODAY), { state: 'ok', days: 171 });
});

test('month/year boundaries and long spans stay in whole days', () => {
  assert.equal(reminderStatus('2026-08-01', 0, TODAY).days, 18); // across July's 31st
  assert.equal(reminderStatus('2025-07-14', 0, TODAY).days, -365); // a year back
});

// ---- reminderStatusWords plain language --------------------------------------------

test('reminderStatusWords: overdue phrasing, singular/plural', () => {
  assert.equal(reminderStatusWords({ state: 'overdue', days: -1 }), 'OVERDUE by 1 day');
  assert.equal(reminderStatusWords({ state: 'overdue', days: -13 }), 'OVERDUE by 13 days');
});

test('reminderStatusWords: due phrasing, today/singular/plural', () => {
  assert.equal(reminderStatusWords({ state: 'due', days: 0 }), 'Due today');
  assert.equal(reminderStatusWords({ state: 'due', days: 1 }), 'Due in 1 day');
  assert.equal(reminderStatusWords({ state: 'due', days: 7 }), 'Due in 7 days');
});

test('reminderStatusWords: ok is just OK', () => {
  assert.equal(reminderStatusWords({ state: 'ok', days: 42 }), 'OK');
});

test('words compose with status for real dates', () => {
  assert.equal(reminderStatusWords(reminderStatus('2026-07-08', 0, TODAY)), 'OVERDUE by 6 days');
  assert.equal(reminderStatusWords(reminderStatus(TODAY, 0, TODAY)), 'Due today');
  assert.equal(reminderStatusWords(reminderStatus('2026-07-18', 7, TODAY)), 'Due in 4 days');
  assert.equal(reminderStatusWords(reminderStatus('2026-08-14', 7, TODAY)), 'OK');
});

// ---- dueRemindersToday filtering + sort --------------------------------------------

test('dueRemindersToday: only due/overdue surface; ok stays off Today', () => {
  const out = dueRemindersToday(
    [
      mkReminder({ id: 'a', dueDate: '2026-07-10' }), // overdue
      mkReminder({ id: 'b', dueDate: TODAY }), // due today
      mkReminder({ id: 'c', dueDate: '2026-07-20', reminderDays: 7 }), // in window
      mkReminder({ id: 'd', dueDate: '2026-07-20', reminderDays: 0 }), // ok — outside window
      mkReminder({ id: 'e', dueDate: '2026-12-01', reminderDays: 30 }), // ok — far out
    ],
    TODAY,
  );
  assert.deepEqual(out.map((r) => r.id), ['a', 'b', 'c']);
});

test('dueRemindersToday: done reminders never surface, however overdue', () => {
  const out = dueRemindersToday(
    [
      mkReminder({ id: 'a', dueDate: '2025-01-01', done: true, doneAt: '2026-07-01T09:00:00.000Z' }),
      mkReminder({ id: 'b', dueDate: TODAY, done: true }),
      mkReminder({ id: 'c', dueDate: '2026-07-01' }), // the only live one
    ],
    TODAY,
  );
  assert.deepEqual(out.map((r) => r.id), ['c']);
});

test('dueRemindersToday: most overdue first, then due today, then window items', () => {
  const out = dueRemindersToday(
    [
      mkReminder({ id: 'window', dueDate: '2026-07-18', reminderDays: 14 }), // +4
      mkReminder({ id: 'today', dueDate: TODAY }), // 0
      mkReminder({ id: 'ancient', dueDate: '2025-07-01' }), // deeply overdue
      mkReminder({ id: 'late', dueDate: '2026-07-11' }), // -3
    ],
    TODAY,
  );
  assert.deepEqual(out.map((r) => r.id), ['ancient', 'late', 'today', 'window']);
});

test('dueRemindersToday: same-day ties break by label, then id — stable output', () => {
  const out = dueRemindersToday(
    [
      mkReminder({ id: 'z2', label: 'Chase fee proposal', dueDate: '2026-07-10' }),
      mkReminder({ id: 'z1', label: 'Chase fee proposal', dueDate: '2026-07-10' }),
      mkReminder({ id: 'a1', label: 'Book site visit', dueDate: '2026-07-10' }),
    ],
    TODAY,
  );
  assert.deepEqual(out.map((r) => r.id), ['a1', 'z1', 'z2']);
});

test('dueRemindersToday: does not mutate its input array', () => {
  const input = [
    mkReminder({ id: 'b', dueDate: TODAY }),
    mkReminder({ id: 'a', dueDate: '2026-07-01' }),
  ];
  dueRemindersToday(input, TODAY);
  assert.deepEqual(input.map((r) => r.id), ['b', 'a']);
});

test('dueRemindersToday: empty in, empty out', () => {
  assert.deepEqual(dueRemindersToday([], TODAY), []);
});

console.log(`\n${n}/${n} unit tests passed`);
