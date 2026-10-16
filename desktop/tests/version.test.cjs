const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkVersion } = require('../../scripts/check_version.cjs');
test('release validation accepts both Windows CRLF and Unix LF', () => {
  for (const newline of ['\r\n', '\n']) assert.equal(checkVersion('1.3' + newline, '1.3.0', 'tag', 'v1.3'), '1.3');
});
test('release validation rejects mismatched package and tag versions', () => {
  assert.throws(() => checkVersion('1.3\n', '1.2.0', 'tag', 'v1.3'), /versions differ/);
  assert.throws(() => checkVersion('1.3\r\n', '1.3.0', 'tag', 'v1.2'), /Tag does not match/);
});
