// Unit test for the pure Today-screen logic in src/lib/deadlines.ts.
// Runs on plain Node (v23.6+ strips TS types natively): node test-deadlines.mjs
import assert from 'node:assert/strict';
import {
  stageDeadlines,
  duePhrase,
  DEADLINE_HORIZON_DAYS,
  logItemOverdueDays,
  logItemOverduePhrase,
  taskOverdueDays,
  taskOverduePhrase,
  ITEM_HORIZON_DAYS,
  TODAY_LIST_CAP,
  logItemsDue,
  tasksDue,
  openFollowUps,
  todaySurface,
  isAllClear,
  capList,
} from './src/lib/deadlines.ts';
import { normalizeUrl } from './src/lib/url.ts';
import { getLatestIssue } from './src/lib/deliverables.ts';

const TODAY = '2026-07-07';

let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log('PASS', name);
};

const mkStage = (stageIndex, over = {}) => ({
  stageIndex,
  code: `S${stageIndex + 1}`,
  name: `Stage ${stageIndex + 1}`,
  status: 'pending',
  ...over,
});

const mkProject = (name, stages, over = {}) => ({
  schemaVersion: 1,
  projectId: `id-${name}`,
  projectName: name,
  status: 'active',
  stages,
  links: [],
  createdAt: '',
  updatedAt: '',
  ...over,
});

test('horizon: within 28 days in, beyond out, boundary day in', () => {
  const p = mkProject('Alpha', [
    mkStage(0, { endDate: '2026-07-20' }), // +13 → in
    mkStage(1, { endDate: '2026-08-04' }), // +28 → in (boundary)
    mkStage(2, { endDate: '2026-08-05' }), // +29 → out
  ]);
  const out = stageDeadlines([p], TODAY);
  assert.equal(DEADLINE_HORIZON_DAYS, 28);
  assert.deepEqual(out.map((d) => d.stage.stageIndex), [0, 1]);
  assert.equal(out[0].daysLeft, 13);
  assert.equal(out[1].daysLeft, 28);
});

test('overdue stages always included, however old, and sorted first', () => {
  const p = mkProject('Alpha', [
    mkStage(0, { endDate: '2025-01-01' }), // long overdue
    mkStage(1, { endDate: '2026-07-10' }), // +3
  ]);
  const out = stageDeadlines([p], TODAY);
  assert.equal(out.length, 2);
  assert.equal(out[0].stage.stageIndex, 0);
  assert.ok(out[0].daysLeft < -500);
});

test('done stages and stages without an end date are excluded', () => {
  const p = mkProject('Alpha', [
    mkStage(0, { endDate: '2026-07-08', status: 'done' }),
    mkStage(1), // no endDate
    mkStage(2, { endDate: '2026-07-08', status: 'in_progress' }),
  ]);
  const out = stageDeadlines([p], TODAY);
  assert.deepEqual(out.map((d) => d.stage.stageIndex), [2]);
});

test('only ACTIVE projects are watched', () => {
  const stages = [mkStage(0, { endDate: '2026-07-08' })];
  const out = stageDeadlines(
    [
      mkProject('Held', stages, { status: 'on_hold' }),
      mkProject('Closed', stages, { status: 'closed' }),
      mkProject('Live', stages),
    ],
    TODAY,
  );
  assert.deepEqual(out.map((d) => d.projectName), ['Live']);
});

test('stable sort: daysLeft, then project name, then stageIndex', () => {
  const out = stageDeadlines(
    [
      mkProject('Bravo', [mkStage(0, { endDate: '2026-07-09' })]),
      mkProject('Alpha', [mkStage(3, { endDate: '2026-07-09' }), mkStage(1, { endDate: '2026-07-09' })]),
    ],
    TODAY,
  );
  assert.deepEqual(
    out.map((d) => `${d.projectName}:${d.stage.stageIndex}`),
    ['Alpha:1', 'Alpha:3', 'Bravo:0'],
  );
});

test('duePhrase plain language', () => {
  assert.equal(duePhrase(-3), 'Overdue by 3 days');
  assert.equal(duePhrase(-1), 'Overdue by 1 day');
  assert.equal(duePhrase(0), 'Due today');
  assert.equal(duePhrase(1), 'Due in 1 day');
  assert.equal(duePhrase(14), 'Due in 14 days');
});

test('logItemOverdueDays: open item past due is overdue', () => {
  assert.equal(logItemOverdueDays({ status: 'open', dueDate: '2026-07-01' }, TODAY), 6);
  assert.equal(logItemOverdueDays({ status: 'open', dueDate: '2026-07-06' }, TODAY), 1);
});

