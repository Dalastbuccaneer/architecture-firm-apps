// QA repro: "charge hourly for 50 hours" — inject a project with exactly 50
// billable hours via the real import pipeline, drive the invoice builder like a
// human, and assert every number to the cent. Also checks the fixed-fee trap
// (imported projects default to fixed_fee → 'Billable hours' starts unticked)
// and calculator-consistency of blended lines (hours × rate === amount).
// Run: node qa-invoice-50h.mjs  (preview server on :4173)
import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://localhost:4173/';
const results = [];
const ok = (name) => { results.push(['PASS', name]); console.log('PASS', name); };
const fail = (name, err) => { results.push(['FAIL', name + ' — ' + err]); console.log('FAIL', name, err); };

// 10 weekday entries × 5h = exactly 50 billable hours in June 2026.
const DATES = ['2026-06-01','2026-06-02','2026-06-03','2026-06-04','2026-06-05','2026-06-08','2026-06-09','2026-06-10','2026-06-11','2026-06-12'];
const exportFile = {
  schemaVersion: 1,
  exportType: 'time-entries',
  exportedAt: new Date().toISOString(),
  personId: 'qa-person-1',
  personName: 'Testa QA',
  firmName: 'Atelier North',
  periodStart: DATES[0],
  periodEnd: DATES[DATES.length - 1],
  referencedEntities: {
    projects: [{ projectId: 'qa-proj-1', projectName: 'QA Tower', clientName: 'QA Client' }],
    phases: [{ phaseId: 'qa-ph-1', projectId: 'qa-proj-1', name: 'Construction Documents', aiaCode: 'CD' }],
  },
  entries: DATES.map((date, i) => ({
    id: `qa-e-${i}`,
    schemaVersion: 1,
    personId: 'qa-person-1',
    personName: 'Testa QA',
    date,
    projectId: 'qa-proj-1',
    projectName: 'QA Tower',
    phaseId: 'qa-ph-1',
    phaseName: 'Construction Documents',
    activityId: null,
    activityName: null,
    hours: 5,
    billable: true,
    outOfScope: false,
    requestedBy: null,
    notes: null,
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const closeTour = async () => {
  await page.waitForTimeout(900);
  for (let i = 0; i < 3; i++) {
    if (await page.locator('.driver-popover').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
  }
};

try {
  // Sample firm (default rate 150; person 'Testa QA' is new → default applies)
  await page.goto(BASE);
  await page.getByText('Explore with sample data').click();
  await page.waitForSelector('h1:has-text("Timesheet")', { timeout: 15000 });
  await closeTour();

  // Import the 50h file through the real dashboard pipeline
  await page.locator('[data-tour="nav-dashboard"]').click();
  await page.waitForSelector('h1:has-text("Dashboard")');
  await closeTour();
  const tmp = mkdtempSync(join(tmpdir(), 'sh-qa-'));
  const filePath = join(tmp, 'atelier-north_testa-qa_2026-W23.json');
  writeFileSync(filePath, JSON.stringify(exportFile));
  await page.locator('[data-tour="drop-zone"] input[type="file"]').setInputFiles(filePath);
  await page.waitForTimeout(800);
  const importText = await page.locator('[data-tour="drop-zone"]').textContent();
  if (!/Testa QA — 10 entries/.test(importText ?? '')) throw new Error('import outcome wrong: ' + importText?.slice(0, 200));
  ok('50h file imported (10 entries, Testa QA)');

  // Invoice builder (the Invoices list lives under the Money tab)
  await page.locator('[data-tour="nav-invoices"]').click();
  await page.waitForSelector('h1:has-text("Money")');
  await page.getByRole('button', { name: /New invoice/i }).first().click();
  await page.waitForSelector('h1:has-text("New invoice")');
  await page.locator('select').first().selectOption({ label: /QA Tower/.source ? undefined : undefined }).catch(() => {});
  // selectOption by visible label substring:
  const projSelect = page.locator('select').first();
  const optionValue = await projSelect.locator('option', { hasText: 'QA Tower' }).getAttribute('value');
  if (!optionValue) throw new Error('QA Tower missing from project dropdown');
  await projSelect.selectOption(optionValue);
  // Imported projects default to fixed_fee, and fixed-fee projects now open on
  // "Bill a percentage of the fee" — this QA drives the HOURLY path, so switch.
  const hourlyModeBtn = page.getByRole('button', { name: /Bill by the hour/i });
  if (await hourlyModeBtn.count()) {
    await hourlyModeBtn.click();
    await page.waitForTimeout(250);
  }
  await page.getByLabel('Period start').fill('2026-06-01');
  await page.getByLabel('Period end').fill('2026-06-30');
  await page.waitForTimeout(400);

  // THE TRAP: imported project defaults to fixed_fee → 'Billable hours' unticked.
  const billableCb = page.getByRole('checkbox', { name: /Billable hours/i });
  const startedUnchecked = !(await billableCb.isChecked());
  const bodyText1 = (await page.textContent('body')) ?? '';
  if (startedUnchecked) {
    if (!/fixed-fee/i.test(bodyText1)) throw new Error('fixed-fee explanation note missing while Billable hours is unticked');
    ok('fixed-fee trap explained: imported project starts with Billable hours unticked + visible note');
    await billableCb.check();
    await page.waitForTimeout(300);
  } else {
    ok('project came in hourly; Billable hours already ticked');
  }

  // Preview must say exactly 50 hours / $7,500 (50 × default 150) — auto-retrying
  // waits, so a slow React re-render can't false-fail the check.
  await page.waitForSelector('text=50 hours', { timeout: 8000 });
  await page.waitForSelector('text=/\\$7,500/', { timeout: 8000 });
  ok('preview: 50 hours, subtotal $7,500 (50 × 150 default rate)');

  // Create → editor totals
  await page.getByRole('button', { name: /Create draft invoice/i }).click();
  await page.waitForSelector('text=Total due');
  const docText = (await page.textContent('body')) ?? '';
  if (!/\$7,500/.test(docText)) throw new Error('Total due is not $7,500');
  if (!/50 hours billed/.test(docText)) throw new Error('"50 hours billed" missing');
  ok('invoice: Total due $7,500 · 50 hours billed — exact');

  // Every line must multiply out: hours × rate === amount (calculator check)
  const hoursVals = await page.getByLabel('Line hours').all();
  const rateVals = await page.getByLabel('Line rate').all();
  const amountVals = await page.getByLabel('Line amount').all();
  for (let i = 0; i < hoursVals.length; i++) {
    const h = Number(await hoursVals[i].inputValue());
    const r = Number(await rateVals[i].inputValue());
    const a = Number(await amountVals[i].inputValue());
    if (Math.abs(h * r - a) > 0.01) throw new Error(`line ${i + 1}: ${h} × ${r} = ${(h * r).toFixed(2)} ≠ ${a}`);
  }
  ok(`line arithmetic verified on ${hoursVals.length} line(s): hours × rate = amount`);

  // Blended-rate consistency: invoice Hillside (3 people, 3 rates) over all time
  await page.getByRole('button', { name: /^Money$/ }).first().click();
  await page.waitForSelector('h1:has-text("Money")');
  await page.getByRole('button', { name: /New invoice/i }).first().click();
  await page.waitForSelector('h1:has-text("New invoice")');
  const projSelect2 = page.locator('select').first();
  const hillsideVal = await projSelect2.locator('option', { hasText: 'Hillside' }).getAttribute('value');
  await projSelect2.selectOption(hillsideVal);
  await page.getByLabel('Period start').fill('2000-01-01');
  await page.getByLabel('Period end').fill('2100-01-01');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Create draft invoice/i }).click();
  await page.waitForSelector('text=Total due');
  const h2 = await page.getByLabel('Line hours').all();
  const r2 = await page.getByLabel('Line rate').all();
  const a2 = await page.getByLabel('Line amount').all();
  let subtotalCalc = 0;
  for (let i = 0; i < h2.length; i++) {
    const h = Number(await h2[i].inputValue());
    const r = Number(await r2[i].inputValue());
    const a = Number(await a2[i].inputValue());
    subtotalCalc += a;
    if (Math.abs(h * r - a) > 0.01) throw new Error(`blended line ${i + 1}: ${h} × ${r} ≠ ${a}`);
  }
  const shownSubtotal = ((await page.textContent('body')) ?? '').match(/Subtotal\$?([\d,]+\.?\d*)/);
  ok(`blended invoice: all ${h2.length} lines multiply out; Σ line amounts = ${subtotalCalc.toFixed(2)}${shownSubtotal ? ' (subtotal shown: ' + shownSubtotal[1] + ')' : ''}`);
} catch (err) {
  fail('flow', err.message ?? String(err));
  await page.screenshot({ path: 'qa-50h-failure.png', fullPage: true }).catch(() => {});
}

if (errors.length) fail('console pageerrors', errors.join(' | ').slice(0, 400));
else ok('no page errors');

await browser.close();
const failed = results.filter(([s]) => s === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
