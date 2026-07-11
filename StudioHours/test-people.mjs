// People-operations tests. Like test-claims.mjs this bundles the REAL src
// modules with rolldown and asserts against the shipped functions — but it
// goes further: it runs the actual Dexie database layer on fake-indexeddb so
// the firm-file export and backup round-trip are exercised end-to-end against
// a REAL populated database, not fixtures pretending to be one.
//
// THE ONE UNACCEPTABLE BUG this file exists to prevent: the firm file (the
// JSON every employee imports onto their device) must NEVER contain salary /
// HR / payroll / renewals data. Section 1 plants unmistakable secrets in every
// people-ops table + kv key, builds the firm-file export from that database,
// and asserts none of it appears. Run: node test-people.mjs
import 'fake-indexeddb/auto';
import { rolldown } from 'rolldown';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const results = [];
const ok = (name) => { results.push(['PASS', name]); console.log('PASS', name); };
const fail = (name, detail) => { results.push(['FAIL', name]); console.log('FAIL', name, '—', detail); };
const eq = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) ok(name);
  else fail(name, `got ${g}, want ${w}`);
};

// ---- bundle the real engine (db layer + libs, dexie included) -----------------
const src = (p) => JSON.stringify(join(import.meta.dirname, 'src', p).replaceAll('\\', '/'));
const tmp = mkdtempSync(join(tmpdir(), 'sh-people-'));
const entry = join(tmp, 'entry.mjs');
writeFileSync(entry, [
  `export * from ${src('lib/hr.ts')};`,
  `export { db, setFirm, getFirm, kvGet, kvSet, resetAll, KV_EOSB_RULE } from ${src('db.ts')};`,
  `export { buildBackup, restoreBackup } from ${src('lib/backup.ts')};`,
  `export { buildFirmFileExport, buildTimeExport, parseFirmFile } from ${src('lib/serialize.ts')};`,
  `export { newFirm, newPerson, uid } from ${src('lib/seeds.ts')};`,
].join('\n'));
const bundle = await rolldown({ input: entry, logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const outfile = join(tmp, 'engine.mjs');
writeFileSync(outfile, output[0].code);
const {
  // hr engine
  KSA_EOSB_PRESET, DEFAULT_REMINDER_DAYS,
  emptyHrRecord, yearsOfService, eosbAccruedDays, eosbLiability,
  leaveSummary, payItemsTotal, payrollLineFor, lineWithNet, lineBasePay,
  makePayrollRun, runTotals, monthLabel,
  renewalStatus, renewalStatusWords, renewalRows, dueRenewalRows,
  // db layer
  db, setFirm, getFirm, kvGet, kvSet, resetAll, KV_EOSB_RULE,
  buildBackup, restoreBackup,
  buildFirmFileExport, buildTimeExport, parseFirmFile,
  newFirm, newPerson, uid,
} = await import(pathToFileURL(outfile));
ok('real engine bundled from src (db layer runs on fake-indexeddb, not a replica)');

// ---- fixtures: a firm + a database FULL of people-ops secrets -----------------
const firm = newFirm('Atelier North');
const dana = newPerson('Dana Wright');
dana.isManager = true;
const priya = newPerson('Priya Raman');
const sam = newPerson('Sam Ortiz');
firm.people.push(dana, priya, sam);
firm.projects.push({
  projectId: uid(), clientName: 'Miller Family', projectNumber: '2026-014',
  projectName: 'Miller Residence', status: 'active', billingMethod: 'fixed_fee',
  fee: 85000, phases: [],
});
firm.billingRates = { defaultHourlyRate: 150, personRates: { [priya.personId]: 130 }, projectRates: {}, currency: 'USD' };
await setFirm(firm);

// Unmistakable planted secrets — each must round-trip through backups and must
// NEVER appear in a firm-file or staff time export.
const SECRET_SALARY = 987654;
const SECRET_ALLOWANCE = 'Housing allowance';
const SECRET_DOC = 'Medical insurance card';
const SECRET_RENEWAL = 'Professional indemnity insurance';
const SECRET_RUN_ID = 'RUN-SECRET-0001';
const SECRET_EXPENSE = 'EXP-SECRET-0001';

await db.hr.put({
  personId: priya.personId,
  employmentType: 'employee',
  startDate: '2023-01-01',
  baseSalary: SECRET_SALARY,
  allowances: [{ label: SECRET_ALLOWANCE, amount: 2500 }],
  deductions: [{ label: 'Social insurance', amount: 975 }],
  leaveAnnualDays: 21,
  leaveLedger: [{ id: uid(), date: '2026-03-02', days: 2, type: 'annual' }],
  documents: [{ id: uid(), label: SECRET_DOC, number: 'POL-443-XY', expiryDate: '2026-08-15' }],
  schemaVersion: 1,
});
await db.payrollRuns.put({
  id: SECRET_RUN_ID, month: '2026-06', status: 'paid', paidDate: '2026-06-28',
  lines: [{ personId: priya.personId, personName: 'Priya Raman', gross: 990154, allowances: 2500, deductions: 975, net: 989179 }],
  schemaVersion: 1, createdAt: '2026-06-28T00:00:00Z', updatedAt: '2026-06-28T00:00:00Z',
});
await db.renewals.put({
  id: 'REN-SECRET-0001', scope: 'firm', label: SECRET_RENEWAL, category: 'insurance',
  expiryDate: '2026-09-01', reminderDays: 60, schemaVersion: 1,
});
await db.expenses.put({
  id: SECRET_EXPENSE, date: '2026-07-01', projectId: firm.projects[0].projectId,
  projectName: 'Miller Residence', category: 'printing', description: 'Plotter paper',
  amount: 240, billable: true, invoiceId: null, schemaVersion: 1,
  createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z',
});
await kvSet(KV_EOSB_RULE, KSA_EOSB_PRESET);
ok('database populated: hr + payrollRuns + renewals + expenses tables and the eosbRule kv key all carry secrets');

// ---- 1. CONFIDENTIALITY: the firm file stays clean -----------------------------
{
  const storedFirm = await getFirm();
  eq('firm blob loaded back from kv', !!storedFirm, true);
  const text = buildFirmFileExport(storedFirm);

  // Positive control first: it IS a real, parseable firm file with our people.
  const parsed = parseFirmFile(text, 'export.json');
  eq('export parses as a firm file with all 3 people', parsed.people.length, 3);

  // (a) top-level keys are EXACTLY the known firm-file shape — nothing extra
  // can ride along, whatever it is called.
  const allowedTop = ['schemaVersion', 'exportType', 'exportedAt', 'firm', 'people', 'projects', 'nonProjectBuckets', 'activities', 'billingRates'];
  const extras = Object.keys(parsed).filter((k) => !allowedTop.includes(k));
  eq('firm file: no keys beyond the known firm-file shape', extras, []);

  // (b) deep scan: no key ANYWHERE in the tree smells like people-ops data.
  const forbiddenKey = /hr|payroll|renewal|salary|allowance|deduction|payslip|leave|eosb|document|expense/i;
  const badKeys = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (forbiddenKey.test(k)) badKeys.push(`${path}.${k}`);
        walk(v, `${path}.${k}`);
      }
    }
  };
  walk(parsed, '$');
  eq('firm file: deep key scan finds no hr/payroll/renewal/salary/leave/eosb keys', badKeys, []);

  // (c) the planted VALUES are nowhere in the raw text.
  eq('firm file: salary figure 987654 absent', text.includes(String(SECRET_SALARY)), false);
  eq('firm file: "Housing allowance" absent', text.includes(SECRET_ALLOWANCE), false);
  eq('firm file: document label absent', text.includes(SECRET_DOC), false);
  eq('firm file: renewal label absent', text.includes(SECRET_RENEWAL), false);
  eq('firm file: payroll run id absent', text.includes(SECRET_RUN_ID), false);
  eq('firm file: expense id absent', text.includes(SECRET_EXPENSE), false);
  eq('firm file: no "salary" in any casing', /salary/i.test(text), false);
  eq('firm file: no "payroll" in any casing', /payroll/i.test(text), false);
  eq('firm file: no "renewal" in any casing', /renewal/i.test(text), false);
  eq('firm file: no "eosb" in any casing', /eosb/i.test(text), false);

  // (d) the OTHER staff-facing export (weekly time file) is clean too.
  const entryFixture = {
    id: uid(), schemaVersion: 1, personId: priya.personId, personName: 'Priya Raman',
    date: '2026-07-06', projectId: firm.projects[0].projectId, projectName: 'Miller Residence',
    phaseId: null, phaseName: null, activityId: null, activityName: null, hours: 7.5,
    billable: true, outOfScope: false, requestedBy: null, notes: null, source: 'manual',
    createdAt: '2026-07-06T00:00:00Z', updatedAt: '2026-07-06T00:00:00Z',
  };
  const timeText = JSON.stringify(buildTimeExport(storedFirm, priya.personId, [entryFixture], '2026-07-06', '2026-07-12'));
  eq('time export: salary figure absent', timeText.includes(String(SECRET_SALARY)), false);
  eq('time export: no salary/payroll/renewal words', /salary|payroll|renewal|eosb/i.test(timeText), false);
}

