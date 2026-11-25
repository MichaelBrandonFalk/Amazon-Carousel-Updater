const { test } = require('node:test');
const assert = require('node:assert/strict');
const { selectRails, selectedOrder } = require('../scope.cjs');
const rails = Array.from({ length: 12 }, (_, i) => ({ position: i + 2, name: `Rail ${i + 2}` }));
test('select Column A ranges, lists, single positions, and one carousel', () => {
  assert.deepEqual(selectRails(rails, { mode: 'positions', positions: '5-10' }).map(r => r.position), [5,6,7,8,9,10]);
  assert.deepEqual(selectRails(rails, { mode: 'positions', positions: '5,7-8,7' }).map(r => r.position), [5,7,8]);
  assert.deepEqual(selectRails(rails, { mode: 'positions', positions: '5' }).map(r => r.position), [5]);
  assert.equal(selectRails(rails, { mode: 'one', name: 'Rail 7' })[0].position, 7);
  for (const positions of ['', '0', '8-5', '5.5', '99', '5,99', '5;8', '1-999999999999999999999']) assert.throws(() => selectRails(rails, { mode: 'positions', positions }));
});
test('selected order plan preserves all unselected rails, duplicates, and Top 10', () => {
  const before = ['Top 10 in the U.S.','B','Other','Other','A','Tail'];
  assert.deepEqual(selectedOrder(before, [{ name: 'A', position: 3 }, { name: 'B', position: 5 }]), ['Top 10 in the U.S.','Other','A','Other','B','Tail']);
  assert.throws(() => selectedOrder(before, [{ name: 'A', position: 1 }]));
});
