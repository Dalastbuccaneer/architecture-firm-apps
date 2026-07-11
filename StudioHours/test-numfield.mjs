// Simulate NumField behavior

function fmtNum(n) {
  return String(Math.round(n * 100) / 100);
}

function parseNum(raw) {
  const s = raw.trim().replace(',', '.');
  if (s === '') return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

console.log('=== Test NumField display and parse ===\n');

// Scenario: A line with blended rate that creates rounding issue
const lineData = {
  hours: 50,
  rate: 100.01,
  amount: 5000.55
};

console.log('Initial line data:');
console.log(`  hours: ${lineData.hours}`);
console.log(`  rate: ${lineData.rate}`);
console.log(`  amount: ${lineData.amount}`);

console.log('\nUser sees these values formatted:');
const displayHours = fmtNum(lineData.hours);
const displayRate = fmtNum(lineData.rate);
const displayAmount = fmtNum(lineData.amount);
console.log(`  hours: ${displayHours}`);
console.log(`  rate: ${displayRate}`);
console.log(`  amount: ${displayAmount}`);

console.log('\nUser clicks hours field and presses "Ctrl+A, Delete, then types 50":');
const userInput = '50';
const parsed = parseNum(userInput);
console.log(`  Raw input: "${userInput}"`);
console.log(`  Parsed value: ${parsed}`);
console.log(`  Is same as current? ${parsed === lineData.hours}`);

console.log('\nWhen editHours is called with parsed value:');
const round2 = (n) => Math.round(n * 100) / 100;
const recalculated = round2(parsed * lineData.rate);
console.log(`  New amount = round2(${parsed} * ${lineData.rate}) = ${recalculated}`);
console.log(`  Original amount was: ${lineData.amount}`);
console.log(`  Amount changed? ${recalculated !== lineData.amount ? 'YES ✗' : 'NO ✓'}`);

console.log('\n=== Test with blank entry then deletion ===');
// Another scenario: user selects all and types new value
console.log('\nUser selects the rate field and types a new rate:');
const newRateInput = '100.02';
const newRateParsed = parseNum(newRateInput);
console.log(`  Input: "${newRateInput}"`);
console.log(`  Parsed: ${newRateParsed}`);

console.log('\nWhen editRate is called:');
const newRecalculatedAmount = round2(lineData.hours * newRateParsed);
console.log(`  New amount = round2(${lineData.hours} * ${newRateParsed}) = ${newRecalculatedAmount}`);
console.log(`  Original amount: ${lineData.amount}`);
console.log(`  User lost control of amount? ${newRecalculatedAmount !== lineData.amount ? 'YES ✗' : 'NO ✓'}`);

console.log('\n=== Test manual amount edit ===');
console.log('\nUser edits amount field directly to apply a discount:');
const manualAmount = '4950';
const manualParsed = parseNum(manualAmount);
console.log(`  Input: "${manualAmount}"`);
console.log(`  Parsed: ${manualParsed}`);

console.log('\nBut then user realizes hours is wrong and edits hours:');
const correctedHours = 49.5;
const correctedAmount = round2(correctedHours * lineData.rate);
console.log(`  New hours: ${correctedHours}`);
console.log(`  System recalculates amount = ${correctedHours} * ${lineData.rate} = ${correctedAmount}`);
console.log(`  User's manual amount (${manualParsed}) is overwritten to ${correctedAmount}`);
console.log(`  User's discount adjustment lost? YES ✗`);
