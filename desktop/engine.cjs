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
    this.logs = []; this.entries = []; this.activeCarousel = ''; this.statuses = {}; this.completed = 0; this.unresolved = []; this.staged = null; this.progress = 0; this.status = 'Select your weekly workbook';
  }
  emit() { this.changed(); }
  log(message) { this.logs.push(message); this.emit(); }
  reset() { this.entries = []; this.activeCarousel = ''; this.statuses = {}; this.completed = 0; this.unresolved = []; this.staged = null; this.progress = 0; this.emit(); }
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
    const state = await this.call('waitEditor', { name: rail.name });
    if (normalize(state.editorName) !== normalize(rail.name)) throw Error(`Opened ${state.editorName}, expected ${rail.name}.`);
    await this.call('resume');
  }
  async overview() {
    if ((await this.call('state')).dialog) throw Error('A Slate dialog is still open. Finish or cancel it before retrying.');
    const state = await this.wait('navigationReady', 60000);
    if (state.overview) return;
    await this.call('overview'); await this.wait('overview');
  }
  async unresolvedTitle(rail, title, detail = '') {
    const message = `${rail.name}: skipped title ${title}${detail ? ' (' + detail + ')' : ''}; continuing with other titles in this carousel.`;
    this.unresolved.push(message); this.log(message);
    this.entries.push({ kind: 'not_added', position: rail.position, carousel: rail.name, title, reason: detail || 'No unique match' });
    try { await this.call('clearSearch'); } catch { this.check(); }
  }
  async updateContent(rail) {
    this.statuses[rail.name] = 'Checking'; this.emit(); await this.open(rail);
    const before = (await this.call('pins')).pins, targets = [], additions = [];
    let working = before.slice(); const warningStart = this.unresolved.length;
    for (const title of rail.titles) {
      const existing = resolveExisting(title, working);
      if (existing) {
        if (targets.includes(existing)) { await this.unresolvedTitle(rail, title, 'duplicates an already matched title'); continue; }
        targets.push(existing);
        if (normalize(existing) !== normalize(title)) this.log(`${rail.name}: ${title} -> ${existing}`);
      } else {
        let result;
        try { result = await this.call('search', { title }); }
        catch (error) { this.check(); await this.unresolvedTitle(rail, title, error.message); continue; }
        if (result.matches.length !== 1) {
          await this.unresolvedTitle(rail, title, result.reason || 'no unique catalog match'); continue;
        }
        const match = result.matches[0].title;
        if (targets.includes(match)) { await this.unresolvedTitle(rail, title, 'duplicates an already matched title'); continue; }
        try { await this.call('choose', { title: match }); }
        catch (error) {
          this.check();
          const observed = (await this.call('pins')).pins;
          if (JSON.stringify(observed) === JSON.stringify(working)) { await this.unresolvedTitle(rail, title, error.message); continue; }
          if (JSON.stringify(observed) !== JSON.stringify([...working, match])) throw Error(`${rail.name}: uncertain title addition; no carousel was saved.`);
        }
        const observed = (await this.call('pins')).pins;
        if (JSON.stringify(observed) !== JSON.stringify([...working, match])) throw Error(`${rail.name}: added title inventory did not verify; no carousel was saved.`);
        working = observed; targets.push(match); additions.push(match);
        this.log(`${rail.name}: added ${match}.`);
        if (result.matchType === 'season1') {
          this.entries.push({ kind: 'season1', position: rail.position, carousel: rail.name, title, resolved: match });
          this.log(`${rail.name}: Season 1 fallback ${title} -> ${match}.`);
        }
      }
    }
    const partial = this.unresolved.length > warningStart;
    if (!targets.length) {
      this.statuses[rail.name] = 'No matched titles'; this.log(`${rail.name}: no titles matched; carousel unchanged.`);
      await this.call('clearSearch'); await this.overview(); return;
    }
    if (JSON.stringify(before.slice(0, targets.length)) === JSON.stringify(targets)) {
      this.statuses[rail.name] = partial ? 'Correct (partial)' : 'Already correct'; this.log(`${rail.name}: matched titles already correct${partial ? '; unresolved titles reported' : ''}.`);
      await this.call('clearSearch'); await this.overview(); return;
    }
    if (new Set(targets.map(normalize)).size !== targets.length) throw Error(`Two workbook titles resolve to the same catalog title on ${rail.name}.`);
    this.statuses[rail.name] = 'Updating'; this.emit();
    await this.call('clearSearch');
    for (const [position, title] of targets.entries()) await this.call('moveTitle', { title, position });
    const validation = { before, targets, additions };
    const checked = await this.call('titleCheck', validation);
    if (!checked.ok) throw Error(`${rail.name}: ${checked.detail}. No carousel was saved.`);
    if (checked.pins.length < 5) {
      this.statuses[rail.name] = 'Too few titles'; this.log(`${rail.name}: fewer than five total titles; carousel not saved.`);
      this.entries.push({ kind: 'issue', carousel: rail.name, reason: 'Fewer than five total titles; carousel not saved.' });
      await this.overview(); return;
    }
    await this.call('publishCarousel'); await this.wait('dialog'); await this.call('schedule', { position: rail.position });
    await this.wait('navigationReady', 60000); await this.pause(800); await this.overview(); await this.open(rail);
    const saved = await this.call('titleCheck', validation);
    if (!saved.ok) throw Error(`Saved titles did not verify on ${rail.name}: ${saved.detail}. Check Slate.`);
    this.completed++; this.statuses[rail.name] = partial ? 'Saved (partial)' : 'Saved'; this.log(`${rail.name}: saved and verified ${targets.length}/${rail.titles.length} matched titles (Column A position ${rail.position}); all existing titles preserved.`);
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
    this.busy = true; this.cancelled = false; this.logs = []; this.reset();
    try {
      await this.call('resume');
      if (this.adapter.freshOverview) await this.adapter.freshOverview();
      await this.overview();
      this.verifyNames(sheet.rails, (await this.wait('overview', 10000)).order);
      if (full) for (const [index, rail] of sheet.rails.entries()) {
        this.check(); this.activeCarousel = rail.name; this.status = `${index + 1}/${sheet.rails.length}: ${rail.name}`; this.emit();
        if (skipContent(rail)) { this.statuses[rail.name] = 'Order only'; this.log(`${rail.name}: content skipped.`); }
        else await this.updateContent(rail);
        this.progress = (index + 1) / sheet.rails.length * 85; this.emit();
      }
      await this.overview(); const target = [reservedRail, ...sheet.rails.map(r => r.name)]; await this.stage(target);
      this.staged = (await this.call('state')).publishEnabled ? target : null;
      this.progress = 100; this.status = this.staged ? 'Order verified - ready to publish' : 'Complete - order already matches';
      if (this.unresolved.length) this.status += ` - ${this.unresolved.length} unresolved`;
      this.log(this.staged ? 'Click Publish Order to apply the verified draft.' : 'No storefront order changes needed.');
    } catch (error) { this.staged = null; this.status = this.cancelled ? 'Stopped' : 'Needs attention'; this.entries.push({ kind: 'issue', carousel: this.activeCarousel || 'Run', reason: error.message }); this.log(error.message); throw error; }
    finally { this.busy = false; this.emit(); }
  }
  async publish() {
    if (this.busy || !this.staged) throw Error('Run the update before publishing.');
    const target = this.staged.slice(); this.busy = true; this.cancelled = false; this.emit();
    try {
      const expected = (await this.call('order')).order;
      if (!sameOrder(expected.slice(0, target.length), target)) throw Error('Order changed since verification. Run the update again.');
      this.staged = null;
      this.status = 'Publishing - waiting for Slate confirmation'; this.emit();
      await this.call('publishStorefront');
      let verified = false, lastError;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await this.pause(this.adapter.verificationPause ?? 3000);
        await this.adapter.reload(); await this.wait('overview');
        try { await this.call('verifySavedOrder', { expected }); verified = true; break; }
        catch (error) { this.check(); lastError = error; this.log(`Publish verification observation ${attempt + 1}: ${error.message}`); }
      }
      if (!verified) throw Error(`${lastError.message}. No second publish was submitted.`);
      this.status = 'Published and verified'; this.log('Published storefront order verified after reload.');
    } catch (error) { this.status = 'Needs attention'; this.entries.push({ kind: 'issue', carousel: 'Storefront order', reason: error.message }); this.log(error.message); throw error; }
    finally { this.staged = null; this.busy = false; this.emit(); }
  }
}
module.exports = { Engine, reservedRail, resolveExisting, preservesExtras, sameOrder, skipContent };