// ---- 2. backups DO carry the new tables, and round-trip ------------------------
{
  const { content } = await buildBackup();
  const b = JSON.parse(content);
  eq('backup: hr table included (1 record, planted salary)', [b.hr?.length, b.hr?.[0]?.baseSalary], [1, SECRET_SALARY]);
  eq('backup: payrollRuns included', [b.payrollRuns?.length, b.payrollRuns?.[0]?.id], [1, SECRET_RUN_ID]);
  eq('backup: renewals included', [b.renewals?.length, b.renewals?.[0]?.label], [1, SECRET_RENEWAL]);
  eq('backup: expenses included', [b.expenses?.length, b.expenses?.[0]?.id], [1, SECRET_EXPENSE]);
  eq('backup: eosbRule kv included (2 KSA bands)', b.eosbRule?.bands?.length, 2);

  // wipe, restore, verify all four tables + the kv key come back
  await resetAll();
  eq('resetAll clears the new tables too', await db.hr.count() + await db.payrollRuns.count() + await db.renewals.count() + await db.expenses.count(), 0);
  await restoreBackup(content, 'replace');
  eq('restore: hr row back', (await db.hr.get(priya.personId))?.baseSalary, SECRET_SALARY);
  eq('restore: payroll run back (still paid)', (await db.payrollRuns.get(SECRET_RUN_ID))?.status, 'paid');
  eq('restore: renewal back', (await db.renewals.get('REN-SECRET-0001'))?.label, SECRET_RENEWAL);
  eq('restore: expense back', (await db.expenses.get(SECRET_EXPENSE))?.amount, 240);
  eq('restore: eosb rule kv back', (await kvGet(KV_EOSB_RULE))?.bands?.length, 2);
  eq('restore: firm back too', (await getFirm())?.people?.length, 3);

  // an OLD backup (pre-people-ops, none of the optional arrays) must restore
  const oldBackup = JSON.stringify({
    schemaVersion: 1, exportType: 'backup', exportedAt: '2026-01-01T00:00:00Z',
    firm: null, flags: { meId: null, tourStaffDone: false, tourManagerDone: false, lastBackupAt: null, installBannerDismissedAt: null, sampleLoaded: false, invoiceSeq: 0 },
    entries: [],
  });
  const res = await restoreBackup(oldBackup, 'replace');
  eq('old backup without the new arrays restores cleanly', res, { entryCount: 0 });
  eq('old backup: people-ops tables simply end up empty', await db.hr.count(), 0);
  eq('old backup: no eosb rule either (preset applies at runtime)', (await kvGet(KV_EOSB_RULE)) ?? null, null);

  // merging an old backup must NOT wipe a rule this install already customized
  const custom = { bands: [{ yearsFrom: 0, yearsTo: null, daysPerYear: 20 }], schemaVersion: 1 };
  await kvSet(KV_EOSB_RULE, custom);
  await restoreBackup(oldBackup, 'merge');
  eq('merge of an eosb-less backup keeps the customized rule', (await kvGet(KV_EOSB_RULE))?.bands?.[0]?.daysPerYear, 20);
}