test('logItemOverdueDays: due today is not overdue yet', () => {
  assert.equal(logItemOverdueDays({ status: 'open', dueDate: TODAY }, TODAY), null);
});

test('logItemOverdueDays: no dueDate is never overdue', () => {
  assert.equal(logItemOverdueDays({ status: 'open', dueDate: undefined }, TODAY), null);
});

test('logItemOverdueDays: answered/closed items are never overdue, however late', () => {
  assert.equal(logItemOverdueDays({ status: 'answered', dueDate: '2026-01-01' }, TODAY), null);
  assert.equal(logItemOverdueDays({ status: 'closed', dueDate: '2026-01-01' }, TODAY), null);
});

test('logItemOverdueDays: future due date is not overdue', () => {
  assert.equal(logItemOverdueDays({ status: 'open', dueDate: '2026-07-08' }, TODAY), null);
  assert.equal(logItemOverdueDays({ status: 'open', dueDate: '2026-08-01' }, TODAY), null);
});

test('logItemOverduePhrase plain language', () => {
  assert.equal(logItemOverduePhrase(1), 'OVERDUE by 1 day');
  assert.equal(logItemOverduePhrase(6), 'OVERDUE by 6 days');
});

test('taskOverdueDays: open task past due is overdue', () => {
  assert.equal(taskOverdueDays({ done: false, due: '2026-07-01' }, TODAY), 6);
  assert.equal(taskOverdueDays({ done: false, due: '2026-07-06' }, TODAY), 1);
});

test('taskOverdueDays: due today is not overdue yet', () => {
  assert.equal(taskOverdueDays({ done: false, due: TODAY }, TODAY), null);
});

test('taskOverdueDays: no due date is never overdue', () => {
  assert.equal(taskOverdueDays({ done: false, due: undefined }, TODAY), null);
  assert.equal(taskOverdueDays({ done: false }, TODAY), null);
});

test('taskOverdueDays: done tasks are never overdue, however late', () => {
  assert.equal(taskOverdueDays({ done: true, due: '2026-01-01' }, TODAY), null);
  assert.equal(taskOverdueDays({ done: true, due: TODAY }, TODAY), null);
});

test('taskOverdueDays: future due date is not overdue', () => {
  assert.equal(taskOverdueDays({ done: false, due: '2026-07-08' }, TODAY), null);
  assert.equal(taskOverdueDays({ done: false, due: '2026-08-01' }, TODAY), null);
});

test('taskOverduePhrase plain language', () => {
  assert.equal(taskOverduePhrase(1), 'OVERDUE by 1 day');
  assert.equal(taskOverduePhrase(6), 'OVERDUE by 6 days');
});

// ---- Today aggregation selectors -------------------------------------------------

const mkLogItem = (over = {}) => ({
  schemaVersion: 1,
  id: over.id ?? 'li-1',
  projectId: 'id-Alpha',
  type: 'rfi',
  party: 'Engineer',
  subject: 'Subject',
  dateRaised: '2026-06-01',
  status: 'open',
  createdAt: '',
  updatedAt: '',
  ...over,
});

const mkTask = (over = {}) => ({
  schemaVersion: 1,
  id: over.id ?? 't-1',
  projectId: 'id-Alpha',
  title: 'Task',
  done: false,
  ...over,
});

const mkNote = (over = {}) => ({
  schemaVersion: 1,
  id: over.id ?? 'n-1',
  projectId: 'id-Alpha',
  kind: 'meeting',
  date: '2026-06-15',
  title: 'Note',
  body: '',
  actions: [],
  createdAt: '',
  updatedAt: '',
  ...over,
});

const ALPHA = mkProject('Alpha', []);

test('logItemsDue: 2-week window — boundary in, beyond out, overdue in however old', () => {
  assert.equal(ITEM_HORIZON_DAYS, 14);
  const items = [
    mkLogItem({ id: 'a', subject: 'In window', dueDate: '2026-07-21' }), // +14 boundary
    mkLogItem({ id: 'b', subject: 'Beyond', dueDate: '2026-07-22' }), // +15 out
    mkLogItem({ id: 'c', subject: 'Ancient', dueDate: '2025-01-01' }), // long overdue
    mkLogItem({ id: 'd', subject: 'Today', dueDate: TODAY }), // 0 in
  ];
  const out = logItemsDue([ALPHA], items, TODAY);
  assert.deepEqual(out.map((x) => x.item.id), ['c', 'd', 'a']);
  assert.equal(out[0].daysLeft < -500, true);
  assert.equal(out[1].daysLeft, 0);
  assert.equal(out[2].daysLeft, 14);
  assert.equal(out[0].projectName, 'Alpha');
});

