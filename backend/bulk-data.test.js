const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const http = require('node:http');
const data = require('./demo-data');
const bulk = require('./bulk-data');

test('bulk fixture is disjoint, deterministic and contains 100 complete lots with 100 distinct valid PDF structures', () => {
  assert.equal(bulk.lots.length, 100); assert.equal(new Set(bulk.lots.map(lot => lot.lotId)).size, 100);
  assert.equal(new Set(bulk.lots.map(lot => lot.product.code)).size, 10);
  assert.ok(bulk.lots.every(lot => !data.lots.some(old => old.lotId === lot.lotId) && lot.lotId.startsWith(bulk.prefix) && data.expectedTypes(lot).length === 11));
  const hashes = new Set();
  for (const sample of bulk.lots) {
    const pdf = bulk.documentFor(sample), text = pdf.toString();
    assert.ok(text.startsWith('%PDF-1.4\n')); assert.ok(text.endsWith('%%EOF\n'));
    assert.ok(text.includes(sample.lotId)); assert.ok(text.includes('SYNTHETIC TEST DOCUMENT'));
    assert.deepEqual(pdf, bulk.documentFor(sample));
    const xref = Number(text.match(/startxref\n(\d+)/)[1]);
    assert.equal(text.slice(xref, xref + 4), 'xref');
    const entries = text.slice(xref).split('\n').slice(3, 8);
    entries.forEach((entry, index) => assert.ok(text.slice(Number(entry.slice(0, 10))).startsWith(`${index + 1} 0 obj\n`)));
    const stream = text.match(/\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/);
    assert.equal(Buffer.byteLength(stream[2]), Number(stream[1]));
    hashes.add(createHash('sha256').update(pdf).digest('hex'));
  }
  assert.equal(hashes.size, 100);
  assert.throws(() => bulk.documentFor({...bulk.lots[0], lotId: 'OTHER-LOT'}));
  assert.equal(data.lots.length, 24);
});

test('demo API helper preserves multipart boundaries and JSON error receipts', async () => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    requests.push({contentType: req.headers['content-type'], body: Buffer.concat(chunks).toString()});
    res.setHeader('Content-Type', 'application/json');
    if (req.url.endsWith('/fail')) {res.statusCode = 503; res.end(JSON.stringify({code: 'COMMIT_UNCERTAIN', transactionId: 'fixture'}));}
    else res.end(JSON.stringify({ok: true}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const previous = process.env.API_URL;
  process.env.API_URL = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const {call} = require('./demo');
    const form = new FormData(); form.append('lotId', bulk.lots[0].lotId);
    form.append('document', new Blob([bulk.documentFor(bulk.lots[0])], {type: 'application/pdf'}), 'sample.pdf');
    assert.deepEqual(await call('/documents', 'fixture-token', 'POST', form), {ok: true});
    assert.match(requests[0].contentType, /^multipart\/form-data; boundary=/); assert.ok(requests[0].body.includes('%PDF-1.4'));
    await assert.rejects(call('/fail', 'fixture-token', 'POST', {lotId: 'fixture'}), error => error.status === 503 && error.receipt.code === 'COMMIT_UNCERTAIN');
    assert.equal(requests[1].contentType, 'application/json'); assert.deepEqual(JSON.parse(requests[1].body), {lotId: 'fixture'});
  } finally {
    if (previous === undefined) delete process.env.API_URL; else process.env.API_URL = previous;
    await new Promise(resolve => server.close(resolve));
  }
});