// ---- 3. EOSB band math (KSA preset + custom) ------------------------------------
{
  // The brief's worked example: 3.5 years at 10,000/month base.
  //   accrued days = 3.5 × 15 = 52.5 (all inside the first band)
  //   daily pay    = 10,000 × 12 / 365 = 328.767…
  //   owed         = 52.5 × 328.767… = 17,260.27
  eq('eosb: KSA 3.5 yrs → 52.5 accrued days', eosbAccruedDays(KSA_EOSB_PRESET, 3.5), 52.5);
  eq('eosb: KSA 3.5 yrs × 10,000 SAR → 17,260.27', eosbLiability(KSA_EOSB_PRESET, 10000, 3.5), 17260.27);
  // Crossing the 5-year band edge: 5×15 + 2×30 = 135 days → 44,383.56.
  eq('eosb: KSA 7 yrs → 135 days (5×15 + 2×30)', eosbAccruedDays(KSA_EOSB_PRESET, 7), 135);
  eq('eosb: KSA 7 yrs × 10,000 → 44,383.56', eosbLiability(KSA_EOSB_PRESET, 10000, 7), 44383.56);
  eq('eosb: exactly 5 yrs stays in band one (75 days)', eosbAccruedDays(KSA_EOSB_PRESET, 5), 75);
  eq('eosb: zero service → zero', [eosbAccruedDays(KSA_EOSB_PRESET, 0), eosbLiability(KSA_EOSB_PRESET, 10000, 0)], [0, 0]);
  // years of service: prorated on whole days / 365
  eq('eosb: years of service 2023-01-01 → 2026-07-01 = 1277/365 days', yearsOfService('2023-01-01', '2026-07-01'), 1277 / 365);
  eq('eosb: a future start date clamps to 0 years', yearsOfService('2030-01-01', '2026-07-01'), 0);
  // a custom two-band rule (10 days/yr for 2 years, then 20)
  const custom = { bands: [{ yearsFrom: 0, yearsTo: 2, daysPerYear: 10 }, { yearsFrom: 2, yearsTo: null, daysPerYear: 20 }], schemaVersion: 1 };
  eq('eosb: custom rule 3 yrs → 2×10 + 1×20 = 40 days', eosbAccruedDays(custom, 3), 40);
}