test('logItemsDue: answered/closed/undated items and non-active projects excluded', () => {
  const bravo = mkProject('Bravo', [], { status: 'on_hold' });
  const items = [
    mkLogItem({ id: 'a', status: 'answered', dueDate: '2026-07-01' }),
    mkLogItem({ id: 'b', status: 'closed', dueDate: '2026-07-01' }),
    mkLogItem({ id: 'c' }), // open, no dueDate — lives on the Log tab, not Today
    mkLogItem({ id: 'd', projectId: 'id-Bravo', dueDate: '2026-07-01' }), // on-hold project
    mkLogItem({ id: 'e', dueDate: '2026-07-01' }), // the only one that surfaces
  ];
  const out = logItemsDue([ALPHA, bravo], items, TODAY);
  assert.deepEqual(out.map((x) => x.item.id), ['e']);
});

test('logItemsDue: overdue first, then nearest; ties by project name then subject', () => {
  const bravo = mkProject('Bravo', []);
  const items = [
    mkLogItem({ id: 'a', projectId: 'id-Bravo', subject: 'Zed', dueDate: '2026-07-06' }),
    mkLogItem({ id: 'b', subject: 'Beta', dueDate: '2026-07-06' }),
    mkLogItem({ id: 'c', subject: 'Alpha sub', dueDate: '2026-07-06' }),
    mkLogItem({ id: 'd', subject: 'Soon', dueDate: '2026-07-10' }),
  ];
  const out = logItemsDue([ALPHA, bravo], items, TODAY);
  assert.deepEqual(out.map((x) => x.item.id), ['c', 'b', 'a', 'd']);
});

test('tasksDue: dated window (overdue first), undated in the quieter group', () => {
  const out = tasksDue(
    [ALPHA],
    [
      mkTask({ id: 'a', title: 'Boundary', due: '2026-07-21' }), // +14 in
      mkTask({ id: 'b', title: 'Beyond', due: '2026-07-22' }), // +15 out entirely
      mkTask({ id: 'c', title: 'Late', due: '2026-07-01' }), // overdue
      mkTask({ id: 'd', title: 'Someday' }), // undated
    ],
    TODAY,
  );
  assert.deepEqual(out.dated.map((x) => x.task.id), ['c', 'a']);
  assert.equal(out.dated[0].daysLeft, -6);
  assert.deepEqual(out.undated.map((x) => x.task.id), ['d']);
});

test('tasksDue: done tasks never surface, dated or not', () => {
  const out = tasksDue(
    [ALPHA],
    [mkTask({ id: 'a', due: '2026-07-01', done: true }), mkTask({ id: 'b', done: true })],
    TODAY,
  );
  assert.equal(out.dated.length + out.undated.length, 0);
});

test('tasksDue: firm-level tasks (no projectId) count; tasks of non-active projects do not', () => {
  const closed = mkProject('Closed', [], { status: 'closed' });
  const out = tasksDue(
    [ALPHA, closed],
    [
      mkTask({ id: 'a', title: 'Firm errand', projectId: undefined, due: '2026-07-10' }),
      mkTask({ id: 'b', projectId: 'id-Closed', due: '2026-07-01' }),
    ],
    TODAY,
  );
  assert.deepEqual(out.dated.map((x) => x.task.id), ['a']);
  assert.equal(out.dated[0].projectName, undefined);
});

test('openFollowUps: only not-done actions, oldest note first, active projects only', () => {
  const bravo = mkProject('Bravo', [], { status: 'on_hold' });
  const notes = [
    mkNote({
      id: 'n2',
      title: 'Newer',
      date: '2026-07-01',
      actions: [
        { id: 'x', text: 'Chase results', done: false },
        { id: 'y', text: 'Already handled', done: true },
      ],
    }),
    mkNote({
      id: 'n1',
      title: 'Older',
      date: '2026-06-01',
      actions: [{ id: 'z', text: 'Photograph waterproofing', done: false }],
    }),
    mkNote({
      id: 'n3',
      projectId: 'id-Bravo',
      date: '2026-05-01',
      actions: [{ id: 'w', text: 'On-hold project follow-up', done: false }],
    }),
  ];
  const out = openFollowUps([ALPHA, bravo], notes);
  assert.deepEqual(out.map((f) => f.actionId), ['z', 'x']);
  assert.equal(out[0].noteTitle, 'Older');
  assert.equal(out[0].projectName, 'Alpha');
});

