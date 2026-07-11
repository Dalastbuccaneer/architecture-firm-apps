// Test CSV export integrity

const round2 = (n) => Math.round(n * 100) / 100;

// Simulate a blended-rate invoice line
const invoice = {
  invoiceNumber: 'INV-0001',
  clientName: 'Acme Corp',
  projectName: 'Renovation',
  issueDate: '2026-07-06',
  dueDate: '2026-08-06',
  lines: [
    {
      description: 'Design Phase',
      hours: round2(50), // 50 hours from blended rates
      rate: round2(7799.70 / 50), // 155.99 (blended)
      amount: round2(7799.70) // The exact accumulated amount
    }
  ],
  discount: 0,
  taxRate: 0
};

console.log('=== Invoice Line ===');
console.log(`Description: ${invoice.lines[0].description}`);
console.log(`Hours: ${invoice.lines[0].hours}`);
console.log(`Rate: ${invoice.lines[0].rate}`);
console.log(`Amount: ${invoice.lines[0].amount}`);

console.log('\n=== CSV Output (what gets exported) ===');
const l = invoice.lines[0];
const csvLine = `"${invoice.invoiceNumber}","${invoice.clientName}","${invoice.projectName}","${invoice.issueDate}","${invoice.dueDate}","${l.description}",${l.hours},${l.rate},${l.amount}`;
console.log(csvLine);

console.log('\n=== Bookkeeper Math Check ===');
const bookkeeper_calc = l.hours * l.rate;
console.log(`Bookkeeper calculation: ${l.hours} × ${l.rate} = ${round2(bookkeeper_calc)}`);
console.log(`Reported amount: ${l.amount}`);
console.log(`Match? ${round2(bookkeeper_calc) === l.amount ? 'YES ✓' : 'NO ✗'}`);

if (round2(bookkeeper_calc) !== l.amount) {
  const diff = round2(l.amount - round2(bookkeeper_calc));
  console.log(`\nDiscrepancy: ${diff} (${(diff / l.amount * 100).toFixed(2)}%)`);
  console.log('^ This would be flagged as an ERROR in accounting software');
}
