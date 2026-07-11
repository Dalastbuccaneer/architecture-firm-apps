// Test edge cases

const round2 = (n) => Math.round(n * 100) / 100;

console.log('=== EDGE CASE 1: Entries sum to fractional pennies ===');
// Three entries that when summed create rounding issues
const e1 = 0.33 * 100.03; // 33.0099
const e2 = 0.33 * 100.03; // 33.0099
const e3 = 0.34 * 100.03; // 34.0102
const totalAmount = e1 + e2 + e3; // 100.0300
const totalHours = 1;
console.log(`Entry 1: 0.33h @ 100.03 = ${e1}`);
console.log(`Entry 2: 0.33h @ 100.03 = ${e2}`);
console.log(`Entry 3: 0.34h @ 100.03 = ${e3}`);
console.log(`Exact totals: ${totalHours}h, $${totalAmount}`);

const displayHours = round2(totalHours);
const displayAmount = round2(totalAmount);
const displayRate = totalHours > 0 ? round2(totalAmount / totalHours) : 0;

console.log(`\nAfter rounding:`);
console.log(`Hours: ${displayHours}`);
console.log(`Rate: ${displayRate}`);
console.log(`Amount: ${displayAmount}`);
console.log(`Check: ${displayHours} × ${displayRate} = ${round2(displayHours * displayRate)}`);
console.log(`Match? ${round2(displayHours * displayRate) === displayAmount ? 'YES ✓' : 'NO ✗'}`);

console.log('\n=== EDGE CASE 2: Discount exceeds calculation error ===');
// When the rounding error is larger than a small adjustment
const line = {
  hours: 50,
  rate: 100,
  amount: 5000
};
// But what if due to rounding the actual amount should be 5000.20?
const actualAmount = 5000.20;
const discount = 0.50; // User wants to discount 50 cents
const discountedAmount = actualAmount - discount;

console.log(`Calculated amount: ${actualAmount}`);
console.log(`User applies discount of: $${discount}`);
console.log(`Discounted amount should be: ${discountedAmount}`);

// Now imagine the system shows something different
const systemShownAmount = 5000;
const systemCalculatedDiscount = systemShownAmount - discount;
console.log(`\nBut if system only shows: ${systemShownAmount}`);
console.log(`User's discount of $${discount} might become: ${systemCalculatedDiscount}`);

console.log('\n=== EDGE CASE 3: Tax calculation with rounding errors ===');
// If discount is based on a rounded amount, tax calculation could be off
const subtotal = 5000.15; // Due to rounding errors
const taxRate = 10;
const correctTax = round2(subtotal * (taxRate / 100));
const roundedSubtotal = round2(subtotal);
const taxOnRounded = round2(roundedSubtotal * (taxRate / 100));

console.log(`Subtotal (exact): ${subtotal}`);
console.log(`Tax at ${taxRate}%: ${correctTax}`);
console.log(`\nSubtotal (rounded): ${roundedSubtotal}`);
console.log(`Tax at ${taxRate}%: ${taxOnRounded}`);
console.log(`Tax difference: $${round2(taxOnRounded - correctTax)}`);
