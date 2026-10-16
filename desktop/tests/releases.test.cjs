const { test } = require('node:test');
const assert = require('node:assert/strict');
const { releaseRows } = require('../../website/dist/releases.js');
const asset = name => ({ name, browser_download_url: 'https://github.com/owner/repo/releases/download/v1.2/' + name });
const release = (tag, names) => ({ tag_name: tag, assets: names.map(asset), html_url: 'https://github.com/owner/repo/releases/tag/' + tag });
test('show Windows and Linux downloads alongside old Mac-only releases', () => {
  const rows = releaseRows([release('v1.2', ['App-macOS-universal.zip', 'App-Windows-x64-Setup.exe', 'App-Linux-amd64.deb']), release('v1.1', ['App-macOS-universal.zip'])]);
  assert.deepEqual(rows.map(r => r.platform.id), ['macos', 'windows', 'linux', 'macos']);
  assert.deepEqual(rows.map(r => r.version), ['V1.2', 'V1.2', 'V1.2', 'V1.1']);
});
test('ignore draft releases and reject foreign download links', () => {
  assert.deepEqual(releaseRows([{ ...release('v2.0', ['App-Linux-amd64.deb']), draft: true }]), []);
  const bad = release('v1.2', ['App-Windows-x64-Setup.exe']); bad.assets[0].browser_download_url = 'https://example.com/untrusted.exe';
  assert.throws(() => releaseRows([bad]), /Unexpected/);
});
