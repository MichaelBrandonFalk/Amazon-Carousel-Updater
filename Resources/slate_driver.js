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
  const button = (scope, name) => Array.from(scope.querySelectorAll('button,a[role="button"]')).find(el => visible(el) && text(el) === name && !el.disabled);
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
  const rowTitle = el => text(el).replace(/^\d+\s*/, '').split('Remove')[0].trim();
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
  const key = (el, value, code, keyCode) => {
    const options = { key: value, code, keyCode, which: keyCode, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', options));
    el.dispatchEvent(new KeyboardEvent('keyup', options));
  };
  const moveTitle = async ({ title, position }) => {
    let current = rows(), source = current.findIndex(el => rowTitle(el) === title);
    if (source < 0) throw Error('Pinned title is missing: ' + title);
    if (source === position) return { pins: pins() };
    const row = current[source];
    row.scrollIntoView({ block: 'center' });
    row.focus();
    key(row, ' ', 'Space', 32);
    try {
      await sleep(150);
      for (let i = 0; i < Math.abs(source - position); i++) {
        check();
        const up = source > position;
        key(row, up ? 'ArrowUp' : 'ArrowDown', up ? 'ArrowUp' : 'ArrowDown', up ? 38 : 40);
        await sleep(90);
      }
      key(row, ' ', 'Space', 32);
      await sleep(250);
    } catch (error) {
      key(row, 'Escape', 'Escape', 27);
      throw error;
    }
    if (pins()[position] !== title) {
      key(row, 'Escape', 'Escape', 27);
      throw Error('Keyboard reorder did not verify for ' + title + '. No carousel was saved.');
    }
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
      const el = button(document.querySelector('nav[aria-label="breadcrumb"]') || document, 'Overview');
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
    search, choose, moveTitle,
    clearSearch: () => { setValue(section().querySelector('input.title-search-input'), ''); return {}; },
    publishCarousel: () => { click(button(document, 'Publish')); return {}; },
    schedule,
    publishStorefront: () => { click(button(document, 'Publish changes')); return { submitted: true }; }
  };
})();
