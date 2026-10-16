const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Engine, resolveExisting, preservesExtras, skipContent, reservedRail } = require('../engine.cjs');
test('preserve existing titles, duplicates and non-target relative order', () => {
  assert.ok(preservesExtras(['A', 'B', 'B'], ['C', 'A', 'B', 'B'], ['C']));
  assert.equal(preservesExtras(['A', 'B', 'B'], ['C', 'A', 'B'], ['C']), false);
  assert.equal(preservesExtras(['A', 'B'], ['C', 'B', 'A'], ['C']), false);
});
test('known aliases and existing seasons; no fuzzy new matches', () => {
  assert.equal(resolveExisting('WHC', ['When Hope Calls: Season 2']), 'When Hope Calls: Season 2');
  assert.equal(resolveExisting('Apostle Peter', ['Apostle Paul']), undefined);
  assert.equal(skipContent({ name: 'Leaving Soon', titles: ['Anything'] }), true);
  assert.equal(skipContent({ name: 'Dynamic', titles: [], dynamic: true }), true);
});
function fakeAdapter(rejectPublish = false) {
  let saved = [reservedRail, 'Extras', 'Romance'], order = saved.slice(); const calls = [];
  return { calls, publishDelay: 0, async reload() { order = saved.slice(); }, async call(command, input) {
    calls.push(command);
    if (command === 'state') return { overview: true, order: order.slice(), publishEnabled: JSON.stringify(order) !== JSON.stringify(saved) };
    if (command === 'order') return { order: order.slice() };
    if (command === 'moveRail') { const source = order.indexOf(input.name); [order[source], order[source - 1]] = [order[source - 1], order[source]]; return { order: order.slice() }; }
    if (command === 'publishStorefront' && !rejectPublish) saved = order.slice();
    return {};
  } };
}
const sheet = { name: 'Week', rails: [{ name: 'Romance', position: 1, titles: ['Title'], dynamic: false }] };
test('order-only keeps Top 10, preserves extra rails and waits for separate publish', async () => {
  const adapter = fakeAdapter(), engine = new Engine(adapter);
  await engine.run(sheet, false);
  assert.deepEqual(engine.staged, [reservedRail, 'Romance']);
  assert.deepEqual(adapter.calls.filter(c => !['resume', 'state', 'order', 'moveRail'].includes(c)), []);
  await engine.publish(); assert.equal(engine.status, 'Published and verified');
  await engine.run(sheet, false); assert.equal(engine.staged, null);
});
test('a publish toast without persisted order is a failure', async () => {
  const engine = new Engine(fakeAdapter(true)); await engine.run(sheet, false);
  await assert.rejects(engine.publish(), /differs after reload/);
  assert.equal(engine.status, 'Needs attention'); assert.equal(engine.staged, null);
});
test('missing rails stop before content changes', async () => {
  const adapter = fakeAdapter(), engine = new Engine(adapter);
  await assert.rejects(engine.run({ name: 'Week', rails: [{ name: 'Missing', titles: ['Title'] }] }, true), /Cannot match/);
  assert.equal(adapter.calls.includes('open'), false); assert.equal(engine.busy, false);
});
test('stop is honored before the next operation', async () => {
  const engine = new Engine(fakeAdapter()); await engine.stop();
  await assert.rejects(engine.call('moveRail', { name: 'Romance', position: 1 }), /Stopped/);
});