// ---- 4. leave balance math --------------------------------------------------------
{
  const hr = {
    leaveAnnualDays: 21,
    leaveLedger: [
      { id: '1', date: '2026-02-02', days: 2, type: 'annual' },
      { id: '2', date: '2026-04-15', days: 0.5, type: 'annual' }, // half-days work
      { id: '3', date: '2026-05-01', days: 1, type: 'sick' },
      { id: '4', date: '2026-06-01', days: 2, type: 'unpaid' },
      { id: '5', date: '2025-12-20', days: 3, type: 'annual' }, // last year — different balance
    ],
  };
  const s = leaveSummary(hr, '2026');
  eq('leave: only annual draws the entitlement down (2.5 taken)', s.annualTaken, 2.5);
  eq('leave: sick and unpaid recorded separately', [s.sickTaken, s.unpaidTaken], [1, 2]);
  eq('leave: remaining 21 − 2.5 = 18.5', s.remaining, 18.5);
  eq('leave: last year is its own balance (3 taken, 18 left)', [leaveSummary(hr, '2025').annualTaken, leaveSummary(hr, '2025').remaining], [3, 18]);
  eq('leave: over-taking goes negative, never hides', leaveSummary({ leaveAnnualDays: 2, leaveLedger: [{ id: 'x', date: '2026-01-05', days: 3, type: 'annual' }] }, '2026').remaining, -1);
  eq('leave: default record ships 21 days', emptyHrRecord('p1').leaveAnnualDays, 21);
}

