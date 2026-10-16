const { app, BrowserWindow, WebContentsView, session, protocol, ipcMain, dialog, Menu, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { readWorkbook } = require('./workbook.cjs');
const { Engine, skipContent } = require('./engine.cjs');
const root = path.join(__dirname, '..');
const defaultStorefront = 'https://slate.amazon.com/merchandising/ui/amzn1.dv.channel.8356bff5-1b7d-403a-a116-5ae64b5cfe14.US/storefront/overview';
const selfTest = process.argv.includes('--self-test');
const fixtureURL = pathToFileURL(path.join(root, 'Resources/slate_fixture.html')).href;
const uiURL = 'carousel://ui/index.html';
let win, guest, engine, driver, version, sheets = [], selected = 0, workbookName = '', storefront = defaultStorefront;
protocol.registerSchemesAsPrivileged([{ scheme: 'carousel', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function validStorefront(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'slate.amazon.com' && url.pathname.endsWith('/storefront/overview') && !url.search && !url.hash && !url.username && !url.password && !url.port;
  } catch { return false; }
}
function allowedNavigation(value) {
  if (selfTest) return value === fixtureURL;
  try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'amazon.com' || url.hostname.endsWith('.amazon.com')) && !url.username && !url.password; } catch { return false; }
}
function assertSlate() {
  if (selfTest && guest.webContents.getURL() === fixtureURL) return;
  const url = new URL(guest.webContents.getURL());
  const target = new URL(storefront), prefix = target.pathname.replace(/storefront\/overview$/, '');
  if (url.origin !== 'https://slate.amazon.com' || !url.pathname.startsWith(prefix)) throw Error('Sign in, then open the selected Slate storefront before running.');
}
const commands = new Set(['state', 'order', 'pins', 'resume', 'cancel', 'open', 'overview', 'moveRail', 'search', 'choose', 'moveTitle', 'clearSearch', 'publishCarousel', 'schedule', 'publishStorefront']);
const adapter = {
  publishDelay: selfTest ? 100 : 8000,
  async call(command, input = {}) {
    assertSlate();
    if (!commands.has(command)) throw Error('Unknown browser operation.');
    return guest.webContents.executeJavaScript(`(async () => { ${driver}\n return await window.ACU[${JSON.stringify(command)}](${JSON.stringify(input)}); })()`);
  },
  async reload() {
    assertSlate();
    await new Promise((resolve, reject) => {
      const done = () => { cleanup(); resolve(); };
      const failed = (_e, _code, description, _url, mainFrame) => { if (mainFrame) { cleanup(); reject(Error(description)); } };
      const timer = setTimeout(() => { cleanup(); reject(Error('Slate reload timed out.')); }, 60000);
      const cleanup = () => { clearTimeout(timer); guest.webContents.removeListener('did-finish-load', done); guest.webContents.removeListener('did-fail-load', failed); };
      guest.webContents.once('did-finish-load', done); guest.webContents.on('did-fail-load', failed); guest.webContents.reload();
    });
  }
};
function state() {
  return { version, sheets, selected, workbookName, storefront, busy: engine.busy, staged: !!engine.staged, statuses: engine.statuses, logs: engine.logs, progress: engine.progress, status: engine.status, page: guest.webContents.getURL() };
}
function changed() { if (win && !win.isDestroyed()) win.webContents.send('updater:state', state()); }
async function confirm(message, detail, button) {
  const result = await dialog.showMessageBox(win, { type: 'warning', message, detail, buttons: ['Cancel', button], defaultId: 0, cancelId: 0, noLink: true });
  return result.response === 1;
}
async function loadWorkbook() {
  const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }] });
  if (result.canceled) return;
  const parsed = await readWorkbook(result.filePaths[0]);
  sheets = parsed; selected = 0; workbookName = path.basename(result.filePaths[0]); engine.reset();
  engine.status = `${sheets[0].rails.length} rails - Top 10 stays first`; engine.log(`Loaded ${workbookName}. Workbook cells are used only as data.`);
}
async function action(event, command, input) {
  if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== uiURL) throw Error('Untrusted app request.');
  if (command === 'state') return state();
  if (command === 'modal') {
    if (typeof input !== 'boolean') throw Error('Invalid modal request.');
    guest.setVisible(!input); return state();
  }
  if (command === 'stop') { if (engine.busy) await engine.stop(); return state(); }
  if (engine.busy) throw Error('Wait for the current operation or click Stop.');
  switch (command) {
    case 'workbook': await loadWorkbook(); break;
    case 'sheet':
      if (!Number.isInteger(input) || !sheets[input]) throw Error('Select a valid worksheet.');
      selected = input; engine.reset(); engine.status = `${sheets[selected].rails.length} rails - Top 10 stays first`; break;
    case 'open': await guest.webContents.loadURL(storefront); break;
    case 'back': if (guest.webContents.navigationHistory.canGoBack()) guest.webContents.navigationHistory.goBack(); break;
    case 'reload': engine.staged = null; guest.webContents.reload(); break;
    case 'storefront':
      if (!validStorefront(input)) throw Error('Use an HTTPS slate.amazon.com storefront/overview URL without query parameters.');
      storefront = input; engine.staged = null;
      await fs.mkdir(app.getPath('userData'), { recursive: true });
      await fs.writeFile(path.join(app.getPath('userData'), 'preferences.json'), JSON.stringify({ storefront }));
      await guest.webContents.loadURL(storefront); break;
    case 'run': {
      if (!sheets[selected]) throw Error('Choose a workbook first.');
      if (!['full', 'order'].includes(input)) throw Error('Select a valid update mode.');
      const sheet = sheets[selected];
      if (input === 'full' && !await confirm('Save carousel content to Amazon?', `Update ${sheet.rails.filter(r => !skipContent(r)).length} eligible lists from ${sheet.name}. Each carousel Schedule action saves immediately. Existing titles are preserved. The final storefront order has a separate Publish Order confirmation.\n\n${storefront}`, 'Run Full Update')) break;
      await engine.run(sheet, input === 'full'); break;
    }
    case 'publish': {
      if (!engine.staged) throw Error('No verified draft to publish.');
      const details = engine.staged.map((name, i) => `${i + 1}. ${name}`).join('\n');
      if (await confirm('Publish storefront order?', `${storefront}\n\n${details}\n\nExtra existing rails remain below these.`, 'Publish Order')) await engine.publish();
      break;
    }
    case 'export': {
      const result = await dialog.showSaveDialog(win, { defaultPath: 'carousel-run-report.txt', filters: [{ name: 'Text report', extensions: ['txt'] }] });
      if (!result.canceled && result.filePath) await fs.writeFile(result.filePath, `Amazon Carousel Updater V${version}\nWorkbook: ${workbookName}\nSheet: ${sheets[selected]?.name || ''}\nSaved carousels: ${engine.completed}\nStatus: ${engine.status}\n\n${engine.logs.join('\n')}\n`);
      break;
    }
    default: throw Error('Unknown app operation.');
  }
  changed(); return state();
}

