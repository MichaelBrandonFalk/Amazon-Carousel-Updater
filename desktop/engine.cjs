const { normalize } = require('./workbook.cjs');
const { selectRails, selectedOrder } = require('./scope.cjs');
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
    this.logs = []; this.entries = []; this.activeCarousel = ''; this.phase = ''; this.statuses = {}; this.completed = 0; this.unresolved = []; this.staged = null; this.progress = 0; this.status = 'Select your weekly workbook';
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
    if (existing.filter(n => normalize(n) === normalize(reservedRail)).length !== 1 || normalize(existing[0]) !== normalize(reservedRail)) throw Error('Cannot verify Top 10 uniquely at position 1. No content has been changed.');
    return rails.filter(rail => {
      const count = existing.filter(n => normalize(n) === normalize(rail.name)).length;
      if (count === 1) return true;
      const status = count ? 'Skipped: ambiguous carousel' : 'Skipped: missing carousel';
      if (this.statuses[rail.name] !== status) {
        this.statuses[rail.name] = status;
        const reason = count ? 'Multiple existing carousels match this name. Carousel skipped; remaining carousels will continue.' : 'No existing carousel matches this name. Carousel skipped; remaining carousels will continue.';
        this.entries.push({ kind: 'issue', carousel: rail.name, position: rail.position, reason }); this.log(`${rail.name}: ${reason}`);
      }
      return false;
    });
  }
  async availableRails(rails) {
    const snapshot = await this.call('overviewSnapshot', { names: [reservedRail, ...rails.map(r => r.name)] });
    return this.verifyNames(rails, snapshot.order);
  }
  async recoverCarousel(rail, error) {
    this.check();
    const uncertain = ['publish', 'schedule', 'verify saved'].includes(this.phase);
    const completed = this.phase === 'complete';
    this.statuses[rail.name] = completed ? 'Saved; follow-up issue' : (uncertain ? 'Save not verified' : 'Not saved: error');
    const reason = `${error.message} ${completed ? 'Content was saved and verified; returning to a fresh Overview.' : (uncertain ? 'Save outcome not verified; it will not be resubmitted.' : 'This carousel was not saved.')} Continuing with remaining carousels.`;
    this.entries.push({ kind: 'issue', carousel: rail.name, position: rail.position, title: this.activeTitle || '', reason }); this.log(`${rail.name}: ${reason}`);
    // Reload before the next rail, never carrying a failed drag or draft forward.
    if (!this.adapter.freshOverview) throw Error('Cannot safely discard the failed carousel draft. Stopped before further changes.');
    await this.adapter.freshOverview(); await this.wait('overview');
    const state = await this.call('state');
    if (state.dialog) throw Error('Unable to recover a clean Overview. Stopped before further changes.');
    this.phase = '';
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
    this.phase = 'open'; this.activeTitle = '';
    const orderBefore = this.preservePositions ? (await this.call('order')).order : null;
    const savePosition = orderBefore ? orderBefore.findIndex(n => normalize(n) === normalize(rail.name)) + 1 : rail.position;
    if (savePosition < 2 && this.preservePositions) throw Error('Cannot identify the current carousel position.');
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
    this.phase = 'reorder';
    for (const [position, title] of targets.entries()) { this.activeTitle = title; await this.call('moveTitle', { title, position }); }
    const validation = { before, targets, additions };
    const checked = await this.call('titleCheck', validation);
    if (!checked.ok) throw Error(`${rail.name}: ${checked.detail}. No carousel was saved.`);
    if (checked.pins.length < 5) {
      this.statuses[rail.name] = 'Too few titles'; this.log(`${rail.name}: fewer than five total titles; carousel not saved.`);
      this.entries.push({ kind: 'issue', carousel: rail.name, reason: 'Fewer than five total titles; carousel not saved.' });
      await this.overview(); return;
    }
    this.phase = 'publish'; await this.call('publishCarousel'); await this.wait('dialog');
    this.phase = 'schedule'; await this.call('schedule', { position: savePosition });
    await this.wait('navigationReady', 60000); await this.pause(800); await this.overview(); await this.open(rail);
    this.phase = 'verify saved'; const saved = await this.call('titleCheck', validation);
    if (!saved.ok) throw Error(`Saved titles did not verify on ${rail.name}: ${saved.detail}. Check Slate.`);
    this.completed++; this.statuses[rail.name] = partial ? 'Saved (partial)' : 'Saved'; this.log(`${rail.name}: saved and verified ${targets.length}/${rail.titles.length} matched titles (storefront position ${savePosition}, Column A ${rail.position}); all existing titles preserved.`);
    this.phase = 'complete'; await this.overview();
    if (orderBefore && !sameOrder((await this.call('order')).order, orderBefore)) throw Error('Content saved, but storefront order changed during the targeted update. Review it before publishing.');
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
  async stageSelected(rails) {
    let order = (await this.call('order')).order;
    const expected = selectedOrder(order, rails);
    if (sameOrder(order, expected)) return expected;
    for (const rail of rails) {
      let moves = 0;
      while (order.findIndex(n => normalize(n) === normalize(rail.name)) < order.length - 1) {
        if (++moves > order.length) throw Error('Selected-carousel reorder did not converge.');
        order = (await this.call('moveRail', { name: rail.name, position: order.length - 1, direction: 'down' })).order;
      }
    }
    for (const rail of [...rails].sort((a, b) => a.position - b.position)) {
      let moves = 0;
      while (order.findIndex(n => normalize(n) === normalize(rail.name)) > rail.position - 1) {
        if (++moves > order.length) throw Error('Selected-carousel reorder did not converge.');
        order = (await this.call('moveRail', { name: rail.name, position: rail.position - 1 })).order;
      }
    }
    if (!sameOrder(order, expected)) throw Error('Selected-carousel order did not verify. Nothing was published.');
    return expected;
  }
  async run(sheet, full, options = {}) {
    if (this.busy) throw Error('An update is already running.');
    const selected = selectRails(sheet.rails, options.scope);
    const targeted = options.scope && options.scope.mode !== 'all';
    this.preservePositions = !!targeted && full && options.moveSelected === false;
    this.runScope = targeted ? (options.scope.mode === 'one' ? `Carousel: ${selected[0].name}` : `Column A: ${options.scope.positions}`) : 'All carousels';
    this.busy = true; this.cancelled = false; this.logs = []; this.reset();
    for (const rail of sheet.rails) if (!selected.includes(rail)) this.statuses[rail.name] = 'Not selected';
    try {
      await this.call('resume');
      if (this.adapter.freshOverview) await this.adapter.freshOverview();
      await this.overview();
      const available = await this.availableRails(selected);
      if (full) for (const [index, rail] of selected.entries()) {
        this.check(); this.activeCarousel = rail.name; this.status = `${index + 1}/${selected.length}: ${rail.name}`; this.emit();
        if (!available.includes(rail)) { /* Recorded missing/ambiguous rail; leave it untouched. */ }
        else if (skipContent(rail)) { this.statuses[rail.name] = 'Order only'; this.log(`${rail.name}: content skipped.`); }
        else { try { await this.updateContent(rail); } catch (error) { await this.recoverCarousel(rail, error); } }
        this.progress = (index + 1) / selected.length * 85; this.emit();
      }
      await this.overview(); const remaining = await this.availableRails(available);
      let target;
      if (this.preservePositions) { target = null; this.staged = null; }
      else {
        if (targeted) target = await this.stageSelected(remaining);
        else { target = [reservedRail, ...remaining.map(r => r.name)]; await this.stage(target); }
        this.staged = (await this.call('state')).publishEnabled ? target : null;
      }
      this.progress = 100; this.status = this.preservePositions ? 'Selected content updates complete - storefront order preserved' : (this.staged ? 'Order verified - ready to publish' : 'Complete - order already matches');
      const issues = this.entries.filter(e => e.kind === 'issue').length;
      if (issues) this.status += ` - ${issues} carousel issues`;
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
