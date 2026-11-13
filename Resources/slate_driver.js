(() => {
  'use strict';
  const norm = text => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const text = el => (el?.innerText || el?.textContent || '').trim();
  const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = () => { if (window.ACUCancelled) throw Error('Stopped by operator.'); };
  const wait = async (fn, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      check();
      const value = fn();
      if (value) return value;
      await sleep(120);
    }
    throw Error('Slate did not reach the expected page state.');
  };
  const hasLabel = (el, name) => [text(el), el.getAttribute('aria-label'), el.value].some(value => String(value || '').replace(/\s+/g, ' ').trim() === name);
  const button = (scope, name) => Array.from(scope.querySelectorAll('button,a,[role="button"],input[type="button"],input[type="submit"]')).find(el => visible(el) && hasLabel(el, name) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
  const overviewControl = () => Array.from(document.querySelectorAll('a,button,[role="button"]')).find(el => visible(el) && hasLabel(el, 'Overview'));
  const click = el => {
    if (!el || el.disabled) throw Error('The expected Slate control is unavailable.');
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    el.click();
  };
  const sections = () => Array.from(document.querySelectorAll('.carousel-section.title-pinnings,.carousel-section.title-collection')).filter(visible);
  const section = () => {
    const matches = sections();
    if (matches.length !== 1) throw Error('Cannot identify one safe Title pinnings / Title collection section.');
    return matches[0];
  };
  const rows = () => Array.from(section().querySelectorAll('.title-pinning-draggable'));
  const rowTitle = el => {
    const copy = el.cloneNode(true);
    copy.querySelectorAll('button,a,[role="button"]').forEach(child => { if (hasLabel(child, 'Remove') || /^remove\b/i.test(child.getAttribute('aria-label') || '')) child.remove(); });
    return text(copy).replace(/^\d+\s*/, '').trim();
  };
  const pins = () => rows().map(rowTitle);
  const railRows = () => Array.from(document.querySelectorAll('.storefront-carousel'));
  const order = () => railRows().map(el => {
    const header = el.querySelector('.storefront-carousel-header');
    const copy = header.cloneNode(true);
    copy.querySelectorAll('button,.storefront-carousel-action-bar,style').forEach(child => child.remove());
    return text(copy).replace(/^\d+\s*:\s*/, '').trim();
  });
  const setValue = (input, value) => {
    if (!input) throw Error('The expected search/position field is unavailable.');
    const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const editorName = () => {
    const crumbs = text(document.querySelector('nav[aria-label="breadcrumb"]')).replace(/^Overview\s*>?\s*/, '');
    return crumbs.trim();
  };
  const state = () => ({
    host: location.hostname,
    url: location.href,
    overview: railRows().length > 0,
    editor: sections().length === 1,
    editorName: editorName(),
    navigationReady: !Array.from(document.querySelectorAll('[role="dialog"],.modal')).some(visible) && (railRows().length > 0 || !!overviewControl()),
    hasOverviewLink: !!overviewControl(),
    dialog: !!Array.from(document.querySelectorAll('[role="dialog"],.modal')).find(visible),
    order: railRows().length ? order() : [],
    publishEnabled: !!button(document, 'Publish changes')
  });
  const candidates = () => {
    const scope = section().querySelector('.title-search');
    if (!scope) throw Error('Title search is not available in the safe section.');
    return Array.from(scope.querySelectorAll('*')).filter(el => visible(el) && text(el) && !el.querySelector('input') && !el.closest('.title-pinning-draggable') && !Array.from(el.children).some(child => text(child) === text(el)));
  };
  const search = async ({ title }) => {
    const input = section().querySelector('input.title-search-input');
    if (!input) throw Error('Title search is unavailable.');
    setValue(input, title);
    // Debounced search can briefly show results from the previous query.
    await sleep(1000);
    const deadline = Date.now() + 7000;
    let result = [];
    while (Date.now() < deadline) {
      check();
      result = candidates().filter(el => norm(text(el)) === norm(title));
      if (result.length) break;
      await sleep(200);
    }
    return { matches: result.map(el => ({ title: text(el), detail: text(el.parentElement).slice(0, 500) })) };
  };
  const choose = async ({ title }) => {
    const matches = candidates().filter(el => norm(text(el)) === norm(title));
    if (matches.length !== 1) throw Error('The title result is no longer unique: ' + title);
    const before = pins().length;
    click(matches[0]);
    await wait(() => pins().length === before + 1);
    return { pins: pins() };
  };
  const prepareTitleMove = ({ title, position }) => {
    const current = rows(), source = current.findIndex(el => rowTitle(el) === title);
    if (source < 0 || !Number.isInteger(position) || position < 0 || position >= current.length) throw Error('Pinned title or target position is unavailable.');
    const row = current[source];
    const handleSelector = '[data-rbd-drag-handle-draggable-id],[data-rfd-drag-handle-draggable-id]';
    const handle = row.matches(handleSelector) ? row : row.querySelector(handleSelector) || (row.matches('[role="button"][tabindex]') ? row : null);
    if (!handle || hasLabel(handle, 'Remove')) throw Error('Cannot identify a safe title drag handle. No carousel was saved.');
    row.scrollIntoView({ block: 'center' }); handle.focus({ preventScroll: true });
    if (source !== position && document.activeElement !== handle) throw Error('Cannot focus the title drag handle. No carousel was saved.');
    window.ACUTitleMove = { title, position, handle, handleId: handle.getAttribute('data-rbd-drag-handle-draggable-id') || handle.getAttribute('data-rfd-drag-handle-draggable-id') };
    return { source, position };
  };
  const titleKeyTarget = () => {
    const move = window.ACUTitleMove, active = document.activeElement;
    if (!move || !active || hasLabel(active, 'Remove') || hasLabel(active, 'Delete')) return { safe: false };
    const id = active.getAttribute('data-rbd-drag-handle-draggable-id') || active.getAttribute('data-rfd-drag-handle-draggable-id');
    // React may replace the handle while lifting; accept only the same draggable ID, never a child Remove control.
    if (move.handleId && id === move.handleId) move.handle = active;
    return { safe: move.handle.isConnected && active === move.handle };
  };
  const titleDragState = () => {
    titleKeyTarget();
    const move = window.ACUTitleMove;
    if (!move) throw Error('No title move is active.');
    return { index: pins().indexOf(move.title), top: move.handle.getBoundingClientRect().top,
      announcement: Array.from(document.querySelectorAll('[id^="rbd-announcement-"],[id^="rfd-announcement-"]')).map(text).join(' ') };
  };
  const waitTitleStep = async ({ previous }) => {
    await wait(() => {
      const now = titleDragState();
      return now.index !== previous.index || now.announcement !== previous.announcement || Math.abs(now.top - previous.top) > 1;
    }, 3000);
    // React drag sensors reject movement while the previous step is animating.
    await sleep(300); check();
    return titleDragState();
  };
  const verifyTitleMove = async ({ title, position }) => {
    try { await wait(() => pins()[position] === title, 3000); }
    catch { throw Error('Keyboard reorder did not verify for ' + title + '. No carousel was saved.'); }
    window.ACUTitleMove = null;
    return { pins: pins() };
  };
  const dialog = () => Array.from(document.querySelectorAll('[role="dialog"],.modal')).find(el => visible(el) && text(el).includes('Schedule carousel'));
  const schedule = async ({ position }) => {
    const modal = dialog();
    if (!modal) throw Error('Schedule carousel dialog was not found.');
    const radios = Array.from(modal.querySelectorAll('input[type="radio"]'));
    if (radios.length !== 4 || !radios[0].checked || !radios[2].checked) throw Error('Scheduling dates are not both open-ended. Check the dialog manually.');
    const fields = Array.from(modal.querySelectorAll('input[type="number"]')).filter(el => !el.disabled);
    if (fields.length !== 1 || !Number.isInteger(position) || position < 1) throw Error('Cannot identify one valid Position field.');
    setValue(fields[0], String(position));
    if (Number(fields[0].value) !== position) throw Error('Position did not verify.');
    click(button(modal, 'Schedule'));
    return { submitted: true };
  };
  window.ACU = {
    state, order: () => ({ order: order() }), pins: () => ({ pins: pins(), editorName: editorName() }),
    resume: () => { window.ACUCancelled = false; return {}; },
    cancel: () => { window.ACUCancelled = true; return {}; },
    open: ({ name }) => {
      const list = railRows();
      const matching = list.filter((_, i) => norm(order()[i]) === norm(name));
      if (matching.length !== 1) throw Error('Cannot identify one carousel: ' + name);
      click(button(matching[0], 'Edit'));
      return { opened: true };
    },
    overview: () => {
      const el = overviewControl();
      click(el);
      return {};
    },
    moveRail: async ({ name, position }) => {
      const source = order().findIndex(value => norm(value) === norm(name));
      if (source < 0 || source <= position) throw Error('Unexpected carousel source position.');
      const caret = railRows()[source].querySelectorAll('button.storefront-carousel-action-caret-button');
      if (caret.length !== 2) throw Error('Expected two carousel arrow controls.');
      click(caret[1]);
      await wait(() => norm(order()[source - 1]) === norm(name));
      return { order: order() };
    },
    search, choose, prepareTitleMove, titleDragState, titleKeyTarget, waitTitleStep, verifyTitleMove,
    clearSearch: () => { setValue(section().querySelector('input.title-search-input'), ''); return {}; },
    publishCarousel: async () => {
      section();
      if (railRows().length) throw Error('Not in a carousel editor. No carousel was saved.');
      const control = await wait(() => button(document, 'Publish') || button(document, 'Publish changes') || button(document, 'Publish carousel'), 10000);
      click(control); return {};
    },
    schedule,
    publishStorefront: () => { click(button(document, 'Publish changes')); return { submitted: true }; }
  };
})();
