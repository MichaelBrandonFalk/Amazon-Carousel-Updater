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
  return { calls, verificationPause: 0, async reload() { order = saved.slice(); }, async call(command, input) {
    calls.push(command);
    if (command === 'state') return { overview: true, navigationReady: true, order: order.slice(), publishEnabled: JSON.stringify(order) !== JSON.stringify(saved) };
    if (command === 'order') return { order: order.slice() };
    if (command === 'moveRail') { const source = order.indexOf(input.name); [order[source], order[source - 1]] = [order[source - 1], order[source]]; return { order: order.slice() }; }
    if (command === 'publishStorefront' && !rejectPublish) saved = order.slice();
    if (command === 'verifySavedOrder' && JSON.stringify(order) !== JSON.stringify(input.expected)) throw Error('Saved storefront order differs after reload');
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
test('catalog lookup exceptions are reported and later carousels still run', async () => {
  const adapter = fakeAdapter(), originalCall = adapter.call;
  adapter.call = async (command, input) => {
    if (command === 'pins') return { pins: ['Existing title'] };
    if (command === 'search') throw Error('Catalog temporarily unavailable');
    return originalCall(command, input);
  };
  const engine = new Engine(adapter), update = engine.updateContent.bind(engine);
  let laterProcessed = false;
  engine.open = async () => {};
  engine.updateContent = async rail => {
    if (rail.name === 'Extras') { laterProcessed = true; return; }
    return update(rail);
  };
  await engine.run({ name: 'Week', rails: [sheet.rails[0], { name: 'Extras', position: 2, titles: ['Another title'] }] }, true);
  assert.equal(laterProcessed, true); assert.equal(engine.unresolved.length, 1);
  assert.match(engine.logs.join('\n'), /Title.*Catalog temporarily unavailable/);
  assert.equal(adapter.calls.includes('publishCarousel'), false);
});
test('retry from an editor returns to Overview instead of waiting on the wrong page', async () => {
  const adapter = fakeAdapter(), originalCall = adapter.call;
  let inEditor = true;
  adapter.call = async (command, input) => {
    if (command === 'overview') { inEditor = false; return {}; }
    const result = await originalCall(command, input);
    if (command === 'state' && inEditor) return { ...result, overview: false, editor: true, navigationReady: true };
    return result;
  };
  const engine = new Engine(adapter);
  await engine.run(sheet, false);
  assert.equal(inEditor, false); assert.ok(engine.staged);
});

function contentEngine({ chooseFailure = false, unsafeAddition = false } = {}) {
  const original = ['Keep', 'Found B', 'Keep', 'Found A', 'Tail']; let pins = original.slice();
  const writes = [];
  const adapter = { async call(command, input) {
    if (command === 'pins') return { pins: pins.slice() };
    if (command === 'search') return { matches: input.title === 'New Title' ? [{ title: 'New Title' }] : [] };
    if (command === 'choose') {
      if (unsafeAddition) { pins.push(input.title, 'Unexpected'); throw Error('Interrupted'); }
      if (chooseFailure) throw Error('No addition occurred');
      pins.push(input.title); return { pins: pins.slice() };
    }
    if (command === 'moveTitle') { const from = pins.indexOf(input.title); pins.splice(input.position, 0, pins.splice(from, 1)[0]); }
    if (command === 'titleCheck') return { pins: pins.slice(), ok: JSON.stringify(pins.slice(0, input.targets.length)) === JSON.stringify(input.targets) && preservesExtras(input.before, pins, input.targets) };
    if (command === 'state') return { navigationReady: true };
    if (command === 'schedule') writes.push(pins.slice());
    return {};
  } };
  const engine = new Engine(adapter); engine.open = async () => {}; engine.overview = async () => {}; engine.wait = async () => ({}); engine.pause = async () => {};
  return { engine, original, writes, pins: () => pins.slice() };
}
for (const missingPosition of [0, 1, 3]) test(`missing title at slot ${missingPosition + 1} still saves other matched titles`, async () => {
  const run = contentEngine(); const titles = ['Found A', 'New Title', 'Found B']; titles.splice(missingPosition, 0, 'Missing');
  await run.engine.updateContent({ name: 'Synthetic', titles, position: 4 });
  assert.equal(run.writes.length, 1); assert.equal(run.engine.statuses.Synthetic, 'Saved (partial)');
  assert.deepEqual(run.pins().slice(0, 3), ['Found A', 'New Title', 'Found B']);
  assert.ok(preservesExtras(run.original, run.pins(), ['Found A', 'New Title', 'Found B']));
  assert.equal(run.engine.unresolved.length, 1);
});
test('failed addition with unchanged inventory skips that title and saves other matches', async () => {
  const run = contentEngine({ chooseFailure: true });
  await run.engine.updateContent({ name: 'Synthetic', titles: ['Found A', 'New Title', 'Found B'], position: 4 });
  assert.equal(run.writes.length, 1); assert.deepEqual(run.pins().slice(0, 2), ['Found A', 'Found B']);
  assert.equal(run.engine.unresolved.length, 1);
});
test('uncertain partial mutation never saves the carousel', async () => {
  const run = contentEngine({ unsafeAddition: true });
  await assert.rejects(run.engine.updateContent({ name: 'Synthetic', titles: ['New Title'], position: 4 }), /uncertain title addition/);
  assert.equal(run.writes.length, 0);
});
test('no matches leaves the whole carousel unchanged without reporting a save', async () => {
  const run = contentEngine(); await run.engine.updateContent({ name: 'Synthetic', titles: ['Missing'], position: 4 });
  assert.deepEqual(run.pins(), run.original); assert.equal(run.writes.length, 0); assert.equal(run.engine.statuses.Synthetic, 'No matched titles');
});
test('unknown publish outcome does not reload or submit another publish', async () => {
  const adapter = fakeAdapter(), original = adapter.call; let reloads = 0;
  adapter.reload = async () => { reloads++; };
  adapter.call = async (command, input) => { if (command === 'publishStorefront') { adapter.calls.push(command); throw Error('Unknown outcome'); } return original(command, input); };
  const engine = new Engine(adapter); await engine.run(sheet, false);
  await assert.rejects(engine.publish(), /Unknown outcome/);
  assert.equal(reloads, 0); assert.equal(adapter.calls.filter(c => c === 'publishStorefront').length, 1); assert.equal(engine.staged, null);
});
test('stale first reload is rechecked without publishing again', async () => {
  const adapter = fakeAdapter(), original = adapter.call; let observations = 0;
  adapter.call = async (command, input) => { if (command === 'verifySavedOrder' && ++observations === 1) throw Error('Stale read'); return original(command, input); };
  const engine = new Engine(adapter); await engine.run(sheet, false); await engine.publish();
  assert.equal(engine.status, 'Published and verified'); assert.equal(observations, 2);
  assert.equal(adapter.calls.filter(c => c === 'publishStorefront').length, 1);
});
