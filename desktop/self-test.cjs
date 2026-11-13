const assert = require('node:assert/strict');
const { preservesExtras } = require('./engine.cjs');
async function runSelfTest({ engine, guest, win, setWorkbook }) {
  await require('./session-storage-test.cjs').testSessionStorage();
  const isolation = await guest.webContents.executeJavaScript('({node:typeof require,process:typeof process,bridge:typeof window.updater})');
  assert.deepEqual(isolation, { node: 'undefined', process: 'undefined', bridge: 'undefined' });
  assert.equal(guest.webContents.getLastWebPreferences().sandbox, true);
  assert.equal(guest.webContents.session.isPersistent(), false);
  assert.equal((await win.webContents.executeJavaScript('window.updater.action("remember",true)')).ok, false, 'Tests must never enable remembered real sign-in');
  assert.equal(await win.webContents.executeJavaScript('document.querySelector("#remember").checked'), false);
  const request = await win.webContents.executeJavaScript('window.updater.action("modal", true)');
  assert.equal(request.ok, true); assert.equal(guest.getVisible(), false);
  await win.webContents.executeJavaScript('window.updater.action("modal", false)');
  assert.equal(guest.getVisible(), true);
  const sheet = { name: 'Synthetic weekly sheet', rails: [
    { position: 1, name: 'Unresolved rail', titles: ['Missing Catalog Title'], dynamic: false },
    { position: 2, name: 'Romance', titles: ['Target One', 'Target Two', 'Target Three', 'Target Four', 'Target Five', 'Target Six'], dynamic: false },
    { position: 3, name: 'Faith Favorites', titles: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'], dynamic: false }
  ] };
  setWorkbook(sheet);
  await guest.webContents.executeJavaScript('window.fixtureRowHandle=true;renderEditor("Romance")');
  await engine.call('moveTitle', { title: 'Existing A', position: 1 });
  assert.equal(await guest.webContents.executeJavaScript('window.fixtureRemoveAttempts||0'), 0, 'A nested Remove button must never be chosen as the drag handle');
  await guest.webContents.executeJavaScript('window.fixtureRowHandle=false');
  await guest.webContents.executeJavaScript('renderEditor("Romance");window.fixtureStealFocus=true');
  await assert.rejects(engine.call('moveTitle', { title: 'Existing A', position: 1 }), /Focus left/);
  assert.equal(await guest.webContents.executeJavaScript('window.fixtureRemoveAttempts||0'), 0, 'Lost focus must never activate Remove');
  await guest.webContents.executeJavaScript('window.fixtureStealFocus=false');
  await guest.webContents.executeJavaScript('renderEditor("Romance")');
  await engine.run(sheet, true);
  assert.equal(engine.completed, 2); assert.equal(engine.unresolved.length, 1);
  const counts = await guest.webContents.executeJavaScript('({saves:data.saved,published:data.published})');
  assert.deepEqual(counts.saves.map(item => item.position), [2, 3]); assert.equal(counts.published, 0, 'Run must not publish storefront order');
  assert.ok(await guest.webContents.executeJavaScript('window.fixtureTrustedKeys>0'));
  await engine.publish();
  assert.equal(engine.status, 'Published and verified');
  const data = await guest.webContents.executeJavaScript('({saved:data.saved,published:data.published,pins:data.pins,order:data.order})');
  assert.equal(data.published, 1); assert.equal(data.order.at(-1), 'Documentaries');
  assert.equal(data.pins['Unresolved rail'][0], 'One');
  assert.ok(preservesExtras(['A', 'B', 'B'], ['C', 'A', 'B', 'B'], ['C']));
  assert.equal(preservesExtras(['A', 'B', 'B'], ['C', 'A', 'B'], ['C']), false);
  await engine.run(sheet, false);
  assert.equal(engine.completed, 0, 'Order-only must not save content');
  assert.equal((await guest.webContents.executeJavaScript('data.saved.length')), 2, 'Order-only must preserve content');
  const ui = await win.webContents.executeJavaScript('({logo:document.querySelector("header img").naturalWidth,version:document.querySelector("#version").textContent,overflow:document.querySelector("header").scrollWidth>document.querySelector("header").clientWidth})');
  assert.ok(ui.logo > 0); assert.equal(ui.overflow, false); assert.match(ui.version, /^V\d+\.\d+ /);
}
module.exports = { runSelfTest };
