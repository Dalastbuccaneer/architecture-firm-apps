// End-to-end smoke test: drives the built app in system Edge (headless).
// Flow: sample firm -> week grid entry -> reports export -> dashboard import
// round-trip -> Harvest CSV import -> undo -> invoices/claims/receivables ->
// people ops (salary -> payroll run -> payslip; renewals -> dashboard strip;
// leave) -> staff persona sees Roster only -> reimbursable expenses (ledger ->
// on-charge onto an invoice -> release on delete -> CSV). Run: node
// e2e-smoke.mjs (preview server must be up on :4173).
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://localhost:4173/';
const results = [];
const ok = (name) => { results.push(['PASS', name]); console.log('PASS', name); };
const fail = (name, err) => { results.push(['FAIL', name + ' — ' + err]); console.log('FAIL', name, err); };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const closeTour = async () => {
  await page.waitForTimeout(900); // tour auto-start delay
  for (let i = 0; i < 3; i++) {
    if (await page.locator('.driver-popover').count()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  }
};

try {
  // 1. First run + sample firm
  await page.goto(BASE);
  await page.getByText('Explore with sample data').click();
  await page.waitForSelector('h1:has-text("Timesheet")', { timeout: 15000 });
  ok('sample firm loads into week view');
  await closeTour();

  if (!(await page.getByText('Atelier North').count())) throw new Error('firm name missing in header');
  ok('header shows firm + person');

  // 2. Grid: type hours into first cell, Enter commits
  const cell = page.locator('[data-cell="0-0"]');
  await cell.click();
  await cell.fill('2.5');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const v = await page.locator('[data-cell="0-0"]').inputValue();
  if (v !== '2.5') throw new Error(`cell value after commit = "${v}"`);
  ok('grid cell commit (2.5h)');

  // cell detail panel appears for the focused cell
  if (!(await page.locator('[data-tour="cell-detail"]').count())) throw new Error('cell detail panel missing');
  ok('cell detail panel renders');

  // 3. Reports (now a sub-tab inside Week): export JSON (download)
  await page.locator('[data-tour="week-tab-reports"]').click();
  await page.waitForSelector('h1:has-text("My reports")');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Send to your manager/i }).click();
  const download = await dl;
  const tmp = mkdtempSync(join(tmpdir(), 'sh-e2e-'));
  const jsonPath = join(tmp, download.suggestedFilename());
  await download.saveAs(jsonPath);
  ok('reports JSON export downloads (' + download.suggestedFilename() + ')');

  // 4. Dashboard: metrics + import round-trip of the exported file
  await page.locator('[data-tour="nav-dashboard"]').click();
  await page.waitForSelector('h1:has-text("Dashboard")');
  await closeTour();
  await page.locator('[data-tour="drop-zone"] input[type="file"]').setInputFiles(jsonPath);
  await page.waitForTimeout(800);
  const outcome = await page.locator('[data-tour="drop-zone"]').textContent();
  if (!/replaced/i.test(outcome ?? '')) throw new Error('round-trip import did not report replacement: ' + outcome?.slice(0, 300));
  ok('JSON import round-trip: day-level replace reported');

  // 5. Fee Burn tab (formerly "By project"): defaults to the most recently
  // worked-on project (Miller) and renders its stage meters
  await page.getByRole('tab', { name: 'Fee Burn' }).click();
  await page.waitForTimeout(300);
  const proj = await page.textContent('body');
  if (!/Miller Residence/.test(proj)) throw new Error('Miller Residence missing');
  if (!(await page.locator('[data-tour="burn-bars"]').count())) throw new Error('burn bars missing');
  if (!(await page.locator('[data-tour="burn-hero"]').count())) throw new Error('burn hero figure missing');
  ok('fee burn tab renders (default project, hero + stage meters)');

  // 6. Alerts tab: CD phase seeded at ~88% must alert
  await page.getByRole('tab', { name: 'Alerts' }).click();
  await page.waitForTimeout(300);
  const alerts = await page.textContent('body');
  if (!/Construction Documents|CD/.test(alerts)) throw new Error('no CD burn alert found');
  ok('alerts tab shows phase burn alert');

  // 7. Harvest CSV import
  const csv = [
    'Date,Client,Project,Task,Notes,Hours,First Name,Last Name,Billable?',
    '2026-06-29,Acme Corp,Lakeside Office,Construction Documents,Detailing,6.5,Jordan,Lee,Yes',
    '06/30/2026,Acme Corp,Lakeside Office,SD,Sketches,3:30,Jordan,Lee,No',
    'bad-date,Acme Corp,Lakeside Office,CD,,2,Jordan,Lee,Yes',
  ].join('\r\n');
  const csvPath = join(tmp, 'harvest-export.csv');
  writeFileSync(csvPath, '﻿' + csv);
  await page.locator('[data-tour="drop-zone"] input[type="file"]').setInputFiles(csvPath);
  await page.waitForTimeout(800);
  const csvOutcome = await page.locator('[data-tour="drop-zone"]').textContent();
  if (!/Jordan Lee/.test(csvOutcome ?? '')) throw new Error('CSV person not imported: ' + csvOutcome?.slice(0, 300));
  if (!/1 row skipped|1 rows skipped/i.test(csvOutcome ?? '')) throw new Error('bad row not surfaced: ' + csvOutcome?.slice(0, 300));
  ok('Harvest CSV import: person created, 2 rows in, bad row surfaced');

  // 8. Import log + undo the CSV import
  const logRows = page.locator('[data-tour="import-log"] tbody tr');
  const before = await logRows.count();
  const undoBtn = page.locator('[data-tour="import-log"] button', { hasText: /undo/i }).first();
  if (!(await undoBtn.count())) throw new Error('no undo button in import log');
  await undoBtn.click();
  await page.waitForTimeout(600);
  ok(`import log renders (${before} rows) and undo executes`);

  // 9. Settings: backup builds
  await page.locator('[data-tour="nav-settings"]').click();
  await page.waitForSelector('h1:has-text("Settings")');
  const dl2 = page.waitForEvent('download');
  await page.getByRole('main').getByRole('button', { name: /Back up now/i }).click();
  const backup = await dl2;
  ok('backup downloads (' + backup.suggestedFilename() + ')');

  // 10. Setup screen renders with sample projects
  await page.locator('[data-tour="nav-setup"]').click();
  await page.waitForSelector('h1:has-text("Firm setup")');
  if (!(await page.locator('[data-tour="firm-file-export"]').count())) throw new Error('firm file export missing');
  ok('setup screen + firm file export present');

  // 10b. Prefill stages: a fresh project (no phases) + RIBA template + $100,000 total
  // fee must produce exactly 6 phase rows whose budgeted fees sum to exactly 100,000.
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.waitForTimeout(400); // new project persists + auto-expands
  await page.getByRole('button', { name: /Prefill stages/ }).click();
  await page.waitForSelector('dialog[open]');
  if (!(await page.getByRole('radio', { name: /RIBA stages/ }).isChecked())) throw new Error('RIBA should be the default template');
  await page.getByLabel('Total project fee (optional)').fill('100000');
  await page.locator('dialog[open]').getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForTimeout(500);
  const ribaPhases = [
    ['S1', 'Preparation and Briefing'],
    ['S2', 'Concept Design'],
    ['S3', 'Spatial Coordination'],
    ['S4', 'Technical Design'],
    ['S5', 'Construction / Site'],
    ['S6', 'Handover'],
  ];
  let feeSum = 0;
  for (const [code, name] of ribaPhases) {
    if (!(await page.getByLabel(`Phase name (${code})`).count())) throw new Error(`RIBA phase ${code} (${name}) missing after prefill`);
    feeSum += Number(await page.getByLabel(`Budgeted fee for ${name}`).inputValue());
  }
  if ((await page.locator('[aria-label^="Phase name ("]').count()) !== 6) {
    throw new Error('fresh project should have exactly 6 phase rows after RIBA prefill');
  }
  if (feeSum !== 100000) throw new Error(`RIBA prefill fee sum should be exactly 100000, got ${feeSum}`);
  ok('prefill stages: fresh project gets exactly 6 RIBA phases, budgeted fees sum to exactly 100,000');

  // 11. Money → Invoices: create a draft invoice from tracked hours (sample firm has rates)
  await page.locator('[data-tour="nav-invoices"]').click();
  await page.waitForSelector('h1:has-text("Money")');
  await page.getByRole('button', { name: /New invoice/i }).first().click();
  await page.waitForSelector('h1:has-text("New invoice")');
  await page.locator('select').first().selectOption({ index: 2 }); // Hillside Clinic (hourly)
  // widen the period so hours are captured no matter what today's date is
  await page.getByLabel('Period start').fill('2000-01-01');
  await page.getByLabel('Period end').fill('2100-01-01');
  await page.waitForTimeout(400);
  const createBtn = page.getByRole('button', { name: /Create draft invoice/i });
  if (await createBtn.isDisabled()) throw new Error('create-invoice button disabled — no billable hours matched the period');
  await createBtn.click();
  await page.waitForSelector('text=Total due');
  // Invoice number + amounts live in <input> values, not text nodes — read them directly.
  const invNum = await page.getByLabel('Invoice number').inputValue();
  if (!/^INV-\d{4}$/.test(invNum)) throw new Error('invoice number not assigned: ' + invNum);
  if (!(await page.getByLabel('Line description').count())) throw new Error('invoice has no billable lines');
  ok(`invoice: created draft ${invNum} from tracked hours with lines`);

  // round-trip: leave and return; the draft must have persisted to the list
  await page.locator('[data-tour="nav-setup"]').click();
  await page.waitForSelector('h1:has-text("Firm setup")');
  if (!(await page.getByText('Billing rates').count())) throw new Error('Billing rates panel missing from Setup');
  await page.locator('[data-tour="nav-invoices"]').click();
  await page.waitForSelector('h1:has-text("Money")');
  if (!/INV-0001/.test((await page.textContent('body')) ?? '')) throw new Error('invoice not listed after save');
  ok('invoice: persisted and listed; Billing rates panel present in Setup');

  // 12. Fee-claim invoice on the fixed-fee project (Miller Residence, SD fee 12,750)
  await page.getByRole('button', { name: /New invoice/i }).first().click();
  await page.waitForSelector('h1:has-text("New invoice")');
  await page.locator('select').first().selectOption({ index: 1 }); // Miller Residence (fixed fee)
  await page.waitForSelector('text=Bill a percentage of the fee'); // mode choice appears, claim is default
  if (!(await page.getByText('no fee entered for this stage').count())) throw new Error('unfeed stages not grayed');
  const sdPct = page.getByLabel(/Bill up to \(%\) for Schematic Design/);
  if ((await sdPct.inputValue()) !== '0') throw new Error('SD should prefill at 0%, got ' + (await sdPct.inputValue()));
  await sdPct.fill('60');
  await page.waitForTimeout(400);
  if (!/7,650/.test((await page.textContent('body')) ?? '')) throw new Error('live claim total 7,650 missing (60% × 12,750)');
  ok('claim: mode defaults to percentage; 60% of SD previews 7,650; unfeed stages grayed');
  await page.getByRole('button', { name: /Create draft invoice/i }).click();
  await page.waitForSelector('text=Total due');
  if (!(await page.getByText('% this invoice').count()) || !(await page.getByText('% to date').count()))
    throw new Error('claim invoice missing % columns');
  if (!/7,650/.test((await page.textContent('body')) ?? '')) throw new Error('claim invoice total should be 7,650');
  const claimNum = await page.getByLabel('Invoice number').inputValue();
  if (!/^INV-\d{4}$/.test(claimNum)) throw new Error('claim invoice number not assigned: ' + claimNum);
  ok(`claim: draft ${claimNum} created — % columns render, total 7,650`);

  // 13. Guards on a second claim: the parked DRAFT counts, 110% and un-claims block
  await page.getByRole('button', { name: 'Invoices', exact: true }).click(); // editor back button
  await page.waitForSelector('h1:has-text("Money")');
  await page.getByRole('button', { name: /New invoice/i }).first().click();
  await page.waitForSelector('h1:has-text("New invoice")');
  await page.locator('select').first().selectOption({ index: 1 });
  await page.waitForSelector('text=Bill a percentage of the fee');
  const sdPct2 = page.getByLabel(/Bill up to \(%\) for Schematic Design/);
  const prefill = await sdPct2.inputValue();
  if (prefill !== '60') throw new Error('billed-so-far must include the draft claim (want prefill 60, got ' + prefill + ')');
  const createClaimBtn = page.getByRole('button', { name: /Create draft invoice/i });
  await sdPct2.fill('110');
  await page.waitForTimeout(400);
  if (!/more than 100%/.test((await page.textContent('body')) ?? '')) throw new Error('110% not blocked with message');
  if (!(await createClaimBtn.isDisabled())) throw new Error('create enabled at 110%');
  await sdPct2.fill('40');
  await page.waitForTimeout(400);
  if (!/already billed 60%/.test((await page.textContent('body')) ?? '')) throw new Error('un-claim below 60% not blocked with message');
  if (!(await createClaimBtn.isDisabled())) throw new Error('create enabled below already-billed 60%');
  ok('claim guards: draft counts as billed; 110% and 40%-after-60% both hard-blocked');

  // second cumulative claim: 60% -> 80% must bill exactly the 20% delta (2,550)
  await sdPct2.fill('80');
  await page.waitForTimeout(400);
  if (await createClaimBtn.isDisabled()) throw new Error('create should be enabled at 80%');
  if (!/2,550/.test((await page.textContent('body')) ?? '')) throw new Error('delta preview 2,550 missing (20% × 12,750)');
  await createClaimBtn.click();
  await page.waitForSelector('text=Total due');
  if (!/2,550/.test((await page.textContent('body')) ?? '')) throw new Error('second claim total should be 2,550');
  ok('claim: second cumulative claim bills only the 60→80 delta (2,550)');

  // 14. Fee Burn: hero %, a stage row's exact text, and the invoiced overlay
  // fed by the two claims above. Expected hero: Miller's budgeted stages are
  // SD 120 + DD 160 + CD 320 + CA 140 = 740 h; in-scope sample hours on them
  // are 303 ± the 2.5h grid edit from step 2 — every case rounds to 41%.
  await page.locator('[data-tour="nav-dashboard"]').click();
  await page.waitForSelector('h1:has-text("Dashboard")');
  await page.getByRole('tab', { name: 'Fee Burn' }).click();
  await page.waitForTimeout(300);
  const burnSel = page.getByLabel('Project', { exact: true });
  const defLabel = await burnSel.evaluate((el) => el.selectedOptions[0]?.textContent ?? '');
  if (!/Miller Residence/.test(defLabel)) throw new Error(`default burn project should be Miller (most recent hours), got "${defLabel}"`);
  await burnSel.selectOption({ label: 'Miller Residence' });
  await page.waitForTimeout(300);
  const heroTxt = (await page.locator('[data-tour="burn-hero"]').textContent()) ?? '';
  if (!/41%/.test(heroTxt)) throw new Error('hero should read 41% (≈303 of 740 budgeted hrs), got: ' + heroTxt.slice(0, 120));
  if (!/On track/.test(heroTxt)) throw new Error('severity chip "On track" missing beside hero: ' + heroTxt.slice(0, 120));
  const burnBody = (await page.textContent('body')) ?? '';
  if (!burnBody.includes('1 of 120 hrs · 1% of budget')) throw new Error('SD stage meter text "1 of 120 hrs · 1% of budget" missing');
  if (!burnBody.includes('80% of fee invoiced')) throw new Error('SD invoiced overlay "80% of fee invoiced" missing (claims are at 80%)');
  if (!burnBody.includes('$10,200')) throw new Error('"Invoiced so far" tile should show $10,200 (80% × 12,750)');
  ok('fee burn: hero 41% + On track, SD "1 of 120 hrs · 1%", overlay "80% of fee invoiced", $10,200 tile');

  // hour-budget empty state: the RIBA prefill project (10b) has fees but no
  // budgeted hours, so Fee Burn must point at Setup instead of showing bars
  await burnSel.selectOption({ label: 'New project' });
  await page.waitForTimeout(300);
  if (!/Add budgeted hours in Setup to see burn/.test((await page.textContent('body')) ?? ''))
    throw new Error('no-hour-budgets state missing for the RIBA prefill project');
  ok('fee burn: project without hour budgets points to Setup');

  // 15. Setup → "View burn" cross-link lands on Fee Burn with Miller selected
  await page.locator('[data-tour="nav-setup"]').click();
  await page.waitForSelector('h1:has-text("Firm setup")');
  await page.getByRole('button', { name: 'View burn for Miller Residence' }).click();
  await page.waitForSelector('h1:has-text("Dashboard")');
  await page.waitForTimeout(300);
  if ((await page.getByRole('tab', { name: 'Fee Burn' }).getAttribute('aria-selected')) !== 'true')
    throw new Error('Fee Burn tab not selected after cross-link');
  const crossHero = (await page.locator('[data-tour="burn-hero"]').textContent()) ?? '';
  if (!/41%/.test(crossHero)) throw new Error('cross-link should land on Miller (hero 41%), got: ' + crossHero.slice(0, 120));
  ok('setup cross-link: "View burn" opens Fee Burn with Miller selected');

  // 16. Receivables strip: three invoices exist (from steps 11-13) and every one
  // is still a DRAFT — nothing has been sent, so the strip must show the empty
  // message (the "no sent invoices at all" case, not yet "all paid").
  await page.locator('[data-tour="nav-invoices"]').click();
  await page.waitForSelector('h1:has-text("Money")');
  const preSendBody = (await page.textContent('body')) ?? '';
  if (!/Nothing outstanding — every sent invoice has been paid\./.test(preSendBody))
    throw new Error('receivables strip should show the empty message while every invoice is still a draft: ' + preSendBody.slice(0, 400));
  ok('receivables: empty message shown with 3 drafts and zero sent invoices');

  // 17. Mark INV-0001 (the hourly Hillside Clinic invoice) sent, and read its
  // own "Total due" figure so later checks compare against the real math
  // instead of a hand-computed number.
  await page.getByText('INV-0001', { exact: true }).click();
  await page.waitForSelector('text=Total due');
  const inv1Total = ((await page.locator('.text-2xl.font-bold.tabular-nums').first().textContent()) ?? '').trim();
  if (!inv1Total) throw new Error('could not read INV-0001\'s Total due figure');
  await page.getByRole('button', { name: 'Sent', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Invoices', exact: true }).click();
  await page.waitForSelector('h1:has-text("Money")');
  ok(`invoice: INV-0001 marked Sent (total ${inv1Total})`);

  // 18. The strip now owes exactly INV-0001's total, entirely in the 0–30 days
  // bucket (it was just sent today) — the other two drafts stay uncounted.
  const stripBody = (await page.textContent('body')) ?? '';
  if (!stripBody.includes('Owed to you:')) throw new Error('"Owed to you" headline missing once an invoice is sent');
  if (!stripBody.includes(inv1Total)) throw new Error(`strip headline should show ${inv1Total}: ` + stripBody.slice(0, 400));
  const freshBucket = page.locator('button', { hasText: '0–30 days' });
  const freshBucketText = (await freshBucket.textContent()) ?? '';
  if (!freshBucketText.includes(inv1Total)) throw new Error(`0–30 days bucket should show ${inv1Total}: ` + freshBucketText);
  // Adjacent divs concatenate with no separator in textContent (e.g.
  // "...37" + "1 invoice" -> "...371 invoice"), so check the plain substring
  // rather than a \b-bounded regex, which would false-fail on the glued digit.
  if (!freshBucketText.includes('1 invoice')) throw new Error(`0–30 days bucket should read "1 invoice": ` + freshBucketText);
  ok('receivables: strip totals exactly the one sent-and-unpaid invoice, in the 0–30 days bucket');

  // 19. Clicking that bucket filters the list below to just INV-0001, with a
  // visible "Showing: 0–30 days — Show all" chip.
  await freshBucket.click();
  await page.waitForTimeout(300);
  if (!(await page.getByText('Showing: 0–30 days').count())) throw new Error('filter chip did not appear after clicking a bucket');
  const filteredBody = (await page.textContent('body')) ?? '';
  if (!/INV-0001/.test(filteredBody)) throw new Error('filtered list should still show INV-0001');
  if (/INV-0002/.test(filteredBody) || /INV-0003/.test(filteredBody))
    throw new Error('filtered list should hide the still-draft invoices: ' + filteredBody.slice(0, 500));
  ok('receivables: clicking the 0–30 days bucket filters the invoice list to just INV-0001');

  // "Show all" clears the filter and brings every invoice back.
  await page.getByRole('button', { name: 'Show all' }).click();
  await page.waitForTimeout(300);
  const restoredBody = (await page.textContent('body')) ?? '';
  if (!/INV-0001/.test(restoredBody) || !/INV-0002/.test(restoredBody) || !/INV-0003/.test(restoredBody))
    throw new Error('"Show all" should restore every invoice to the list: ' + restoredBody.slice(0, 500));
  ok('receivables: "Show all" clears the bucket filter');

  // 20. Marking INV-0001 paid settles the only receivable — the strip must
  // return to the empty message (this time the "all sent invoices are paid" case).
  await page.getByText('INV-0001', { exact: true }).click();
  await page.waitForSelector('text=Total due');
  await page.getByRole('button', { name: 'Paid', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Invoices', exact: true }).click();
  await page.waitForSelector('h1:has-text("Money")');
  const paidBody = (await page.textContent('body')) ?? '';
  if (!/Nothing outstanding — every sent invoice has been paid\./.test(paidBody))
    throw new Error('strip should return to the empty message once the only sent invoice is paid: ' + paidBody.slice(0, 400));
  ok('receivables: marking the invoice paid returns the strip to the empty message');

  // ---- People operations (payroll-lite), still signed in as Dana (manager) ----

  // 21. Pay: set Priya's salary + start date; EOSB figures appear
  await page.locator('[data-tour="nav-people"]').click();
  await page.waitForSelector('h1:has-text("People")');
  await page.getByRole('tab', { name: 'Pay' }).click();
  await page.getByRole('button', { name: 'Edit pay for Priya Raman' }).click();
  await page.getByLabel('Priya Raman base salary per month').fill('10000');
  await page.getByLabel('Priya Raman start date').fill('2023-01-01');
  await page.waitForTimeout(400);
  const payBody = (await page.textContent('body')) ?? '';
  if (!/10,000/.test(payBody)) throw new Error('take-home 10,000 missing after setting the salary');
  if (!/End-of-service owed today/.test(payBody)) throw new Error('per-person end-of-service line missing');
  if (!/Owed if everyone left today/.test(payBody)) throw new Error('firm end-of-service tile missing');
  ok('pay: salary + start date saved; per-person and firm end-of-service figures render');

  // 22. Run payroll for the current month — one line, prefilled from the salary
  await page.getByRole('button', { name: /Run payroll for/ }).click();
  await page.waitForSelector('h2:has-text("Payroll —")');
  const baseField = page.getByLabel('Priya Raman base pay');
  if (!(await baseField.count())) throw new Error('run should prefill a line for Priya (the only employee with pay set)');
  const baseVal = await baseField.inputValue();
  if (baseVal !== '10000') throw new Error('prefilled base pay should be 10000, got ' + baseVal);
  const runBody = (await page.textContent('body')) ?? '';
  if (!/Take-home total/.test(runBody) || !/10,000/.test(runBody)) throw new Error('take-home total 10,000 missing on the run');
  ok('payroll: run created for the month, line prefilled from the salary, take-home totals 10,000');

  // 23. Mark the run paid — paidDate stamped
  await page.getByRole('button', { name: 'Mark paid' }).click(); // confirm auto-accepted
  await page.waitForTimeout(300);
  if (!/Paid on \w{3,} \d{1,2}, \d{4}/.test((await page.textContent('body')) ?? '')) throw new Error('paid date not stamped after Mark paid');
  ok('payroll: marked paid, paid date stamped');

  // 24. Payslip print-DOM exists (person, net pay, not-statutory footer)
  await page.getByRole('button', { name: 'Payslip for Priya Raman' }).click();
  await page.waitForSelector('[data-tour="payslip-doc"]');
  const slip = (await page.locator('[data-tour="payslip-doc"]').textContent()) ?? '';
  if (!/Priya Raman/.test(slip)) throw new Error('payslip missing the person');
  if (!/Net pay/.test(slip)) throw new Error('payslip missing the net pay row');
  if (!/10,000/.test(slip)) throw new Error('payslip missing the amount');
  if (!/Not a statutory document/.test(slip)) throw new Error('payslip missing the not-statutory footer');
  ok('payslip: print document renders — person, net pay 10,000, "Not a statutory document" footer');
  await page.getByRole('button', { name: /Back to .+ run/ }).click();
  await page.waitForSelector('h2:has-text("Payroll —")');
  await page.getByRole('button', { name: 'Pay', exact: true }).click(); // toolbar back to the Pay tab
  await page.waitForSelector('text=Past runs');

  // 25. Renewals: add one expiring in 30 days -> register says "Due in 30 days"
  const localISO = (offsetDays) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  await page.getByRole('tab', { name: 'Renewals' }).click();
  await page.getByLabel('Renewal name').fill('Professional indemnity insurance');
  await page.getByLabel('Renewal expiry date').fill(localISO(30));
  await page.getByRole('button', { name: 'Add renewal' }).click();
  await page.waitForTimeout(300);
  const renBody = (await page.textContent('body')) ?? '';
  if (!/Professional indemnity insurance/.test(renBody)) throw new Error('renewal not listed after adding');
  if (!/Due in 30 days/.test(renBody)) throw new Error('renewal status "Due in 30 days" missing: ' + renBody.slice(0, 400));
  ok('renewals: added with a 30-day horizon — register shows "Due in 30 days"');

  // 26. Leave: 2 annual days for Priya -> big remaining number drops 21 -> 19
  await page.getByRole('tab', { name: 'Leave' }).click();
  await page.getByLabel('Leave days for Priya Raman').fill('2');
  await page.getByRole('button', { name: 'Add leave for Priya Raman' }).click();
  await page.waitForTimeout(300);
  const leaveBody = (await page.textContent('body')) ?? '';
  if (!/19 days left/.test(leaveBody)) throw new Error('remaining should read "19 days left": ' + leaveBody.slice(0, 400));
  if (!/2 of 21 days/.test(leaveBody)) throw new Error('taken-vs-entitlement text "2 of 21 days" missing');
  ok('leave: 2 annual days recorded — remaining reads 19, bar text "2 of 21 days"');

  // 27. Dashboard Overview: "Coming up for renewal" strip shows the renewal
  await page.locator('[data-tour="nav-dashboard"]').click();
  await page.waitForSelector('h1:has-text("Dashboard")');
  await page.waitForTimeout(300);
  const overBody = (await page.textContent('body')) ?? '';
  if (!/Coming up for renewal/.test(overBody)) throw new Error('renewals strip missing from Overview');
  if (!/Professional indemnity insurance/.test(overBody)) throw new Error('strip missing the added renewal');
  if (!/Due in 30 days/.test(overBody)) throw new Error('strip missing "Due in 30 days"');
  ok('dashboard: "Coming up for renewal" strip lists the renewal for the manager');

  // 28. Staff persona: Priya reaches People via More and sees Roster ONLY
  await page.getByRole('button', { name: /Switch person/ }).click();
  await page.waitForSelector('text=Which one is you?');
  await page.getByRole('button', { name: 'Priya Raman' }).click();
  await page.waitForTimeout(600);
  await closeTour();
  await page.locator('[data-tour="nav-week"]').click();
  await page.waitForSelector('h1:has-text("Timesheet")');
  await closeTour();
  if (await page.locator('[data-tour="nav-people"]').count()) throw new Error('firm tabs should be collapsed for staff on Week');
  await page.locator('[data-tour="nav-more"]').click();
  await page.locator('[data-tour="nav-people"]').click();
  await page.waitForSelector('h1:has-text("People")');
  if (!(await page.getByRole('tab', { name: 'Roster' }).count())) throw new Error('Roster tab missing for staff');
  for (const t of ['Pay', 'Leave', 'Renewals']) {
    if (await page.getByRole('tab', { name: t }).count()) throw new Error(`staff must not see the ${t} sub-tab`);
  }
  const staffBody = (await page.textContent('body')) ?? '';
  if (/10,000|salary|payroll|End-of-service|payslip/i.test(staffBody))
    throw new Error('pay data visible to staff on People: ' + staffBody.slice(0, 400));
  ok('staff: People via More shows Roster only — no Pay/Leave/Renewals sub-tabs, no pay data in the DOM');

  // 29. Staff Dashboard: no renewals strip either
  await page.locator('[data-tour="nav-dashboard"]').click();
  await page.waitForSelector('h1:has-text("Dashboard")');
  await page.waitForTimeout(300);
  const staffDash = (await page.textContent('body')) ?? '';
  if (/Coming up for renewal|Professional indemnity/.test(staffDash)) throw new Error('renewals strip leaked to staff');
  ok('staff: Dashboard shows no renewals strip');

  // ---- Reimbursable expenses (Money → Expenses), back as Dana (manager) ----

  // 30. Money → Expenses tab: plain-language empty ledger, invoice UI gated off
  await page.getByRole('button', { name: /Switch person/ }).click();
  await page.waitForSelector('text=Which one is you?');
  await page.getByRole('button', { name: 'Dana Wright' }).click();
  await page.waitForTimeout(600);
  await closeTour();
  await page.locator('[data-tour="nav-invoices"]').click();
  await page.waitForSelector('h1:has-text("Money")');
  await page.getByRole('tab', { name: 'Expenses' }).click();
  await page.waitForTimeout(300);
  const expEmpty = (await page.textContent('body')) ?? '';
  if (!/No expenses written down yet/.test(expEmpty)) throw new Error('expenses empty state missing: ' + expEmpty.slice(0, 300));
  if (/Nothing outstanding|Owed to you:/.test(expEmpty)) throw new Error('receivables strip leaked onto the Expenses tab');
  if (/INV-0001/.test(expEmpty)) throw new Error('invoice list leaked onto the Expenses tab');
  ok('expenses: tab shows the plain-language empty state; receivables strip + invoice list gated off');

  // 31. Add two expenses on Miller Residence: one billable with 10% markup, one
  // firm cost — the summary line and the word badges must be exact
  await page.getByLabel('Expense project').selectOption({ index: 1 }); // Miller Residence
  await page.getByLabel('Expense kind').selectOption('travel');
  await page.getByLabel('Expense description').fill('Taxi to site');
  await page.getByLabel('Expense amount').fill('100');
  await page.getByLabel('Client pays this back').check();
  await page.getByLabel('Markup percent').fill('10');
  await page.getByLabel('Receipt note').fill('Drive: taxi-receipt.pdf');
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.waitForTimeout(400);
  await page.getByLabel('Expense project').selectOption({ index: 1 });
  await page.getByLabel('Expense kind').selectOption('printing');
  await page.getByLabel('Expense description').fill('Drawing sets');
  await page.getByLabel('Expense amount').fill('250');
  // "Client pays this back" stays UNTICKED — a firm cost
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.waitForTimeout(400);
  const expSummary = (await page.locator('[data-tour="expense-summary"]').textContent()) ?? '';
  if (!/2 expenses — \$350 — \$100 not billed yet/.test(expSummary))
    throw new Error('summary line wrong (want "2 expenses — $350 — $100 not billed yet"): ' + expSummary);
  const expLedger = (await page.textContent('body')) ?? '';
  if (!/Not billed yet/.test(expLedger)) throw new Error('"Not billed yet" badge missing on the billable expense');
  if (!/Firm cost — client doesn't pay/.test(expLedger)) throw new Error('firm-cost wording missing on the non-billable expense');
  if (!/Receipt: Drive: taxi-receipt\.pdf/.test(expLedger)) throw new Error('receipt note not shown on the row');
  ok('expenses: 2 added — summary "2 expenses — $350 — $100 not billed yet", word badges correct');

  // 32. "Download expenses (CSV)": header + both data rows, markup columns right
  const dlExp = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download expenses (CSV)' }).click();
  const expDownload = await dlExp;
  const expCsvPath = join(tmp, expDownload.suggestedFilename());
  await expDownload.saveAs(expCsvPath);
  const expCsvLines = readFileSync(expCsvPath, 'utf8').split('\r\n');
  if (expCsvLines[0] !== 'Date,Project,Category,Description,Amount,Client pays back,Markup %,Amount if billed,Billed,Receipt')
    throw new Error('expenses CSV header wrong: ' + expCsvLines[0]);
  if (expCsvLines.length !== 3) throw new Error(`expenses CSV should be header + 2 rows, got ${expCsvLines.length} lines`);
  const taxiRow = expCsvLines.find((l) => l.includes('Taxi to site'));
  if (!taxiRow || !taxiRow.includes('Miller Residence,Travel,Taxi to site,100,Yes,10,110,Not billed yet,Drive: taxi-receipt.pdf'))
    throw new Error('billable expense CSV row wrong: ' + taxiRow);
  const printRow = expCsvLines.find((l) => l.includes('Drawing sets'));
  if (!printRow || !printRow.includes('Miller Residence,Printing,Drawing sets,250,No,,,Firm cost — not billed to client,'))
    throw new Error('firm-cost expense CSV row wrong: ' + printRow);
  ok('expenses: CSV download — header + 2 rows, markup 10 → 110, firm-cost row blanks the markup columns');

  // 33. Invoice builder on-charge section: ONLY the billable expense is offered
  // (pre-ticked), in claim mode AND hourly mode; the firm cost never appears
  await page.getByRole('button', { name: /New invoice/i }).first().click();
  await page.waitForSelector('h1:has-text("New invoice")');
  await page.locator('select').first().selectOption({ index: 1 }); // Miller Residence → claim mode default
  await page.waitForSelector('text=Add expenses the client pays back');
  const section = page.locator('[data-tour="oncharge-expenses"]');
  const secTxt = (await section.textContent()) ?? '';
  if (!/1 waiting, \$110/.test(secTxt)) throw new Error('on-charge heading should say "(1 waiting, $110)": ' + secTxt.slice(0, 200));
  if (!/Taxi to site/.test(secTxt)) throw new Error('billable expense missing from the on-charge list');
  if (!/\$100 \+ 10% markup = \$110/.test(secTxt)) throw new Error('markup arithmetic missing from the row: ' + secTxt.slice(0, 300));
  if (/Drawing sets/.test(secTxt)) throw new Error('NON-billable expense leaked into the builder');
  if (!(await page.getByLabel('Put "Taxi to site" on this invoice').isChecked())) throw new Error('expense should start pre-ticked');
  await page.getByRole('button', { name: 'Bill by the hour' }).click();
  await page.waitForTimeout(300);
  if (!(await section.count())) throw new Error('on-charge section missing in hourly mode');
  if (/Drawing sets/.test((await section.textContent()) ?? '')) throw new Error('NON-billable expense leaked into the hourly builder');
  await page.getByRole('button', { name: 'Bill a percentage of the fee' }).click();
  await page.waitForTimeout(300);
  ok('builder: on-charge section in BOTH modes lists only the billable expense (pre-ticked); firm cost never appears');

  // 34. Create the claim (SD 80→90 = 1,275) with the expense — the expense line
  // lands below at exactly 100 × 1.10 = 110, with dashes in the % columns
  const sdPct3 = page.getByLabel(/Bill up to \(%\) for Schematic Design/);
  if ((await sdPct3.inputValue()) !== '80') throw new Error('SD should prefill at 80 (from step 13), got ' + (await sdPct3.inputValue()));
  await sdPct3.fill('90');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Create draft invoice/i }).click();
  await page.waitForSelector('text=Total due');
  const expInvNum = await page.getByLabel('Invoice number').inputValue();
  const lineDescs = await page.getByLabel('Line description').evaluateAll((els) => els.map((el) => el.value));
  if (!lineDescs.includes('Expense — Travel: Taxi to site'))
    throw new Error('expense line missing from the invoice doc: ' + JSON.stringify(lineDescs));
  const lineAmounts = await page.getByLabel('Line amount').evaluateAll((els) => els.map((el) => el.value));
  if (!lineAmounts.includes('110')) throw new Error('expense line amount should be the hand-computed 110: ' + JSON.stringify(lineAmounts));
  if (!lineAmounts.includes('1275')) throw new Error('claim line amount should be 1275 (10% × 12,750): ' + JSON.stringify(lineAmounts));
  if (!(await page.locator('[aria-label="Not a stage-fee line"]').count())) throw new Error('expense line should show dashes in the % columns');
  if (!/1,385/.test((await page.textContent('body')) ?? '')) throw new Error('Total due should be 1,385 (1,275 + 110)');
  ok(`expenses: on-charged onto ${expInvNum} — line "Expense — Travel: Taxi to site" at 110, dashes not zeros, total 1,385`);

  // 35. The ledger badge flips to "On invoice INV-…" and nothing is waiting
  await page.getByRole('button', { name: 'Invoices', exact: true }).click();
  await page.waitForSelector('h1:has-text("Money")');
  await page.getByRole('tab', { name: 'Expenses' }).click();
  await page.waitForTimeout(300);
  const billedLedger = (await page.textContent('body')) ?? '';
  if (!billedLedger.includes(`On invoice ${expInvNum}`)) throw new Error(`badge should read "On invoice ${expInvNum}"`);
  if (/Not billed yet/.test(billedLedger)) throw new Error('"Not billed yet" badge should be gone once the expense is on an invoice');
  const billedSummary = (await page.locator('[data-tour="expense-summary"]').textContent()) ?? '';
  if (!/\$0 not billed yet/.test(billedSummary)) throw new Error('summary should show $0 not billed yet: ' + billedSummary);
  ok(`expenses: badge reads "On invoice ${expInvNum}", summary shows $0 not billed yet`);

  // 36. Deleting that invoice releases the expense back to "Not billed yet"
  // (double-confirm dialogs are auto-accepted by the page dialog handler)
  await page.getByRole('tab', { name: 'Invoices' }).click();
  await page.waitForTimeout(300);
  await page.getByText(expInvNum, { exact: true }).click();
  await page.waitForSelector('text=Total due');
  await page.getByLabel(`Delete invoice ${expInvNum}`).click();
  await page.waitForSelector('h1:has-text("Money")');
  await page.waitForTimeout(300);
  if ((await page.textContent('body'))?.includes(expInvNum)) throw new Error('deleted invoice still listed');
  await page.getByRole('tab', { name: 'Expenses' }).click();
  await page.waitForTimeout(300);
  const releasedLedger = (await page.textContent('body')) ?? '';
  if (!/Not billed yet/.test(releasedLedger)) throw new Error('expense did not return to "Not billed yet" after the invoice was deleted');
  if (releasedLedger.includes(`On invoice ${expInvNum}`)) throw new Error('stale "On invoice" badge after delete');
  const releasedSummary = (await page.locator('[data-tour="expense-summary"]').textContent()) ?? '';
  if (!/2 expenses — \$350 — \$100 not billed yet/.test(releasedSummary))
    throw new Error('summary should be back to "$100 not billed yet": ' + releasedSummary);
  ok('expenses: deleting the invoice releases the expense — badge and summary back to "Not billed yet"');
} catch (err) {
  fail('flow', err.message ?? String(err));
  await page.screenshot({ path: 'e2e-failure.png', fullPage: true }).catch(() => {});
}

if (errors.length) fail('console pageerrors', errors.join(' | ').slice(0, 500));
else ok('no page errors');

await browser.close();
const failed = results.filter(([s]) => s === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
