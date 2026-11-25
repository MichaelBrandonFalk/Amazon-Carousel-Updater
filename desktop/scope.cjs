const { normalize } = require('./workbook.cjs');
function selectRails(rails, scope = { mode: 'all' }) {
  if (scope.mode === 'all') return rails;
  if (scope.mode === 'one') {
    const matches = rails.filter(r => normalize(r.name) === normalize(scope.name || ''));
    if (matches.length !== 1) throw Error('Choose one carousel from the worksheet.');
    return matches;
  }
  if (scope.mode !== 'positions') throw Error('Choose a valid update scope.');
  const tokens = String(scope.positions || '').replace(/[–—]/g, '-').split(',').map(s => s.trim());
  if (!tokens.length || tokens.some(s => !/^\d+(?:\s*-\s*\d+)?$/.test(s))) throw Error('Enter Column A positions such as 5-10 or 5,7,10.');
  const selected = new Set();
  for (const token of tokens) {
    const [low, end] = token.split('-').map(Number), high = end ?? low;
    if (!Number.isSafeInteger(low) || !Number.isSafeInteger(high) || low < 1 || high < low) throw Error('Use positive positions and ascending ranges.');
    const matches = rails.filter(r => r.position >= low && r.position <= high);
    if (!matches.length) throw Error(`No worksheet carousel matches position ${token}.`);
    matches.forEach(r => selected.add(r));
  }
  return rails.filter(r => selected.has(r));
}
function selectedOrder(existing, rails) {
  const keys = new Set(rails.map(r => normalize(r.name)));
  for (const rail of rails) {
    if (rail.position < 2 || rail.position > existing.length || existing.filter(n => normalize(n) === normalize(rail.name)).length !== 1) throw Error(`Cannot safely place ${rail.name} at position ${rail.position}.`);
  }
  const result = existing.filter(name => !keys.has(normalize(name)));
  for (const rail of [...rails].sort((a, b) => a.position - b.position)) result.splice(rail.position - 1, 0, existing.find(n => normalize(n) === normalize(rail.name)));
  return result;
}
module.exports = { selectRails, selectedOrder };
