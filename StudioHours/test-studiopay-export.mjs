// StudioPay export tests. Same discipline as test-people.mjs: bundle the REAL
// src modules with rolldown and run them against the actual Dexie database on
// fake-indexeddb, so the export is exercised end-to-end against a REAL
// populated database — not fixtures pretending to be one.
//
// THE ONE UNACCEPTABLE BUG this file exists to prevent: the StudioPay hand-off
// (the JSON this app exports for the sibling StudioPay app) must NEVER contain
// HR / payroll / renewals data, and must never leak time-tracking internals
// (hours, rates, notes, terms, source entry ids) either — only the invoice
// facts StudioPay needs. Section 1 plants unmistakable secrets across the
// people-ops tables (exactly like test-people.mjs) plus draft/sent/paid
// invoices with hours/rates/notes/terms on them, builds the export from the
// live database, and asserts none of the forbidden material appears and only
// the whitelisted invoice shape survives. Run: node test-studiopay-export.mjs
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
const tmp = mkdtempSync(join(tmpdir(), 'sh-studiopay-'));
const entry = join(tmp, 'entry.mjs');
writeFileSync(entry, [
  `export { buildStudioPayExport, studiopayExportFilename } from ${src('lib/studiopayExport.ts')};`,
  `export { invoiceTotals } from ${src('lib/invoice.ts')};`,
  `export { db, setFirm, kvSet, resetAll, KV_EOSB_RULE } from ${src('db.ts')};`,
  `export { newFirm, newPerson, uid } from ${src('lib/seeds.ts')};`,
].join('\n'));
const bundle = await rolldown({ input: entry, logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const outfile = join(tmp, 'engine.mjs');
writeFileSync(outfile, output[0].code);
const {
  buildStudioPayExport, studiopayExportFilename,
  invoiceTotals,
  db, setFirm, kvSet, resetAll, KV_EOSB_RULE,
  newFirm, newPerson, uid,
} = await import(pathToFileURL(outfile));
ok('real engine bundled from src (studiopayExport + db layer run on fake-indexeddb, not a replica)');

// ---- fixtures: a firm + a database FULL of people-ops AND invoicing secrets ---
const firm = newFirm('Atelier North');
const dana = newPerson('Dana Wright');
dana.isManager = true;
const priya = newPerson('Priya Raman');
firm.people.push(dana, priya);
const project = {
  projectId: uid(), clientName: 'Miller Family', projectNumber: '2026-014',
  projectName: 'Miller Residence', status: 'active', billingMethod: 'fixed_fee',
  fee: 85000, phases: [],
};
firm.projects.push(project);
firm.billingRates = { defaultHourlyRate: 150, personRates: {}, projectRates: {}, currency: 'USD' };
await setFirm(firm);

// Unmistakable planted people-ops secrets — same shape as test-people.mjs.
const SECRET_SALARY = 987654;
const SECRET_ALLOWANCE = 'Housing allowance';
const SECRET_DOC = 'Medical insurance card';
const SECRET_RENEWAL = 'Professional indemnity insurance';
const SECRET_RUN_ID = 'RUN-SECRET-0001';

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
await kvSet(KV_EOSB_RULE, { bands: [{ yearsFrom: 0, yearsTo: null, daysPerYear: 15 }], schemaVersion: 1 });

// Planted invoicing secrets: internal fields that must never travel to StudioPay,
// on invoices at every status.
const SECRET_NOTE = 'CONFIDENTIAL internal collections note';
const SECRET_TERMS = 'Net 45, penalty clause XYZ';
const SECRET_ENTRY_A = 'SECRET-ENTRY-AAA';
const SECRET_ENTRY_B = 'SECRET-ENTRY-BBB';

function invoiceFixture(overrides) {
  const at = '2026-07-01T00:00:00Z';
  return {
    invoiceId: uid(),
    schemaVersion: 1,
    invoiceNumber: 'INV-0000',
    status: 'draft',
    firmName: firm.firm.firmName,
    projectId: project.projectId,
    projectName: project.projectName,
    projectNumber: project.projectNumber,
    clientName: project.clientName,
    billingMethod: 'fixed_fee',
    issueDate: '2026-07-01',
    dueDate: '2026-07-31',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    groupBy: 'phase',
    includeBillable: true,
    includeOutOfScope: false,
    currency: 'USD',
    lines: [
      { lineId: uid(), description: 'Design development', hours: 40, rate: 150, amount: 6000 },
      { lineId: uid(), description: 'Construction administration', hours: 10, rate: 150, amount: 1500 },
    ],
    taxRate: 5,
    taxLabel: 'VAT',
    discount: 100,
    notes: SECRET_NOTE,
    terms: SECRET_TERMS,
    sourceEntryIds: [SECRET_ENTRY_A, SECRET_ENTRY_B],
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

const draftInv = invoiceFixture({ invoiceNumber: 'INV-0001', status: 'draft' });
const sentInv = invoiceFixture({ invoiceNumber: 'INV-0002', status: 'sent', sentDate: '2026-07-05' });
const paidInv = invoiceFixture({
  invoiceNumber: 'INV-0003', status: 'paid', sentDate: '2026-07-02', paidDate: '2026-07-10',
  lines: [{ lineId: uid(), description: 'Site visits', hours: 6, rate: 150, amount: 900 }],
  taxRate: 0, discount: 0,
});
await db.invoices.bulkPut([draftInv, sentInv, paidInv]);
ok('database populated: hr + payrollRuns + renewals + eosbRule secrets, plus draft/sent/paid invoices carrying notes/terms/sourceEntryIds/hours/rate');

// ---- 1. CONFIDENTIALITY: the StudioPay export stays clean ----------------------
{
  // Read invoices back off the LIVE database, exactly as Invoices.tsx does —
  // buildStudioPayExport only ever sees this array + a firm name string.
  const allInvoices = await db.invoices.toArray();
  const nonDraft = allInvoices.filter((inv) => inv.status !== 'draft');
  eq('live query: 3 invoices on file, 2 non-draft', [allInvoices.length, nonDraft.length], [3, 2]);

  const payload = buildStudioPayExport(nonDraft, firm.firm.firmName);
  const text = JSON.stringify(payload, null, 2);

  // (a) deep case-insensitive scan: no forbidden key/word ANYWHERE in the tree
  // or the raw serialized text.
  const forbidden = ['salary', 'payroll', 'hr', 'eosb', 'renewal', 'visa', 'leave', 'rate', 'hours', 'sourceEntryIds', 'notes', 'terms'];
  const forbiddenRe = new RegExp(forbidden.join('|'), 'i');
  const badKeys = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (forbiddenRe.test(k)) badKeys.push(`${path}.${k}`);
        walk(v, `${path}.${k}`);
      }
    }
  };
  walk(payload, '$');
  eq('export: deep key scan finds no forbidden keys', badKeys, []);
  for (const word of forbidden) {
    eq(`export: no "${word}" anywhere in the raw serialized text`, new RegExp(word, 'i').test(text), false);
  }

  // (b) the planted secret VALUES are nowhere in the raw text either.
  eq('export: salary figure absent', text.includes(String(SECRET_SALARY)), false);
  eq('export: housing allowance label absent', text.includes(SECRET_ALLOWANCE), false);
  eq('export: hr document label absent', text.includes(SECRET_DOC), false);
  eq('export: renewal label absent', text.includes(SECRET_RENEWAL), false);
  eq('export: payroll run id absent', text.includes(SECRET_RUN_ID), false);
  eq('export: confidential note absent', text.includes(SECRET_NOTE), false);
  eq('export: confidential terms absent', text.includes(SECRET_TERMS), false);
  eq('export: source entry ids absent', text.includes(SECRET_ENTRY_A) || text.includes(SECRET_ENTRY_B), false);

  // (c) draft invoices are excluded — only the sent + paid ones travel.
  eq('export: draft invoice excluded', payload.invoices.some((i) => i.invoiceNumber === 'INV-0001'), false);
  eq('export: exactly the 2 non-draft invoices are present', payload.invoices.map((i) => i.invoiceNumber).sort(), ['INV-0002', 'INV-0003']);

  // (d) exactly the whitelisted keys are present on each invoice + its lines —
  // nothing extra can ride along, whatever it's called.
  const sentOut = payload.invoices.find((i) => i.invoiceNumber === 'INV-0002');
  const paidOut = payload.invoices.find((i) => i.invoiceNumber === 'INV-0003');
  const baseKeys = ['invoiceId', 'invoiceNumber', 'status', 'projectName', 'projectNumber', 'clientName', 'currency', 'issueDate', 'dueDate', 'total', 'lines'];
  eq('export: sent invoice has sentDate but no paidDate key', Object.keys(sentOut).sort(), [...baseKeys, 'sentDate'].sort());
  eq('export: paid invoice has both sentDate and paidDate keys', Object.keys(paidOut).sort(), [...baseKeys, 'sentDate', 'paidDate'].sort());
  for (const line of [...sentOut.lines, ...paidOut.lines]) {
    eq(`export: line "${line.description}" carries ONLY description + amount`, Object.keys(line).sort(), ['amount', 'description']);
  }

  // (e) totals match invoiceTotals() exactly (tax + discount already folded in).
  eq('export: sent invoice total matches invoiceTotals (with 5% VAT, $100 discount)', sentOut.total, invoiceTotals(sentInv).total);
  eq('export: paid invoice total matches invoiceTotals (no tax/discount)', paidOut.total, invoiceTotals(paidInv).total);
  eq('export: sanity — sent total is a real number > 0', sentOut.total > 0, true);

  // (f) envelope shape is correct.
  eq('export: exportType is invoices-for-studiopay', payload.exportType, 'invoices-for-studiopay');
  eq('export: schemaVersion is 1', payload.schemaVersion, 1);
  eq('export: firmName carried through', payload.firmName, 'Atelier North');
  eq('export: exportedAt looks like an ISO timestamp', /^\d{4}-\d{2}-\d{2}T/.test(payload.exportedAt), true);

  // (g) an empty invoice list still produces a well-formed (empty) export.
  const empty = buildStudioPayExport([], 'Atelier North');
  eq('export: empty invoice list -> empty invoices array, still valid envelope', [empty.invoices.length, empty.exportType, empty.schemaVersion], [0, 'invoices-for-studiopay', 1]);

  // (h) filename helper follows the app's slug + date convention.
  const fileName = studiopayExportFilename('Atelier North');
  eq('filename: starts with the slugged firm name', fileName.startsWith('atelier-north_'), true);
  eq('filename: ends with .json', fileName.endsWith('.json'), true);
  eq('filename: contains "studio-pay-invoices"', fileName.includes('studio-pay-invoices'), true);
  eq('filename: contains a YYYY-MM-DD date', /\d{4}-\d{2}-\d{2}/.test(fileName), true);
}

// ---- 2. sanity: the source data really did have the forbidden words on it -----
// (positive control — proves section 1's clean result isn't just an empty test)
{
  const rawInvoiceText = JSON.stringify([draftInv, sentInv, paidInv]);
  eq('positive control: source invoices DO contain "hours"/"rate"/"notes"/"terms"/"sourceEntryIds"', {
    hours: /hours/i.test(rawInvoiceText),
    rate: /rate/i.test(rawInvoiceText),
    notes: /notes/i.test(rawInvoiceText) || rawInvoiceText.includes(SECRET_NOTE),
    terms: /terms/i.test(rawInvoiceText) || rawInvoiceText.includes(SECRET_TERMS),
    sourceEntryIds: /sourceEntryIds/i.test(rawInvoiceText),
  }, { hours: true, rate: true, notes: true, terms: true, sourceEntryIds: true });

  const hrRow = await db.hr.get(priya.personId);
  eq('positive control: hr table really does hold the planted salary', hrRow?.baseSalary, SECRET_SALARY);
}

await resetAll();
ok('resetAll clears the database after the run');

// ---- summary --------------------------------------------------------------------------
const failed = results.filter(([s]) => s === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
