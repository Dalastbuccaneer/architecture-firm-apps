// Quick test to verify the blended rate rounding issue

const round2 = (n) => Math.round(n * 100) / 100;

// Simulate buildLines behavior
function buildLinesSimulation(entries) {
  const groups = new Map();
  
  for (const e of entries) {
    const key = e.groupKey;
    const g = groups.get(key) ?? { hours: 0, amount: 0 };
    g.hours += e.hours;
    g.amount += e.hours * e.rate;
    groups.set(key, g);
  }
  
  return [...groups.values()].map((g) => ({
    hours: round2(g.hours),
    rate: g.hours > 0 ? round2(g.amount / g.hours) : 0,
    amount: round2(g.amount),
  }));
}

// Test 1: Entries with different rates that group together
console.log('=== TEST 1: Blended rate rounding ===');
const entries1 = [
  { groupKey: 'phase-A', hours: 20, rate: 150 },
  { groupKey: 'phase-A', hours: 30, rate: 159.99 }
];
const line1 = buildLinesSimulation(entries1)[0];
console.log('Entry 1: 20 hours @ 150 = 3000');
console.log('Entry 2: 30 hours @ 159.99 = 4799.70');
console.log('Totals: 50 hours, 7799.70');
console.log('Result line:');
console.log(`  Hours: ${line1.hours}`);
console.log(`  Rate: ${line1.rate}`);
console.log(`  Amount: ${line1.amount}`);
console.log(`  Check: ${line1.hours} × ${line1.rate} = ${round2(line1.hours * line1.rate)}`);
console.log(`  Mismatch? ${round2(line1.hours * line1.rate) !== line1.amount ? 'YES ✗' : 'NO ✓'}`);

// Test 2: Realistic scenario with fractional hours
console.log('\n=== TEST 2: Fractional hours with blended rate ===');
const entries2 = [
  { groupKey: 'phase-B', hours: 10.25, rate: 100.01 },
  { groupKey: 'phase-B', hours: 20.75, rate: 100.01 },
  { groupKey: 'phase-B', hours: 19, rate: 100.02 }
];
const line2 = buildLinesSimulation(entries2)[0];
const exactAmount = 10.25 * 100.01 + 20.75 * 100.01 + 19 * 100.02;
const exactHours = 50;
console.log(`Entry 1: 10.25 hours @ 100.01 = ${10.25 * 100.01}`);
console.log(`Entry 2: 20.75 hours @ 100.01 = ${20.75 * 100.01}`);
console.log(`Entry 3: 19 hours @ 100.02 = ${19 * 100.02}`);
console.log(`Exact totals: ${exactHours} hours, ${exactAmount}`);
console.log('Result line:');
console.log(`  Hours: ${line2.hours}`);
console.log(`  Rate: ${line2.rate}`);
console.log(`  Amount: ${line2.amount}`);
console.log(`  Check: ${line2.hours} × ${line2.rate} = ${round2(line2.hours * line2.rate)}`);
console.log(`  Mismatch? ${round2(line2.hours * line2.rate) !== line2.amount ? 'YES ✗' : 'NO ✓'}`);

// Test 3: The hours re-entry issue
console.log('\n=== TEST 3: Hours re-entry changes amount ===');
const line3_before = { hours: 50, rate: 100.01, amount: 5000.55 };
// User re-enters the hours field with the same value
const recalculated_amount = round2(50 * 100.01);
console.log(`Before: hours=${line3_before.hours}, rate=${line3_before.rate}, amount=${line3_before.amount}`);
console.log(`User re-enters hours as ${line3_before.hours}`);
console.log(`System recalculates amount as: ${line3_before.hours} × ${line3_before.rate} = ${recalculated_amount}`);
console.log(`After: hours=50, rate=100.01, amount=${recalculated_amount}`);
console.log(`Amount changed? ${recalculated_amount !== line3_before.amount ? 'YES ✗' : 'NO ✓'}`);

// Test 4: Manual discount adjustment is lost when hours are edited
console.log('\n=== TEST 4: Manual discount adjustment is lost ===');
const line4_start = { hours: 50, rate: 100.01, amount: 5000.55 };
const line4_discounted = { hours: 50, rate: 100.01, amount: 4950 }; // User applied discount
// User then edits hours
const line4_after = { hours: 49.5, rate: 100.01, amount: round2(49.5 * 100.01) };
console.log(`Before discount: amount=${line4_start.amount}`);
console.log(`User applies discount: amount=${line4_discounted.amount}`);
console.log(`User edits hours to 49.5`);
console.log(`System recalculates: amount = 49.5 × 100.01 = ${line4_after.amount}`);
console.log(`Discount lost? ${line4_after.amount !== line4_discounted.amount ? 'YES ✗' : 'NO ✓'}`);
