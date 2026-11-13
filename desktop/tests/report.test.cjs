const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderReport, fromTextReport } = require('../report.cjs');
test('readable report safely round-trips untrusted workbook text without script injection', () => {
  const title = '</script><script>alert("bad")</script> & =SUM(1,2)';
  const data = { entries: [{ kind: 'not_added', carousel: 'Synthetic', title, reason: 'No match' }], logs: [title] };
  const html = renderReport(data);
  assert.equal(html.includes('</script><script>alert'), false);
  const payload = html.match(/id="report-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(payload), data);
  assert.match(html, /Titles not added/); assert.match(html, /Other issues/); assert.match(html, /Season 1 selections/);
});
test('legacy run conversion highlights individual skipped titles and partial saves', () => {
  const data = fromTextReport('Amazon Carousel Updater V1.8\nNEW RUN: full update • synthetic.xlsx\nSynthetic: skipped title Missing (no unique catalog match); continuing with other titles in this carousel.\nSynthetic: saved and verified 5/6 matched titles (Column A position 3); all existing titles preserved.\nOther: matched titles already correct.\nPublished successfully. Verified storefront order after reload.');
  assert.equal(data.entries.length, 1); assert.equal(data.entries[0].title, 'Missing'); assert.equal(data.entries[0].position, 3);
  assert.equal(data.statuses.Synthetic, 'Saved (partial)'); assert.equal(data.saved, 1); assert.equal(data.workbook, 'synthetic.xlsx'); assert.equal(data.status, 'Published and verified');
});
