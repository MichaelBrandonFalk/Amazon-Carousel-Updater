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
  return { calls, verificationPause: 0, async freshOverview() { calls.push('freshOverview'); order = saved.slice(); }, async reload() { order = saved.slice(); }, async call(command, input) {
    calls.push(command);
    if (command === 'state') return { overview: true, navigationReady: true, order: order.slice(), publishEnabled: JSON.stringify(order) !== JSON.stringify(saved) };
    if (command === 'order' || command === 'overviewSnapshot') return { order: order.slice() };
    if (command === 'moveRail') { const source = order.indexOf(input.name), next = source + (input.direction === 'down' ? 1 : -1); [order[source], order[next]] = [order[next], order[source]]; return { order: order.slice() }; }
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
  assert.deepEqual(adapter.calls.filter(c => !['resume', 'state', 'order', 'moveRail', 'overviewSnapshot', 'freshOverview'].includes(c)), []);
  await engine.publish(); assert.equal(engine.status, 'Published and verified');
  await engine.run(sheet, false); assert.equal(engine.staged, null);
});
test('a publish toast without persisted order is a failure', async () => {
  const engine = new Engine(fakeAdapter(true)); await engine.run(sheet, false);
  await assert.rejects(engine.publish(), /differs after reload/);
  assert.equal(engine.status, 'Needs attention'); assert.equal(engine.staged, null);
});
test('missing rails are logged and remaining identified carousels still run', async () => {
  const adapter = fakeAdapter(), engine = new Engine(adapter);
  const processed = []; engine.updateContent = async rail => processed.push(rail.name);
  await engine.run({ name: 'Week', rails: [{ name: 'Missing', position: 2, titles: ['Title'] }, ...sheet.rails] }, true);
  assert.deepEqual(processed, ['Romance']); assert.equal(engine.statuses.Missing, 'Skipped: missing carousel'); assert.equal(engine.busy, false);
  assert.deepEqual(engine.staged, [reservedRail, 'Romance']); assert.equal(engine.entries.filter(e => e.carousel === 'Missing').length, 1);
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

function contentEngine({ chooseFailure = false, unsafeAddition = false, seasonFallback = false } = {}) {
  const original = ['Keep', 'Found B', 'Keep', 'Found A', 'Tail']; let pins = original.slice();
  const writes = [], positions = [];
  const adapter = { async call(command, input) {
    if (command === 'pins') return { pins: pins.slice() };
    if (command === 'search') return { matchType: seasonFallback ? 'season1' : 'exact', matches: input.title === 'New Title' ? [{ title: seasonFallback ? 'New Title - Season 1' : 'New Title' }] : [] };
    if (command === 'choose') {
      if (unsafeAddition) { pins.push(input.title, 'Unexpected'); throw Error('Interrupted'); }
      if (chooseFailure) throw Error('No addition occurred');
      pins.push(input.title); return { pins: pins.slice() };
    }
    if (command === 'moveTitle') { const from = pins.indexOf(input.title); pins.splice(input.position, 0, pins.splice(from, 1)[0]); }
    if (command === 'titleCheck') return { pins: pins.slice(), ok: JSON.stringify(pins.slice(0, input.targets.length)) === JSON.stringify(input.targets) && preservesExtras(input.before, pins, input.targets) };
    if (command === 'state') return { navigationReady: true };
    if (command === 'order') return { order: [reservedRail, 'Other rail', 'Synthetic'] };
    if (command === 'schedule') { positions.push(input.position); writes.push(pins.slice()); }
    return {};
  } };
  const engine = new Engine(adapter); engine.open = async () => {}; engine.overview = async () => {}; engine.wait = async () => ({}); engine.pause = async () => {};
  return { engine, original, writes, positions, pins: () => pins.slice() };
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
test('Season 1 fallback records the requested and selected title separately from skips', async () => {
  const run = contentEngine({ seasonFallback: true });
  await run.engine.updateContent({ name: 'Synthetic', titles: ['New Title', 'Missing', 'Found A'], position: 4 });
  assert.deepEqual(run.pins().slice(0, 2), ['New Title - Season 1', 'Found A']);
  assert.deepEqual(run.engine.entries.map(e => [e.kind, e.title]), [['season1', 'New Title'], ['not_added', 'Missing']]);
  assert.equal(run.engine.entries[0].resolved, 'New Title - Season 1'); assert.equal(run.engine.entries[1].position, 4);
  assert.equal(run.engine.statuses.Synthetic, 'Saved (partial)');
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
for (const failure of ['verifyTitleMove: Complete list did not verify', 'waitTitleStep: Slate did not reach the expected page state']) test(`${failure}: recover draft and continue without retrying the failed carousel`, async () => {
  const adapter = fakeAdapter(), engine = new Engine(adapter), processed = [];
  engine.updateContent = async rail => { engine.phase = 'reorder'; engine.activeTitle = 'Synthetic title'; processed.push(rail.name); if (rail.name === 'Romance') throw Error(failure); engine.statuses[rail.name] = 'Saved'; };
  await engine.run({ name: 'Week', rails: [sheet.rails[0], { name: 'Extras', position: 2, titles: ['Other'] }] }, true);
  assert.deepEqual(processed, ['Romance', 'Extras']); assert.equal(engine.statuses.Romance, 'Not saved: error');
  assert.equal(adapter.calls.filter(c => c === 'freshOverview').length, 2); assert.equal(engine.entries[0].title, 'Synthetic title');
  assert.equal(adapter.calls.includes('publishCarousel'), false); assert.match(engine.status, /carousel issues/);
});
test('a failure after save submission is reported as unverified, never retried, and later rails continue', async () => {
  const engine = new Engine(fakeAdapter()), processed = [];
  engine.updateContent = async rail => { processed.push(rail.name); engine.phase = 'schedule'; if (rail.name === 'Romance') throw Error('Connection interrupted'); };
  await engine.run({ name: 'Week', rails: [sheet.rails[0], { name: 'Extras', position: 2, titles: ['Other'] }] }, true);
  assert.deepEqual(processed, ['Romance', 'Extras']); assert.equal(engine.statuses.Romance, 'Save not verified'); assert.match(engine.entries[0].reason, /will not be resubmitted/);
});
test('failed recovery stops the run instead of touching another carousel in a dirty browser', async () => {
  const adapter = fakeAdapter(), engine = new Engine(adapter); let resets = 0, processed = [];
  adapter.freshOverview = async () => { if (++resets > 1) throw Error('Sign-in required'); };
  engine.updateContent = async rail => { processed.push(rail.name); engine.phase = 'reorder'; throw Error('Bad drag'); };
  await assert.rejects(engine.run({ name: 'Week', rails: [sheet.rails[0], { name: 'Extras', titles: ['Other'] }] }, true), /Sign-in required/);
  assert.deepEqual(processed, ['Romance']); assert.equal(engine.staged, null);
});
test('Stop during a failed carousel is never swallowed by continuation', async () => {
  const engine = new Engine(fakeAdapter()), processed = [];
  engine.updateContent = async rail => { processed.push(rail.name); engine.cancelled = true; throw Error('Interrupted'); };
  await assert.rejects(engine.run({ name: 'Week', rails: [sheet.rails[0], { name: 'Extras', titles: ['Other'] }] }, true), /Stopped/);
  assert.deepEqual(processed, ['Romance']); assert.equal(engine.status, 'Stopped');
});
test('ambiguous carousels are skipped without selecting either copy', () => {
  const engine = new Engine(fakeAdapter());
  const selected = engine.verifyNames([{ name: 'Romance', position: 2 }, { name: 'Extras', position: 3 }], [reservedRail, 'Romance', 'Romance', 'Extras']);
  assert.deepEqual(selected.map(r => r.name), ['Extras']); assert.match(engine.statuses.Romance, /ambiguous/);
  assert.throws(() => engine.verifyNames([], ['Romance', reservedRail]), /Top 10/);
});
test('targeted titles-only run processes only selected carousels and does not stage a global reorder', async () => {
  const adapter = fakeAdapter(), engine = new Engine(adapter), processed = [];
  engine.updateContent = async rail => processed.push(rail.name);
  await engine.run({ name: 'Week', rails: [{ name: 'Romance', position: 8, titles: ['A'] }, { name: 'Extras', position: 3, titles: ['B'] }] }, true, { scope: { mode: 'positions', positions: '8' } });
  assert.deepEqual(processed, ['Romance']); assert.equal(engine.statuses.Extras, 'Not selected'); assert.equal(engine.staged, null); assert.equal(engine.preservePositions, true);
  assert.equal(adapter.calls.includes('moveRail'), false);
});
test('targeted order-only run moves selected rails while retaining unselected relative order', async () => {
  const engine = new Engine(fakeAdapter());
  await engine.run({ name: 'Week', rails: [{ name: 'Romance', position: 2, titles: [] }, { name: 'Extras', position: 3, titles: [] }] }, false, { scope: { mode: 'one', name: 'Romance' } });
  assert.deepEqual(engine.staged, [reservedRail, 'Romance', 'Extras']);
});
test('targeted title save retains the actual position instead of using a different Column A value', async () => {
  const run = contentEngine(); run.engine.preservePositions = true;
  await run.engine.updateContent({ name: 'Synthetic', position: 8, titles: ['Found A'] });
  assert.deepEqual(run.positions, [3]); assert.equal(run.writes.length, 1);
});
test('selected-only downward moves preserve Top 10 and unselected relative order', async () => {
  const engine = new Engine(fakeAdapter());
  await engine.run({ name: 'Week', rails: [{ name: 'Extras', position: 3, titles: [] }] }, false, { scope: { mode: 'one', name: 'Extras' } });
  assert.deepEqual(engine.staged, [reservedRail, 'Romance', 'Extras']);
});
