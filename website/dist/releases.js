'use strict';
const owner = 'MichaelBrandonFalk';
const repo = 'Amazon-Carousel-Updater';
fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {headers:{Accept:'application/vnd.github+json'}})
  .then(response => { if (!response.ok) throw Error('Release API unavailable'); return response.json(); })
  .then(releases => {
    const publicReleases = releases.filter(release => !release.draft && release.assets.some(asset => asset.name.endsWith('-macOS-universal.zip')));
    if (!publicReleases.length) return;
    const body = document.getElementById('releases');
    body.replaceChildren();
    publicReleases.forEach((release, index) => {
      const asset = release.assets.find(item => item.name.endsWith('-macOS-universal.zip'));
      const row = document.createElement('tr');
      const version = release.tag_name.replace(/^v/i, 'V');
      const cell = document.createElement('td');
      const strong = document.createElement('strong'); strong.textContent = version; cell.append(strong);
      if (index === 0) { const badge=document.createElement('span');badge.className='latest';badge.textContent='Latest';cell.append(badge); }
      row.append(cell);
      const platform=document.createElement('td'); platform.textContent='macOS universal'; row.append(platform);
      for (const [label, url] of [['Mac app (.zip)',asset.browser_download_url],['Notes & checksum',release.html_url]]) {
        const td=document.createElement('td'), link=document.createElement('a');
        const parsed=new URL(url);
        if(parsed.hostname!=='github.com'||parsed.protocol!=='https:')throw Error('Unexpected release URL');
        link.textContent=label;link.href=parsed.href;td.append(link);row.append(td);
      }
      body.append(row);
      if(index===0){document.getElementById('latest-version').textContent=version;document.getElementById('latest-download').href=asset.browser_download_url;}
    });
  }).catch(() => { /* Static direct download links remain usable. */ });
