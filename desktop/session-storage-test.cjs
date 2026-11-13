const assert = require('node:assert/strict');
const { session } = require('electron');
const { randomUUID } = require('node:crypto');
async function testSessionStorage() {
  // Use a new synthetic partition, never the operator's remembered Amazon partition.
  // On Mac, the distributed app uses WebKit rather than this Electron shell.
  if (process.platform === 'darwin') return;
  const store = session.fromPartition(`persist:synthetic-session-test-${randomUUID()}`);
  assert.equal(store.isPersistent(), true);
  try {
    await store.cookies.set({ url: 'https://fixture.invalid', name: 'synthetic-session', value: 'synthetic-test-data', secure: true, expirationDate: Date.now() / 1000 + 3600 });
    await store.cookies.flushStore();
    assert.equal((await store.cookies.get({ name: 'synthetic-session' })).length, 1);
    await store.clearStorageData(); await store.clearAuthCache(); await store.cookies.flushStore();
    assert.equal((await store.cookies.get({ name: 'synthetic-session' })).length, 0);
  } finally { await store.clearStorageData(); await store.clearCache(); }
}
module.exports = { testSessionStorage };
