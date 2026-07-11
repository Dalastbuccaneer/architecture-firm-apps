// Reimbursable-expense engine tests. Like test-claims.mjs this bundles the
// REAL src/lib/expenses.ts + invoice.ts with rolldown and asserts against the
// actual shipped functions — the on-charge math and the never-bill-twice
// predicates must be tested on the code that runs. Run: node test-expenses.mjs
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
const tmp = mkdtempSync(join(tmpdir(), 'sh-expenses-'));
const entry = join(tmp, 'entry.mjs');
writeFileSync(entry, [
  `export * from ${src('expenses.ts')};`,
  `export { invoiceTotals, invoiceToCsv } from ${src('invoice.ts')};`,
].join('\n'));
const bundle = await rolldown({ input: entry, logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const outfile = join(tmp, 'engine.mjs');
writeFileSync(outfile, output[0].code);
const {
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_CSV_COLUMNS,
  expenseLine,
  expenseSummary,
  expensesToCsv,
  isUnbilledBillable,
  newExpense,
  onChargeAmount,
  releaseExpenses,
  unbilledBillableExpenses,
  invoiceTotals,
  invoiceToCsv,
} = await import(pathToFileURL(outfile));
ok('real engine bundled from src/lib (not a replica)');

// ---- fixtures ----------------------------------------------------------------
const exp = (over = {}) => ({
  id: over.id ?? crypto.randomUUID(),
  date: '2026-07-01',
  projectId: 'proj-1',
  projectName: 'Miller Residence',
  category: 'travel',
  description: 'Taxi to site',
  amount: 100,
  billable: true,
  invoiceId: null,
  schemaVersion: 1,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
  ...over,
});

// ---- 1. markup + rounding (same round2 rule as invoice.ts) ---------------------
{
  eq('markup: 100 + 10% = 110', onChargeAmount({ amount: 100, markupPct: 10 }), 110);
  eq('markup: no markupPct field → the recorded amount unchanged', onChargeAmount({ amount: 250 }), 250);
  eq('markup: markupPct 0 → unchanged', onChargeAmount({ amount: 250, markupPct: 0 }), 250);
  // 33.33 × 1.1 = 36.663 → rounds to cents
  eq('markup: 33.33 + 10% → 36.66 (round2, never sub-cent)', onChargeAmount({ amount: 33.33, markupPct: 10 }), 36.66);
  // 41.675 × 1 — float dust: 0.1+0.2 style cases must still land on cents
  eq('markup: 19.99 + 5% → 20.99 (20.9895 rounds up)', onChargeAmount({ amount: 19.99, markupPct: 5 }), 20.99);
  eq('markup: 0.10 + 2.5% → 0.1 (sub-cent markup rounds away)', onChargeAmount({ amount: 0.1, markupPct: 2.5 }), 0.1);
  eq('markup: fractional pct 12.5% on 80 → 90', onChargeAmount({ amount: 80, markupPct: 12.5 }), 90);
}

// ---- 2. the "only billable AND unbilled" selection predicate --------------------
{
  eq('predicate: billable + invoiceId null → in', isUnbilledBillable(exp()), true);
  eq('predicate: billable + invoiceId undefined → in', isUnbilledBillable(exp({ invoiceId: undefined })), true);
  eq('predicate: billable + invoiceId absent → in', (() => { const e = exp(); delete e.invoiceId; return isUnbilledBillable(e); })(), true);
  eq('predicate: already on an invoice → out', isUnbilledBillable(exp({ invoiceId: 'inv-1' })), false);
  eq('predicate: not billable → out (never appears in any builder)', isUnbilledBillable(exp({ billable: false })), false);
  eq('predicate: not billable AND stamped → out', isUnbilledBillable(exp({ billable: false, invoiceId: 'inv-1' })), false);

  const pool = [
    exp({ id: 'a', date: '2026-07-03' }),                              // in, newest date
    exp({ id: 'b', date: '2026-07-01' }),                              // in, oldest
    exp({ id: 'c', billable: false }),                                 // out: firm cost
    exp({ id: 'd', invoiceId: 'inv-9' }),                              // out: billed
    exp({ id: 'e', projectId: 'proj-2' }),                             // out: other project
    exp({ id: 'f', date: '2026-07-02', invoiceId: undefined }),        // in
  ];
  const got = unbilledBillableExpenses(pool, 'proj-1');
  eq('selection: only billable+unbilled rows of THE project', got.map((e) => e.id), ['b', 'f', 'a']);
  eq('selection: oldest first (invoice lines read chronologically)', got[0].date, '2026-07-01');
  eq('selection: empty pool → empty list', unbilledBillableExpenses([], 'proj-1'), []);
}

// ---- 3. expenseLine — the invoice line an expense becomes -----------------------
{
  const l = expenseLine(exp({ id: 'x1', markupPct: 10 }));
  eq('line: description "Expense — Travel: Taxi to site"', l.description, 'Expense — Travel: Taxi to site');
  eq('line: amount is the marked-up figure (110)', l.amount, 110);
  eq('line: hours/rate stay 0 like claim lines (doc + CSV blank them)', [l.hours, l.rate], [0, 0]);
  eq('line: no claim detail (never collides with claim-mode fields)', l.claim, undefined);
  eq('line: derivation recorded', l.expense, { expenseId: 'x1', category: 'travel', baseAmount: 100, markupPct: 10 });
  const plain = expenseLine(exp({ id: 'x2', category: 'subconsultant', description: 'Structural review', amount: 1200 }));
  eq('line: no markup → base amount, markupPct recorded as 0', [plain.amount, plain.expense.markupPct], [1200, 0]);
  eq('line: category label is a plain word', plain.description, 'Expense — Subconsultant: Structural review');
  eq('line: totals engine sums expense lines like any other', invoiceTotals({ lines: [l, plain], discount: 0, taxRate: 0 }).subtotal, 1310);
  eq('line: expense lines contribute 0 hours to the invoice hour total', invoiceTotals({ lines: [l, plain], discount: 0, taxRate: 0 }).hours, 0);
}

// ---- 4. release-on-delete predicate ---------------------------------------------
{
  const pool = [
    exp({ id: 'a', invoiceId: 'inv-1' }),
    exp({ id: 'b', invoiceId: 'inv-1', billable: true }),
    exp({ id: 'c', invoiceId: 'inv-2' }), // a DIFFERENT invoice — must not be touched
    exp({ id: 'd' }),                     // never billed — must not be touched
  ];
  const released = releaseExpenses(pool, 'inv-1');
  eq('release: exactly the matching expenses come back', released.map((e) => e.id), ['a', 'b']);
  eq('release: their invoiceId is cleared to null ("Not billed yet")', released.map((e) => e.invoiceId), [null, null]);
  eq('release: released rows pass the unbilled predicate again', released.every(isUnbilledBillable), true);
  eq('release: updatedAt is stamped fresh', released.every((e) => e.updatedAt !== '2026-07-01T00:00:00Z'), true);
  eq('release: the other invoice\'s expense is NOT in the patch set', released.some((e) => e.id === 'c'), false);
  eq('release: the source array is not mutated', pool.find((e) => e.id === 'a').invoiceId, 'inv-1');
  eq('release: unknown invoice id → empty patch set', releaseExpenses(pool, 'inv-nope'), []);
}

// ---- 5. newExpense factory --------------------------------------------------------
{
  const e = newExpense({
    date: '2026-07-05', projectId: 'p', projectName: 'P', category: 'printing',
    description: 'Drawing sets', amount: 250, billable: false,
  });
  eq('factory: starts unbilled (invoiceId null)', e.invoiceId, null);
  eq('factory: schemaVersion stamped', e.schemaVersion, 1);
  eq('factory: has an id and timestamps', [!!e.id, !!e.createdAt, e.createdAt === e.updatedAt], [true, true, true]);
}

// ---- 6. ledger summary line ---------------------------------------------------------
{
  const s = expenseSummary([
    exp({ amount: 100, markupPct: 10 }),                    // billable, unbilled
    exp({ amount: 250, billable: false }),                  // firm cost
    exp({ amount: 900, invoiceId: 'inv-1' }),               // already billed
  ]);
  eq('summary: count / total are the RECORDED amounts (the ledger)', [s.count, s.total], [3, 1250]);
  eq('summary: "not billed yet" counts only billable+unbilled, un-marked-up', s.unbilled, 100);
  eq('summary: empty list → zeros', expenseSummary([]), { count: 0, total: 0, unbilled: 0 });
  eq('summary: cents round cleanly', expenseSummary([exp({ amount: 0.1 }), exp({ amount: 0.2 })]).total, 0.3);
}

// ---- 7. invoice CSV: expense lines blank the qty columns, never 0/NaN ----------------
{
  const baseInv = {
    invoiceNumber: 'INV-0042', clientName: 'Miller Family', projectName: 'Miller Residence',
    issueDate: '2026-07-07', dueDate: '2026-08-06', taxRate: 0, taxLabel: 'Tax', discount: 0,
  };
  // time invoice: an hourly line + an expense line
  const timeInv = {
    ...baseInv,
    lines: [
      { lineId: 'l1', description: 'CD', hours: 10, rate: 150, amount: 1500 },
      expenseLine(exp({ id: 'x1', markupPct: 10 })),
    ],
  };
  const tRows = invoiceToCsv(timeInv).split('\r\n').map((r) => r.split(','));
  eq('csv/time: header unchanged', tRows[0].slice(5), ['Description', 'Hours', 'Rate', 'Amount']);
  eq('csv/time: hourly line keeps hours/rate', [tRows[1][6], tRows[1][7], tRows[1][8]], ['10', '150', '1500']);
  eq('csv/time: expense line blanks Hours and Rate, amount marked up',
    [tRows[2][6], tRows[2][7], tRows[2][8]], ['', '', '110']);
  eq('csv/time: expense description rides through', tRows[2][5], 'Expense — Travel: Taxi to site');
  eq('csv/time: subtotal hours count only real hours (10)', [tRows[3][5], tRows[3][6], tRows[3][8]], ['Subtotal', '10', '1610']);
  eq('csv/time: every row keeps exactly 9 columns', tRows.every((r) => r.length === 9), true);

  // claim invoice: a claim line + an expense line
  const claimInv = {
    ...baseInv,
    invoiceType: 'claim',
    lines: [
      { lineId: 'c1', description: 'SD — Schematic Design', hours: 0, rate: 0, amount: 98000,
        claim: { phaseId: 'ph', phaseName: 'Schematic Design', basisFee: 490000, prevPct: 40, newPct: 60 } },
      expenseLine(exp({ id: 'x2', markupPct: 10 })),
    ],
  };
  const cRows = invoiceToCsv(claimInv).split('\r\n').map((r) => r.split(','));
  eq('csv/claim: header relabeled', cRows[0].slice(6), ['% this invoice', '% to date', 'Amount']);
  eq('csv/claim: claim line keeps its percentages', [cRows[1][6], cRows[1][7]], ['20', '60']);
  eq('csv/claim: expense line blanks BOTH % columns', [cRows[2][6], cRows[2][7], cRows[2][8]], ['', '', '110']);
  eq('csv/claim: every row keeps exactly 9 columns', cRows.every((r) => r.length === 9), true);
}

// ---- 8. expenses ledger CSV -----------------------------------------------------------
{
  const rows = expensesToCsv(
    [
      exp({ id: 'a', markupPct: 10, receiptNote: 'Drive: taxi.pdf' }),
      exp({ id: 'b', category: 'printing', description: 'Drawing sets, 3x', amount: 250, billable: false }),
      exp({ id: 'c', invoiceId: 'inv-1' }),
      exp({ id: 'd', invoiceId: 'inv-gone' }),
    ],
    new Map([['inv-1', 'INV-0012']]),
  ).split('\r\n');
  eq('ledger csv: header', rows[0],
    'Date,Project,Category,Description,Amount,Client pays back,Markup %,Amount if billed,Billed,Receipt');
  eq('ledger csv: billable row carries markup + on-charge amount + receipt',
    rows[1], '2026-07-01,Miller Residence,Travel,Taxi to site,100,Yes,10,110,Not billed yet,Drive: taxi.pdf');
  eq('ledger csv: comma in description gets quoted, firm-cost row blanks markup columns',
    rows[2], '2026-07-01,Miller Residence,Printing,"Drawing sets, 3x",250,No,,,Firm cost — not billed to client,');
  eq('ledger csv: billed row names the invoice in plain words', rows[3].includes('On invoice INV-0012'), true);
  eq('ledger csv: a stamped id whose invoice is gone degrades gracefully', rows[4].includes('On invoice (deleted)'), true);
  eq('ledger csv: column labels are the shipped constant', EXPENSE_CSV_COLUMNS.length, 10);
  eq('ledger csv: category words match the UI labels', EXPENSE_CATEGORY_LABEL.subconsultant, 'Subconsultant');
}

// ---- summary -----------------------------------------------------------------------
const failed = results.filter(([s]) => s === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
