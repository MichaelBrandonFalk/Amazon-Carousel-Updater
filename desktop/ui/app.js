'use strict';
const $ = id => document.getElementById(id);
let current, pending = false;
function render(state) {
  document.title = `Amazon Carousel Updater V${state.version}`;
  current = state; $('version').textContent = `V${state.version} - Pure Flix / Amazon Slate`;
  $('filename').textContent = state.workbookName || 'No workbook selected';
  const sheetNames = state.sheets.map(s => s.name);
  if (JSON.stringify(Array.from($('sheet').options, o => o.text)) !== JSON.stringify(sheetNames)) {
    $('sheet').replaceChildren(...sheetNames.map((name, index) => new Option(name, String(index))));
  }
  $('sheet').value = String(state.selected);
  $('sheet').disabled = state.busy || !state.sheets.length || pending;
  const sheet = state.sheets[state.selected];
  $('rails').replaceChildren(...(sheet?.rails || []).map(rail => {
    const row = document.createElement('tr'); row.title = rail.titles.join('\n');
    for (const [index, text] of [rail.position, rail.name, state.statuses[rail.name] || (rail.dynamic ? 'Dynamic' : `${rail.titles.length} titles`)].entries()) {
      const cell = document.createElement('td'); cell.textContent = text;
      if (index === 2) cell.dataset.status = text;
      row.append(cell);
    }
    return row;
  }));
  for (const id of ['workbook', 'mode', 'open', 'back', 'reload', 'settings']) $(id).disabled = state.busy || pending;
  $('run').disabled = state.busy || !sheet || pending; $('stop').disabled = !state.busy;
  $('publish').disabled = state.busy || !state.staged || pending;
  $('progress').value = state.progress; $('status').textContent = state.status;
  const logs = state.logs.join('\n');
  if ($('logs').textContent !== logs) { $('logs').textContent = logs; $('logs').scrollTop = $('logs').scrollHeight; }
  try { $('page').textContent = state.page.startsWith('file:') ? 'Synthetic Slate test' : new URL(state.page).hostname === 'slate.amazon.com' ? 'Amazon Slate - private session' : 'Amazon sign-in - complete login here'; } catch { $('page').textContent = 'Loading Slate'; }
}
async function showError(message) { await window.updater.action('modal', true); $('error-message').textContent = message; if (!$('error-dialog').open) $('error-dialog').showModal(); }
async function act(command, input) {
  const locks = !['stop', 'state', 'export', 'modal'].includes(command);
  if (locks) { pending = true; if (current) render(current); }
  try {
    const response = await window.updater.action(command, input);
    if (!response.ok) throw Error(response.error);
    render(response.state);
  } catch (error) { showError(error.message); }
  finally { if (locks) { pending = false; if (current) render(current); } }
}
window.updater.onState(render);
for (const id of ['workbook', 'open', 'back', 'reload', 'stop', 'publish', 'export']) $(id).addEventListener('click', () => act(id));
$('sheet').addEventListener('change', () => act('sheet', Number($('sheet').value)));
$('run').addEventListener('click', () => act('run', document.querySelector('input[name="mode"]:checked').value));
$('settings').addEventListener('click', async () => { await window.updater.action('modal', true); $('storefront-url').value = current.storefront; $('storefront-dialog').showModal(); });
$('cancel-storefront').addEventListener('click', () => $('storefront-dialog').close());
$('storefront-form').addEventListener('submit', event => { event.preventDefault(); $('storefront-dialog').close(); act('storefront', $('storefront-url').value); });
$('close-error').addEventListener('click', () => $('error-dialog').close());
for (const id of ['storefront-dialog', 'error-dialog']) $(id).addEventListener('close', () => act('modal', false));
act('state');
