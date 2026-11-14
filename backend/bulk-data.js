const assert = require('node:assert/strict');
const data = require('./demo-data');
const prefix = `${data.dataset}-BULK-`;
const lots = Array.from({length: 100}, (_, index) => ({
  ...data.lots[index % data.lots.length],
  lotId: `${prefix}${String(index + 1).padStart(3, '0')}`,
  product: data.products[index % data.products.length],
  target: 10,
}));

function documentFor(sample) {
  assert.ok(lots.some(lot => lot.lotId === sample.lotId), 'Only the fixed bulk fixture may generate documents');
  const stream = `BT /F1 16 Tf 48 780 Td (TRACECHAIN - SYNTHETIC TEST DOCUMENT) Tj 0 -30 Td (Lot: ${sample.lotId}) Tj 0 -24 Td (Product: ${sample.product.code}) Tj 0 -24 Td (Not an official certificate or evidence of physical quality.) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
module.exports = {prefix, lots, documentFor};
