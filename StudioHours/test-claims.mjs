// Fee-claim engine tests. Unlike the older test-*.mjs files (which replicate
// logic inline), this bundles the REAL src/lib/claims.ts + invoice.ts with
// rolldown (vite 8's bundler, already in node_modules) and asserts against the
// actual shipped functions — billing math must be tested on the code that runs.
// Run: node test-claims.mjs
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

// ---- bundle the real engine --------------------------------------------------
const src = (p) => JSON.stringify(join(import.meta.dirname, 'src', 'lib', p).replaceAll('\\', '/'));
const tmp = mkdtempSync(join(tmpdir(), 'sh-claims-'));
const entry = join(tmp, 'entry.mjs');
writeFileSync(entry, [
  `export * from ${src('claims.ts')};`,
  `export { invoiceTotals, invoiceToCsv } from ${src('invoice.ts')};`,
].join('\n'));
const bundle = await rolldown({ input: entry, logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const outfile = join(tmp, 'engine.mjs');
writeFileSync(outfile, output[0].code);
const {
  buildClaimLines,
  claimedPctByPhase,
  isClaimInvoice,
  makeClaimInvoice,
  stageFeeMismatch,
  validateClaims,
  invoiceTotals,
  invoiceToCsv,
} = await import(pathToFileURL(outfile));
ok('real engine bundled from src/lib (not a replica)');

// ---- fixtures ----------------------------------------------------------------
const phase = (id, name, code, seq, fee) => ({
  phaseId: id, name, aiaCode: code, sequence: seq,
  budgetedHours: null, budgetedFee: fee, billableDefault: true, status: 'open',
});
const project = {
  projectId: 'proj-1',
  clientName: 'Miller Family',
  projectNumber: '2026-014',
  projectName: 'Miller Residence',
  status: 'active',
  billingMethod: 'fixed_fee',
  fee: 590000,
  phases: [
    phase('ph-sd', 'Schematic Design', 'SD', 2, 100000),
    phase('ph-dd', 'Design Development', 'DD', 3, 490000), // the brief's example stage
    phase('ph-cd', 'Construction Documents', 'CD', 4, 0), // no fee entered yet
    phase('ph-pd', 'Pre-Design', 'PD', 1, null), // no fee entered yet
  ],
};
const firm = {
  schemaVersion: 1, exportType: 'firm',
  firm: { firmName: 'Atelier North', defaultWeeklyCapacityHours: 40 },
  people: [], projects: [project], nonProjectBuckets: [], activities: [],
  billingRates: { defaultHourlyRate: 150, personRates: {}, projectRates: {}, currency: 'USD' },
};
/** a minimal stored claim invoice wrapping the given lines */
const claimInvoice = (lines, status = 'draft', projectId = 'proj-1') => ({
  invoiceId: crypto.randomUUID(), schemaVersion: 1, invoiceNumber: 'INV-XXXX', status,
  invoiceType: 'claim', firmName: 'Atelier North', projectId, projectName: 'Miller Residence',
  projectNumber: '2026-014', clientName: 'Miller Family', billingMethod: 'fixed_fee',
  issueDate: '2026-07-01', dueDate: '2026-07-31', periodStart: '2026-06-01', periodEnd: '2026-06-30',
  groupBy: 'phase', includeBillable: false, includeOutOfScope: false, currency: 'USD',
  lines, taxRate: 0, taxLabel: 'Tax', discount: 0, notes: null, terms: null,
  sourceEntryIds: [], createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z',
});
const claimLine = (phaseId, phaseName, basisFee, prevPct, newPct) => ({
  lineId: crypto.randomUUID(), description: phaseName, hours: 0, rate: 0,
  amount: Math.round(((newPct - prevPct) / 100) * basisFee * 100) / 100,
  claim: { phaseId, phaseName, basisFee, prevPct, newPct },
});

// ---- 1. first claim ------------------------------------------------------------
{
  const claimed = claimedPctByPhase([], 'proj-1'); // nothing billed yet
  eq('first claim: nothing billed so far', claimed.size, 0);
  const lines = buildClaimLines(project, claimed, [{ phaseId: 'ph-dd', newPct: 40 }]);
  eq('first claim: one line', lines.length, 1);
  eq('first claim: 40% of 490,000 = 196,000', lines[0].amount, 196000);
  eq('first claim: derivation recorded (prev 0 → new 40 on 490,000)',
    lines[0].claim, { phaseId: 'ph-dd', phaseName: 'Design Development', basisFee: 490000, prevPct: 0, newPct: 40 });
  eq('first claim: hours/rate stay 0', [lines[0].hours, lines[0].rate], [0, 0]);
  eq('first claim: description uses stage code + name', lines[0].description, 'DD — Design Development');
}

// ---- 2. second cumulative claim (the brief's example) --------------------------
{
  // last month we billed 40% of the 490,000 stage; this month we're at 60%
  const prior = claimInvoice([claimLine('ph-dd', 'Design Development', 490000, 0, 40)], 'sent');
  const claimed = claimedPctByPhase([prior], 'proj-1');
  eq('second claim: billed-so-far reads 40%', claimed.get('ph-dd'), 40);
  const lines = buildClaimLines(project, claimed, [{ phaseId: 'ph-dd', newPct: 60 }]);
  eq('second claim: (60−40)% × 490,000 = 98,000', lines[0].amount, 98000);
  eq('second claim: prevPct snapshotted as 40', lines[0].claim.prevPct, 40);
}

// ---- 3. guard: > 100 hard-blocks ------------------------------------------------
{
  const errors = validateClaims(project, new Map(), [{ phaseId: 'ph-dd', newPct: 110 }]);
  eq('over-100: exactly one error', errors.length, 1);
  eq('over-100: kind', errors[0].kind, 'over_100');
  eq('over-100: 100 itself is allowed', validateClaims(project, new Map(), [{ phaseId: 'ph-dd', newPct: 100 }]).length, 0);
}

// ---- 4. guard: below previous hard-blocks (can't un-claim here) ------------------
{
  const claimed = new Map([['ph-dd', 60]]);
  const errors = validateClaims(project, claimed, [{ phaseId: 'ph-dd', newPct: 40 }]);
  eq('below-prev: exactly one error', errors.length, 1);
  eq('below-prev: kind', errors[0].kind, 'below_previous');
  eq('below-prev: message names the stage and the floor',
    errors[0].message.includes('60%') && errors[0].message.includes('Design Development'), true);
  eq('below-prev: same % as before is NOT an error (it is just no change)',
    validateClaims(project, claimed, [{ phaseId: 'ph-dd', newPct: 60 }]).length, 0);
  eq('below-prev: no-change input builds no line',
    buildClaimLines(project, claimed, [{ phaseId: 'ph-dd', newPct: 60 }]).length, 0);
}

// ---- 5. a parked DRAFT still counts toward billed-so-far -------------------------
{
  const draft = claimInvoice([claimLine('ph-dd', 'Design Development', 490000, 0, 40)], 'draft');
  const claimed = claimedPctByPhase([draft], 'proj-1');
  eq('draft counts: billed-so-far includes the draft (40%)', claimed.get('ph-dd'), 40);
  const errors = validateClaims(project, claimed, [{ phaseId: 'ph-dd', newPct: 30 }]);
  eq('draft counts: claiming 30% after a 40% draft is blocked', errors[0]?.kind, 'below_previous');
}

// ---- 6. cumulative-max semantics (not sum-of-deltas) -----------------------------
{
  const invs = [
    claimInvoice([claimLine('ph-dd', 'Design Development', 490000, 0, 40)], 'paid'),
    claimInvoice([claimLine('ph-dd', 'Design Development', 490000, 40, 60)], 'sent'),
  ];
  eq('max-not-sum: 40% then 60% cumulative = 60 (not 100)', claimedPctByPhase(invs, 'proj-1').get('ph-dd'), 60);
  const reissued = [...invs, claimInvoice([claimLine('ph-dd', 'Design Development', 490000, 40, 60)], 'draft')];
  eq('max-not-sum: a correction re-issued at the same 60% stays 60', claimedPctByPhase(reissued, 'proj-1').get('ph-dd'), 60);
  // duplicate lines for one phase inside ONE invoice: last wins
  const dupes = claimInvoice([
    claimLine('ph-dd', 'Design Development', 490000, 0, 50),
    claimLine('ph-dd', 'Design Development', 490000, 0, 30),
  ]);
  eq('within one invoice: last line wins (30)', claimedPctByPhase([dupes], 'proj-1').get('ph-dd'), 30);
  // stored outlier (hand-edited 150 in the editor) can never poison the guard past 100
  const wild = claimInvoice([claimLine('ph-dd', 'Design Development', 490000, 0, 150)]);
  eq('stored 150% clamps to 100 when read', claimedPctByPhase([wild], 'proj-1').get('ph-dd'), 100);
  // other projects and time invoices are ignored
  const noise = [claimInvoice([claimLine('ph-x', 'Other', 1000, 0, 90)], 'sent', 'proj-2'),
    { ...claimInvoice([claimLine('ph-dd', 'Design Development', 490000, 0, 90)]), invoiceType: undefined }];
  eq('other projects + time invoices ignored', claimedPctByPhase(noise, 'proj-1').size, 0);
}

// ---- 7. multi-phase invoice ------------------------------------------------------
{
  const claimed = new Map([['ph-sd', 80], ['ph-dd', 40]]);
  const lines = buildClaimLines(project, claimed, [
    { phaseId: 'ph-dd', newPct: 60 }, // passed out of stage order on purpose
    { phaseId: 'ph-sd', newPct: 100 },
    { phaseId: 'ph-cd', newPct: 50 }, // fee 0 — must be skipped, not billed as $0
  ]);
  eq('multi-phase: two lines (zero-fee stage skipped)', lines.length, 2);
  eq('multi-phase: lines come out in stage order', lines.map((l) => l.claim.phaseId), ['ph-sd', 'ph-dd']);
  eq('multi-phase: SD 80→100 of 100,000 = 20,000', lines[0].amount, 20000);
  eq('multi-phase: DD 40→60 of 490,000 = 98,000', lines[1].amount, 98000);
  const totals = invoiceTotals({ lines, discount: 0, taxRate: 0 });
  eq('multi-phase: invoice subtotal 118,000 via the shared totals engine', totals.subtotal, 118000);
  eq('multi-phase: duplicate inputs — last wins',
    buildClaimLines(project, new Map(), [{ phaseId: 'ph-dd', newPct: 50 }, { phaseId: 'ph-dd', newPct: 10 }])[0].amount, 49000);
}

// ---- 8. stage fees ≠ project fee → structured, non-blocking warning ---------------
{
  const w = stageFeeMismatch(project); // 100,000 + 490,000 + 0 + null = 590,000 = fee
  eq('sum==fee: no warning', w, null);
  const off = { ...project, fee: 600000 };
  eq('sum≠fee: warning carries both numbers', stageFeeMismatch(off), { stageFeeSum: 590000, projectFee: 600000 });
  eq('no project fee entered: nothing to reconcile, no warning', stageFeeMismatch({ ...project, fee: null }), null);
  // the warning must not block line building
  eq('sum≠fee: billing still works', buildClaimLines(off, new Map(), [{ phaseId: 'ph-dd', newPct: 10 }]).length, 1);
}

// ---- 9. rounding ------------------------------------------------------------------
{
  const odd = { ...project, phases: [phase('ph-odd', 'Odd Stage', 'OS', 1, 33333.33)] };
  const l = buildClaimLines(odd, new Map(), [{ phaseId: 'ph-odd', newPct: 33.33 }])[0];
  // 33.33% × 33,333.33 = 11,109.998889 → 11,110.00 (round2, same rule as invoice.ts)
  eq('rounding: 33.33% of 33,333.33 → 11,110.00', l.amount, 11110);
  const cents = { ...project, phases: [phase('ph-c', 'Cents', 'C', 1, 0.1)] };
  eq('rounding: sub-cent claims round to 2dp (0.5% of $0.10 → $0)',
    buildClaimLines(cents, new Map(), [{ phaseId: 'ph-c', newPct: 0.5 }])[0].amount, 0);
  const drift = { ...project, phases: [phase('ph-d', 'Drift', 'D', 1, 1234.565)] };
  const dl = buildClaimLines(drift, new Map([['ph-d', 10]]), [{ phaseId: 'ph-d', newPct: 20 }])[0];
  eq('rounding: 10% of 1,234.565 → 123.46 (not 123.4565…)', dl.amount, 123.46);
  eq('rounding: pcts are stored at 2dp', (() => {
    const p = buildClaimLines(odd, new Map(), [{ phaseId: 'ph-odd', newPct: 33.333333 }])[0].claim.newPct;
    return p;
  })(), 33.33);
}

// ---- 10. makeClaimInvoice assembles a correct draft --------------------------------
{
  const claimed = new Map([['ph-dd', 40]]);
  const inv = makeClaimInvoice({
    firm, project, invoiceNumber: 'INV-0042', issueDate: '2026-07-07',
    periodStart: '2026-07-01', periodEnd: '2026-07-31',
    claimedSoFar: claimed, inputs: [{ phaseId: 'ph-dd', newPct: 60 }],
  });
  eq('makeClaimInvoice: invoiceType claim', inv.invoiceType, 'claim');
  eq('makeClaimInvoice: isClaimInvoice true', isClaimInvoice(inv), true);
  eq('makeClaimInvoice: legacy invoices (no invoiceType) read as time', isClaimInvoice({}), false);
  eq('makeClaimInvoice: sourceEntryIds stays [] (never collides with the hourly guard)', inv.sourceEntryIds, []);
  eq('makeClaimInvoice: status draft, number as given', [inv.status, inv.invoiceNumber], ['draft', 'INV-0042']);
  eq('makeClaimInvoice: net-30 due date', inv.dueDate, '2026-08-06');
  eq('makeClaimInvoice: total 98,000', invoiceTotals(inv).total, 98000);

  // ---- CSV shape: same 9 columns as hourly invoices, quantity columns relabeled ----
  const csv = invoiceToCsv(inv);
  const rows = csv.split('\r\n').map((r) => r.split(','));
  eq('csv: header relabeled for claims',
    rows[0], ['Invoice', 'Client', 'Project', 'Issue date', 'Due date', 'Description', '% this invoice', '% to date', 'Amount']);
  eq('csv: every row keeps exactly 9 columns', rows.every((r) => r.length === 9), true);
  eq('csv: claim line carries delta / to-date / amount', [rows[1][6], rows[1][7], rows[1][8]], ['20', '60', '98000']);
  eq('csv: subtotal row leaves the quantity cell blank (pcts of different fees do not sum)', rows[2][6], '');
  eq('csv: total in the amount column', [rows.at(-1)[5], rows.at(-1)[8]], ['Total', '98000']);

  // regression: hourly invoices keep the exact old header
  const hourly = { ...inv, invoiceType: undefined, lines: [{ lineId: 'l1', description: 'CD', hours: 10, rate: 150, amount: 1500 }] };
  eq('csv: hourly header unchanged',
    invoiceToCsv(hourly).split('\r\n')[0], 'Invoice,Client,Project,Issue date,Due date,Description,Hours,Rate,Amount');
}

// ---- summary -----------------------------------------------------------------------
const failed = results.filter(([s]) => s === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
