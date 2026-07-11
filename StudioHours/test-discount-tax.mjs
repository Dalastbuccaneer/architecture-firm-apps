// Test discount and tax calculation edge cases

const round2 = (n) => Math.round(n * 100) / 100;

function invoiceTotals(inv) {
  const subtotal = round2(inv.lines.reduce((s, l) => s + l.amount, 0));
  const discount = Math.min(Math.max(0, inv.discount || 0), subtotal);
  const discounted = round2(subtotal - discount);
  const tax = round2(discounted * ((inv.taxRate || 0) / 100));
  return {
    hours: round2(inv.lines.reduce((s, l) => s + l.hours, 0)),
    subtotal,
    discount: round2(discount),
    discounted,
    tax,
    total: round2(discounted + tax),
  };
}

console.log('=== TEST 1: Discount clamping ===');
const inv1 = {
  lines: [
    { hours: 10, rate: 100, amount: 1000 },
  ],
  discount: 1500, // More than subtotal
  taxRate: 0
};
const t1 = invoiceTotals(inv1);
console.log(`Subtotal: $${t1.subtotal}`);
console.log(`Requested discount: $1500 (clamped to subtotal)`);
console.log(`Actual discount applied: $${t1.discount}`);
console.log(`Discounted subtotal: $${t1.discounted}`);
console.log(`Clamping works? ${t1.discount === t1.subtotal ? 'YES ✓' : 'NO ✗'}`);

console.log('\n=== TEST 2: Tax on discounted amount ===');
const inv2 = {
  lines: [
    { hours: 10, rate: 100, amount: 1000 },
  ],
  discount: 100,
  taxRate: 10
};
const t2 = invoiceTotals(inv2);
console.log(`Subtotal: $${t2.subtotal}`);
console.log(`Discount: $${t2.discount}`);
console.log(`Discounted: $${t2.discounted}`);
console.log(`Tax at 10% on discounted: $${t2.tax}`);
console.log(`Total: $${t2.total}`);
// Verify: (1000 - 100) * 0.10 = 90
const verify = (1000 - 100) * 0.10;
console.log(`Verify: (1000 - 100) × 0.10 = ${verify}`);
console.log(`Correct? ${t2.tax === verify ? 'YES ✓' : 'NO ✗'}`);

console.log('\n=== TEST 3: Multiple lines with discount and tax ===');
const inv3 = {
  lines: [
    { hours: 20, rate: 150, amount: 3000.25 }, // Blended rate scenario
    { hours: 30, rate: 160, amount: 4800.30 },
  ],
  discount: 500,
  taxRate: 8.5
};
const t3 = invoiceTotals(inv3);
console.log(`Line 1 amount: $${inv3.lines[0].amount}`);
console.log(`Line 2 amount: $${inv3.lines[1].amount}`);
console.log(`Subtotal: $${t3.subtotal}`);
console.log(`Discount: $${t3.discount}`);
console.log(`Discounted: $${t3.discounted}`);
console.log(`Tax at 8.5%: $${t3.tax}`);
console.log(`Total: $${t3.total}`);
// Verify the math
const verify3 = {
  subtotal: inv3.lines[0].amount + inv3.lines[1].amount,
  discounted: inv3.lines[0].amount + inv3.lines[1].amount - 500,
  tax: round2((inv3.lines[0].amount + inv3.lines[1].amount - 500) * 0.085)
};
verify3.total = round2(verify3.discounted + verify3.tax);
console.log(`\nVerify subtotal: ${verify3.subtotal} (system: ${t3.subtotal})`);
console.log(`Verify discounted: ${verify3.discounted} (system: ${t3.discounted})`);
console.log(`Verify tax: ${verify3.tax} (system: ${t3.tax})`);
console.log(`Verify total: ${verify3.total} (system: ${t3.total})`);
console.log(`All match? ${
  t3.subtotal === verify3.subtotal &&
  t3.discounted === verify3.discounted &&
  t3.tax === verify3.tax &&
  t3.total === verify3.total ? 'YES ✓' : 'NO ✗'
}`);
