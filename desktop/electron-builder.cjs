const fs = require('node:fs');
const path = require('node:path');
const version = fs.readFileSync(path.join(__dirname, '../VERSION'), 'utf8').trim();
module.exports = {
  appId: 'com.mbf.amazoncarouselupdater',
  productName: 'Amazon Carousel Updater',
  executableName: 'amazon-carousel-updater',
  directories: { output: 'dist/desktop' },
  files: ['desktop/**', '!desktop/tests/**', 'Resources/slate_driver.js', 'Resources/slate_fixture.html', 'Resources/app-logo.png', 'VERSION', 'package.json'],
  asar: true,
  npmRebuild: false,
  win: {
    target: ['nsis'], icon: 'Resources/app-logo.png',
    artifactName: `Amazon-Carousel-Updater-V${version}-Windows-x64-Setup.\${ext}`
  },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, runAfterFinish: false },
  linux: {
    target: ['deb'], icon: 'Resources/app-logo.png', category: 'Utility',
    artifactName: `Amazon-Carousel-Updater-V${version}-Linux-amd64.\${ext}`,
    maintainer: 'MichaelBrandonFalk', synopsis: 'Amazon Slate carousel updater'
  },
  deb: { depends: ['libgtk-3-0', 'libnotify4', 'libnss3', 'libxss1', 'libxtst6', 'xdg-utils', 'libatspi2.0-0', 'libuuid1', 'libsecret-1-0', 'libgbm1', 'libasound2'] }
};
