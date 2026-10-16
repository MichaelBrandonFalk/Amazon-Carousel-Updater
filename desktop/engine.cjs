const { normalize } = require('./workbook.cjs');
const reservedRail = 'Top 10 in the U.S.';
const aliases = { whc: 'When Hope Calls', iggyandmrkrik: 'Iggy and Mr. Kirk', acindereallachristmasball: 'A Cinderella Christmas Ball', watchmaker: 'Ainsley McGregor Mysteries: A Case for the Watchmaker', athousandtomorrows: 'Karen Kingsburys A Thousand Tomorrows' };
const skipContent = rail => rail.dynamic || !rail.titles.length || normalize(rail.name) === 'leavingsoon';
function resolveExisting(target, pins) {
  const canonical = aliases[normalize(target)] || target;
  return pins.find(pin => normalize(pin) === normalize(canonical)) || pins.find(pin => normalize(pin.replace(/[\s:,-]+season\s*\d+.*$/i, '')) === normalize(canonical));
}
function preservesExtras(before, after, targets) {
  const counts = new Map();
  after.forEach(title => counts.set(title, (counts.get(title) || 0) + 1));
  for (const title of before) { counts.set(title, (counts.get(title) || 0) - 1); if (counts.get(title) < 0) return false; }
  return JSON.stringify(before.filter(t => !targets.includes(t))) === JSON.stringify(after.filter(t => !targets.includes(t)));
}
const sameOrder = (a, b) => a.length === b.length && a.every((name, i) => normalize(name) === normalize(b[i]));