test('capList: under/at cap shows all, over cap folds the rest into a count', () => {
  assert.equal(TODAY_LIST_CAP, 8);
  assert.deepEqual(capList([1, 2, 3], 8), { shown: [1, 2, 3], hiddenCount: 0 });
  const ten = Array.from({ length: 10 }, (_, i) => i);
  const capped = capList(ten, 8);
  assert.deepEqual(capped.shown, ten.slice(0, 8));
  assert.equal(capped.hiddenCount, 2);
  assert.equal(capList(ten.slice(0, 8), 8).hiddenCount, 0); // exactly at cap
});

test('todaySurface: each source lands in its own bucket', () => {
  const project = mkProject('Alpha', [mkStage(0, { endDate: '2026-07-17' })]); // +10
  const s = todaySurface(
    [project],
    [mkLogItem({ dueDate: '2026-07-05' })], // overdue by 2
    [mkTask({ id: 't1', due: '2026-07-08' }), mkTask({ id: 't2', title: 'Someday' })],
    [mkNote({ actions: [{ id: 'a', text: 'Follow up', done: false }] })],
    TODAY,
  );
  assert.equal(s.stages.length, 1);
  assert.equal(s.stages[0].daysLeft, 10);
  assert.equal(s.logItems.length, 1);
  assert.equal(s.logItems[0].daysLeft, -2);
  assert.deepEqual(s.datedTasks.map((x) => x.task.id), ['t1']);
  assert.deepEqual(s.undatedTasks.map((x) => x.task.id), ['t2']);
  assert.equal(s.followUps.length, 1);
  assert.equal(isAllClear(s), false);
});

test('isAllClear: true only when NOTHING surfaces; a lone undated task blocks it', () => {
  const empty = todaySurface([ALPHA], [], [], [], TODAY);
  assert.equal(isAllClear(empty), true);
  const undatedOnly = todaySurface([ALPHA], [], [mkTask()], [], TODAY);
  assert.equal(isAllClear(undatedOnly), false);
  // far-future data stays below the horizons -> still all clear
  const farOut = todaySurface(
    [mkProject('Alpha', [mkStage(0, { endDate: '2026-12-01' })])],
    [mkLogItem({ dueDate: '2026-12-01' })],
    [mkTask({ due: '2026-12-01' })],
    [mkNote({ actions: [{ id: 'a', text: 'Done already', done: true }] })],
    TODAY,
  );
  assert.equal(isAllClear(farOut), true);
});

// ---- C1: URL scheme allowlist (normalizeUrl) -------------------------------------

test('normalizeUrl: schemeless input gets https:// prefixed', () => {
  assert.equal(normalizeUrl('example.com/specs'), 'https://example.com/specs');
  assert.equal(normalizeUrl('  example.com/x  '), 'https://example.com/x');
});

test('normalizeUrl: safe schemes pass through untouched', () => {
  assert.equal(normalizeUrl('http://example.com'), 'http://example.com');
  assert.equal(normalizeUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(normalizeUrl('mailto:sara@chens.example'), 'mailto:sara@chens.example');
  assert.equal(normalizeUrl('tel:+15550101234'), 'tel:+15550101234');
  assert.equal(normalizeUrl('file:///C:/drawings/A-101.pdf'), 'file:///C:/drawings/A-101.pdf');
  assert.equal(normalizeUrl('smb://server/share/plans'), 'smb://server/share/plans');
});

test('normalizeUrl: javascript: scheme is sanitized, never kept as-is', () => {
  const out = normalizeUrl('javascript:alert(1)');
  assert.equal(/^javascript:/i.test(out), false);
  assert.equal(out, 'https://alert(1)');
});

test('normalizeUrl: data: and vbscript: schemes are sanitized to https://', () => {
  assert.equal(/^data:/i.test(normalizeUrl('data:text/html,<script>x</script>')), false);
  assert.equal(normalizeUrl('data:text/html,hi'), 'https://text/html,hi');
  assert.equal(/^vbscript:/i.test(normalizeUrl('vbscript:msgbox(1)')), false);
});

// ---- C3: latest issue by date (getLatestIssue) -----------------------------------

test('getLatestIssue: picks MAX date, not last array entry (backdated entry safe)', () => {
  const issues = [
    { rev: 'P02', date: '2026-03-10', purpose: 'approval' },
    { rev: 'P01', date: '2026-01-05', purpose: 'information' }, // backdated, appended later
  ];
  assert.equal(getLatestIssue(issues).rev, 'P02');
});

test('getLatestIssue: append order matching chronology still works; empty -> undefined', () => {
  const inOrder = [
    { rev: 'P01', date: '2026-01-05', purpose: 'information' },
    { rev: 'P02', date: '2026-03-10', purpose: 'approval' },
  ];
  assert.equal(getLatestIssue(inOrder).rev, 'P02');
  assert.equal(getLatestIssue([]), undefined);
});

console.log(`\n${n}/${n} unit tests passed`);
