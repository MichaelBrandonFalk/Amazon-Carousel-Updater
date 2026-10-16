'use strict';
const platforms = [
  { id: 'macos', label: 'macOS universal', download: 'Mac app (.zip)', suffix: '-macOS-universal.zip' },
  { id: 'windows', label: 'Windows x64', download: 'Windows installer (.exe)', suffix: '-Windows-x64-Setup.exe' },
  { id: 'linux', label: 'Linux Mint amd64', download: 'Linux installer (.deb)', suffix: '-Linux-amd64.deb' }
];
function releaseRows(releases) {
  return releases.filter(r => !r.draft && !r.prerelease).flatMap(release => platforms.flatMap(platform => {
    const asset = release.assets.find(a => a.name.endsWith(platform.suffix));
    if (!asset) return [];
    for (const url of [asset.browser_download_url, release.html_url]) {
      const parsed = new URL(url);
      if (parsed.hostname !== 'github.com' || parsed.protocol !== 'https:') throw Error('Unexpected release URL');
    }
    return [{ platform, version: release.tag_name.replace(/^v/i, 'V'), asset: asset.browser_download_url, notes: release.html_url }];
  }));
}
if (typeof module !== 'undefined') module.exports = { releaseRows };
if (typeof document !== 'undefined') fetch('https://api.github.com/repos/MichaelBrandonFalk/Amazon-Carousel-Updater/releases', { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } })
  .then(response => { if (!response.ok) throw Error('Release API unavailable'); return response.json(); })
  .then(releases => {
    const rows = releaseRows(releases);
    if (!rows.length) return;
    const body = document.getElementById('releases'); body.replaceChildren();
    const seen = new Set();
    for (const [index, entry] of rows.entries()) {
      const row = document.createElement('tr'), version = document.createElement('td'), strong = document.createElement('strong');
      strong.textContent = entry.version; version.append(strong);
      if (index === 0) { const badge = document.createElement('span'); badge.className = 'latest'; badge.textContent = 'Latest'; version.append(badge); document.getElementById('latest-version').textContent = entry.version; }
      row.append(version);
      const platform = document.createElement('td'); platform.textContent = entry.platform.label; row.append(platform);
      for (const [label, url] of [[entry.platform.download, entry.asset], ['Notes & checksum', entry.notes]]) {
        const td = document.createElement('td'), link = document.createElement('a'); link.textContent = label; link.href = url; td.append(link); row.append(td);
      }
      body.append(row);
      if (!seen.has(entry.platform.id)) {
        document.getElementById('download-' + entry.platform.id).href = entry.asset;
        document.getElementById(entry.platform.id + '-version').textContent = entry.version;
        seen.add(entry.platform.id);
      }
    }
  }).catch(() => { /* Versioned static download links remain usable if the API is unavailable. */ });