class Engine {
  constructor(adapter, changed = () => {}) {
    this.adapter = adapter; this.changed = changed; this.busy = false; this.cancelled = false;
    this.logs = []; this.statuses = {}; this.completed = 0; this.unresolved = []; this.staged = null; this.progress = 0; this.status = 'Select your weekly workbook';
  }
  emit() { this.changed(); }
  log(message) { this.logs.push(message); this.emit(); }
  reset() { this.statuses = {}; this.completed = 0; this.unresolved = []; this.staged = null; this.progress = 0; this.emit(); }
  check() { if (this.cancelled) throw Error('Stopped. Saves already submitted to Amazon remain applied.'); }
  async pause(ms) { this.check(); await new Promise(resolve => setTimeout(resolve, ms)); this.check(); }
  async call(command, input = {}) { this.check(); return this.adapter.call(command, input); }
  async wait(flag, timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      this.check();
      try { const state = await this.call('state'); if (state[flag]) return state; } catch (error) { if (this.cancelled) throw error; }
      await this.pause(250);
    }
    throw Error(`Slate did not finish loading ${flag}. Check the browser and retry.`);
  }
  async stop() {
    this.cancelled = true; this.status = 'Stopping after current action'; this.emit();
    await this.adapter.call('cancel').catch(() => {});
  }
  verifyNames(rails, existing) {
    for (const name of [reservedRail, ...rails.map(r => r.name)]) {
      if (existing.filter(n => normalize(n) === normalize(name)).length !== 1) throw Error(`Cannot match one existing carousel named ${name}. No content has been changed.`);
    }
  }
  async open(rail) {
    await this.wait('overview'); await this.call('open', { name: rail.name });
    const state = await this.wait('editor');
    if (normalize(state.editorName) !== normalize(rail.name)) throw Error(`Opened ${state.editorName}, expected ${rail.name}.`);
    await this.call('resume');
  }
  async overview() { if ((await this.call('state')).overview) return; await this.call('overview'); await this.wait('overview'); }
  async updateContent(rail) {
    this.statuses[rail.name] = 'Checking'; this.emit(); await this.open(rail);
    const before = (await this.call('pins')).pins, targets = [], additions = [];
    for (const title of rail.titles) {
      const existing = resolveExisting(title, before);
      if (existing) {
        targets.push(existing);
        if (normalize(existing) !== normalize(title)) this.log(`${rail.name}: ${title} -> ${existing}`);
      } else {
        const result = await this.call('search', { title });
        if (result.matches.length !== 1) {
          const message = `${rail.name}: no unique catalog match for ${title}; carousel left unchanged.`;
          this.unresolved.push(message); this.statuses[rail.name] = 'Unresolved'; this.log(message);
          await this.call('clearSearch'); await this.overview(); return;
        }
        targets.push(result.matches[0].title); additions.push(result.matches[0].title);
      }
    }
    if (JSON.stringify(before.slice(0, targets.length)) === JSON.stringify(targets)) {
      this.statuses[rail.name] = 'Already correct'; this.log(`${rail.name}: already correct.`);
      await this.call('clearSearch'); await this.overview(); return;
    }
    if (new Set(targets.map(normalize)).size !== targets.length) throw Error(`Two workbook titles resolve to the same catalog title on ${rail.name}.`);
    this.statuses[rail.name] = 'Updating'; this.emit();
    for (const title of additions) {
      if ((await this.call('search', { title })).matches.length !== 1) throw Error(`Search changed for ${title}. No carousel was saved.`);
      await this.call('choose', { title }); this.log(`${rail.name}: added ${title}.`);
    }
    await this.call('clearSearch');
    for (const [position, title] of targets.entries()) await this.call('moveTitle', { title, position });
    const verify = pins => JSON.stringify(pins.slice(0, targets.length)) === JSON.stringify(targets) && preservesExtras(before, pins, targets);
    if (!verify((await this.call('pins')).pins)) throw Error(`Title order or preservation failed on ${rail.name}. No carousel was saved.`);
    await this.call('publishCarousel'); await this.wait('dialog'); await this.call('schedule', { position: rail.position });
    await this.wait('overview', 60000); await this.open(rail);
    if (!verify((await this.call('pins')).pins)) throw Error(`Saved titles did not verify on ${rail.name}. Check Slate.`);
    this.completed++; this.statuses[rail.name] = 'Saved'; this.log(`${rail.name}: saved and verified (Column A position ${rail.position}).`);
    await this.overview();
  }
  async stage(target) {
    let order = (await this.call('order')).order;
    if (normalize(order[0]) !== normalize(reservedRail)) throw Error('Top 10 is not first. Place it first manually before running.');
    for (let position = 1; position < target.length; position++) {
      const name = target[position]; let moves = 0;
      while (order.findIndex(n => normalize(n) === normalize(name)) > position) {
        if (++moves > order.length) throw Error(`Reorder did not converge for ${name}.`);
        order = (await this.call('moveRail', { name, position })).order;
      }
      if (normalize(order[position] || '') !== normalize(name)) throw Error(`Could not place ${name} in the expected storefront slot.`);
    }
    this.log('Storefront order staged. Extra rails preserved after the sheet rails.');
  }
  async run(sheet, full) {
    if (this.busy) throw Error('An update is already running.');
    this.busy = true; this.cancelled = false; this.reset();
    try {
      await this.call('resume');
      this.verifyNames(sheet.rails, (await this.wait('overview', 10000)).order);
      if (full) for (const [index, rail] of sheet.rails.entries()) {
        this.check(); this.status = `${index + 1}/${sheet.rails.length}: ${rail.name}`; this.emit();
        if (skipContent(rail)) { this.statuses[rail.name] = 'Order only'; this.log(`${rail.name}: content skipped.`); }
        else await this.updateContent(rail);
        this.progress = (index + 1) / sheet.rails.length * 85; this.emit();
      }
      await this.overview(); const target = [reservedRail, ...sheet.rails.map(r => r.name)]; await this.stage(target);
      this.staged = (await this.call('state')).publishEnabled ? target : null;
      this.progress = 100; this.status = this.staged ? 'Order verified - ready to publish' : 'Complete - order already matches';
      if (this.unresolved.length) this.status += ` - ${this.unresolved.length} unresolved`;
      this.log(this.staged ? 'Click Publish Order to apply the verified draft.' : 'No storefront order changes needed.');
    } catch (error) { this.staged = null; this.status = this.cancelled ? 'Stopped' : 'Needs attention'; this.log(error.message); throw error; }
    finally { this.busy = false; this.emit(); }
  }
  async publish() {
    if (this.busy || !this.staged) throw Error('Run the update before publishing.');
    const target = this.staged.slice(); this.busy = true; this.cancelled = false; this.emit();
    try {
      if (!sameOrder((await this.call('order')).order.slice(0, target.length), target)) throw Error('Order changed since verification. Run the update again.');
      await this.call('publishStorefront'); this.status = 'Publishing - checking saved order'; this.emit();
      await this.pause(this.adapter.publishDelay ?? 8000); await this.adapter.reload();
      const saved = await this.wait('overview');
      if (!sameOrder(saved.order.slice(0, target.length), target)) throw Error('Saved storefront order differs after reload. Publish did not verify.');
      this.status = 'Published and verified'; this.log('Published storefront order verified after reload.');
    } catch (error) { this.status = 'Needs attention'; this.log(error.message); throw error; }
    finally { this.staged = null; this.busy = false; this.emit(); }
  }
}
module.exports = { Engine, reservedRail, resolveExisting, preservesExtras, sameOrder, skipContent };