async function start() {
  version = (await fs.readFile(path.join(root, 'VERSION'), 'utf8')).trim();
  if (app.getVersion() !== `${version}.0`) throw Error('App and release versions differ.');
  driver = await fs.readFile(path.join(root, 'Resources/slate_driver.js'), 'utf8');
  if (!selfTest) try {
    const saved = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'preferences.json'), 'utf8'));
    if (validStorefront(saved.storefront)) storefront = saved.storefront;
  } catch { /* Missing or malformed preferences use the safe default storefront. */ }
  const assets = new Map([['/index.html', ['desktop/ui/index.html', 'text/html']], ['/app.css', ['desktop/ui/app.css', 'text/css']], ['/app.js', ['desktop/ui/app.js', 'text/javascript']], ['/logo.png', ['Resources/app-logo.png', 'image/png']]]);
  protocol.handle('carousel', async request => {
    const url = new URL(request.url), asset = assets.get(url.pathname);
    if (url.hostname !== 'ui' || !asset) return new Response('Not found', { status: 404 });
    return new Response(await fs.readFile(path.join(root, asset[0])), { headers: { 'Content-Type': asset[1], 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" } });
  });
  const isolated = session.fromPartition(`slate-${randomUUID()}`, { cache: false });
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolated.setPermissionCheckHandler(() => false);
  isolated.on('will-download', event => event.preventDefault());
  const area = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({ width: Math.min(1420, area.width), height: Math.min(940, area.height), minWidth: 960, minHeight: 640, title: `Amazon Carousel Updater V${version}`, icon: path.join(root, 'Resources/app-logo.png'), backgroundColor: '#f5f7f6', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  guest = new WebContentsView({ webPreferences: { session: isolated, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, navigateOnDragDrop: false } });
  win.contentView.addChildView(guest);
  const resize = () => { const [width, height] = win.getContentSize(); guest.setBounds({ x: 390, y: 54, width: width - 390, height: height - 54 }); };
  win.on('resize', resize); resize();
  for (const eventName of ['will-navigate', 'will-redirect', 'will-frame-navigate']) guest.webContents.on(eventName, event => { if (!allowedNavigation(event.url)) { event.preventDefault(); engine.log('Blocked navigation outside the Amazon browser session.'); } });
  guest.webContents.setWindowOpenHandler(({ url }) => { if (allowedNavigation(url)) void guest.webContents.loadURL(url).catch(error => engine.log(error.message)); return { action: 'deny' }; });
  guest.webContents.on('did-navigate', changed);
  guest.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => { if (mainFrame && code !== -3) { engine.status = 'Page did not load - check your connection'; changed(); } });
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  engine = new Engine(adapter, changed);
  ipcMain.handle('updater:action', async (...args) => {
    try { return { ok: true, state: await action(...args) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  win.on('close', event => {
    if (engine.busy && dialog.showMessageBoxSync(win, { type: 'warning', message: 'Quit during an update?', detail: 'Saves already submitted to Amazon cannot be undone by quitting. The current save may still finish.', buttons: ['Keep Running', 'Quit'], defaultId: 0, cancelId: 0, noLink: true }) !== 1) event.preventDefault();
  });
  win.on('closed', () => { guest.webContents.close(); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'File', submenu: [{ label: 'Open Workbook', accelerator: 'CmdOrCtrl+O', click: () => { if (!engine.busy) loadWorkbook().catch(error => dialog.showErrorBox('Workbook needs attention', error.message)); } }, { type: 'separator' }, { role: 'quit' }] }, { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }]));
  await win.loadURL(uiURL);
  await guest.webContents.loadURL(selfTest ? fixtureURL : storefront);
  changed();
  if (selfTest) {
    const { runSelfTest } = require('./self-test.cjs');
    await runSelfTest({ engine, guest, win, setWorkbook(value) { sheets = [value]; selected = 0; workbookName = 'synthetic-workbook.xlsx'; changed(); } });
    console.log('DESKTOP SELF-TEST PASS');
    if (!process.argv.includes('--keep-open')) app.exit(0);
  }
}
app.whenReady().then(start).catch(error => { console.error(error.message); if (!selfTest) dialog.showErrorBox('Amazon Carousel Updater', error.message); app.exit(1); });
app.on('window-all-closed', () => app.quit());