// ---- 5. payroll line + run math ----------------------------------------------------
{
  const person = { personId: 'p-priya', name: 'Priya Raman', weeklyCapacityHours: 40, targetUtilization: { min: 75, max: 85 }, active: true };
  const hr = {
    ...emptyHrRecord('p-priya'),
    baseSalary: 10000,
    allowances: [{ label: 'Housing', amount: 2500 }, { label: 'Transport', amount: 500 }],
    deductions: [{ label: 'GOSI', amount: 975 }],
  };
  const line = payrollLineFor(person, hr);
  eq('payroll: gross = base + allowances (10,000 + 3,000)', line.gross, 13000);
  eq('payroll: allowances slice recorded (3,000)', line.allowances, 3000);
  eq('payroll: deductions total (975)', line.deductions, 975);
  eq('payroll: net = gross − deductions (12,025)', line.net, 12025);
  eq('payroll: base pay derives back out of the stored line', lineBasePay(line), 10000);
  eq('payroll: person name denormalized onto the line', line.personName, 'Priya Raman');
  eq('payroll: editing re-derives net (gross 14,000 → net 13,025)', lineWithNet({ ...line, gross: 14000 }).net, 13025);
  eq('payroll: payItemsTotal rounds to cents', payItemsTotal([{ label: 'a', amount: 0.1 }, { label: 'b', amount: 0.2 }]), 0.3);

  // run assembly: one line per ACTIVE EMPLOYEE with pay set up
  const contractor = { ...person, personId: 'p-con', name: 'Con Tractor' };
  const noRecord = { ...person, personId: 'p-none', name: 'No Record' };
  const inactive = { ...person, personId: 'p-old', name: 'Left Already', active: false };
  const hrMap = new Map([
    ['p-priya', hr],
    ['p-con', { ...emptyHrRecord('p-con'), employmentType: 'contractor', baseSalary: 4000 }],
    ['p-old', { ...emptyHrRecord('p-old'), baseSalary: 9000 }],
  ]);
  const run = makePayrollRun('2026-07', [person, contractor, noRecord, inactive], hrMap);
  eq('payroll: run prefills only the active employee with pay set', run.lines.map((l) => l.personId), ['p-priya']);
  eq('payroll: run is a draft for the requested month', [run.status, run.month], ['draft', '2026-07']);
  const totals = runTotals({ lines: [line, { personId: 'x', personName: 'X', gross: 4000, allowances: 0, deductions: 0, net: 4000 }] });
  eq('payroll: totals sum gross/deductions/net across lines', totals, { gross: 17000, deductions: 975, net: 16025, people: 2 });
  eq('payroll: month label reads plainly', monthLabel('2026-07'), 'July 2026');
}

// ---- 6. renewal status math ---------------------------------------------------------
{
  const today = '2026-07-07';
  eq('renewal: 90 days out with a 60-day reminder → OK', renewalStatus('2026-10-05', 60, today), { state: 'ok', days: 90 });
  eq('renewal: 30 days out → due', renewalStatus('2026-08-06', 60, today), { state: 'due', days: 30 });
  eq('renewal: expiring today → due, 0 days', renewalStatus(today, 60, today), { state: 'due', days: 0 });
  eq('renewal: 5 days past → overdue', renewalStatus('2026-07-02', 60, today), { state: 'overdue', days: -5 });
  eq('renewal: words for due', renewalStatusWords({ state: 'due', days: 30 }), 'Due in 30 days');
  eq('renewal: words for due today', renewalStatusWords({ state: 'due', days: 0 }), 'Due today');
  eq('renewal: words for overdue (singular day)', renewalStatusWords({ state: 'overdue', days: -1 }), 'OVERDUE by 1 day');
  eq('renewal: words for ok', renewalStatusWords({ state: 'ok', days: 90 }), 'OK');
  eq('renewal: default reminder window is 60 days', DEFAULT_REMINDER_DAYS, 60);

  // register assembly: renewals + dated person documents, one list
  const renewals = [{ id: 'r1', scope: 'firm', label: 'Indemnity insurance', category: 'insurance', expiryDate: '2026-09-01', reminderDays: 60, schemaVersion: 1 }];
  const hrRecs = [{
    ...emptyHrRecord('p-priya'),
    documents: [
      { id: 'd1', label: 'Residence permit', expiryDate: '2026-07-20' },
      { id: 'd2', label: 'No expiry — stays out', number: 'X' },
    ],
  }];
  const rows = renewalRows(renewals, hrRecs, new Map([['p-priya', 'Priya Raman']]), today);
  eq('renewal register: renewal + dated document = 2 rows (undated doc excluded)', rows.length, 2);
  eq('renewal register: sorted by expiry, document first', rows.map((r) => r.source), ['document', 'renewal']);
  eq('renewal register: document row carries the person\'s name', rows[0].whoLabel, 'Priya Raman');
  eq('renewal register: firm row labeled "Whole firm"', rows[1].whoLabel, 'Whole firm');
  eq('renewal register: document rows use the default reminder window', rows[0].reminderDays, 60);
  const due = dueRenewalRows(rows.concat([{ ...rows[1], id: 'r2', expiryDate: '2026-06-30', status: renewalStatus('2026-06-30', 60, today) }]));
  eq('renewal strip feed: most urgent first (overdue, then due)', due.map((r) => r.status.state), ['overdue', 'due', 'due']);
}

// ---- summary --------------------------------------------------------------------------
const failed = results.filter(([s]) => s === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
