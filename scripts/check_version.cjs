const fs = require('node:fs');
const path = require('node:path');
function checkVersion(versionText, packageVersion, refType, refName) {
  const version = versionText.trim();
  if (!/^\d+\.\d+$/.test(version) || packageVersion !== `${version}.0`) throw Error('App and release versions differ.');
  if (refType === 'tag' && refName !== `v${version}`) throw Error('Tag does not match VERSION.');
  return version;
}
if (require.main === module) {
  const root = path.join(__dirname, '..');
  console.log('Validated V' + checkVersion(fs.readFileSync(path.join(root, 'VERSION'), 'utf8'), require('../package.json').version, process.env.GITHUB_REF_TYPE, process.env.GITHUB_REF_NAME));
}
module.exports = { checkVersion };
