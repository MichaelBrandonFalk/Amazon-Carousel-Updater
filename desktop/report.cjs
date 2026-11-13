const fs = require('node:fs');
const path = require('node:path');
function renderReport(data) {
  const template = fs.readFileSync(path.join(__dirname, '../Resources/report_template.html'), 'utf8');
  const payload = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return template.replace('__REPORT_DATA__', () => payload);
}
function fromTextReport(text) {
  const entries = [], statuses = {}, positions = {}, logs = text.split(/\r?\n/);
  for (const line of logs) {
    let match = line.match(/^(.+?): saved and verified .*Column A position (\d+)/);
    if (match) { positions[match[1]] = Number(match[2]); statuses[match[1]] = 'Saved'; }
    match = line.match(/^(.+?): matched titles already correct/);
    if (match) statuses[match[1]] = 'Already correct';
    match = line.match(/^(.+?): skipped title (.*?) \((.*)\); continuing/);
    if (match) entries.push({ kind: 'not_added', carousel: match[1], title: match[2], reason: match[3] });
  }
  for (const entry of entries) { entry.position = positions[entry.carousel] || ''; if (statuses[entry.carousel] === 'Saved') statuses[entry.carousel] = 'Saved (partial)'; }
  return { version: (text.match(/Updater V([\d.]+)/) || [,''])[1], workbook: (text.match(/NEW RUN: .*? • (.+)/) || [,''])[1], sheet: '', saved: Object.values(statuses).filter(value => value.startsWith('Saved')).length, status: /Published successfully|published once and verified/i.test(text) ? 'Published and verified' : 'Imported run report', entries, statuses, rails: Object.keys(statuses).map(name => ({ name, position: positions[name] || '' })), logs };
}
module.exports = { renderReport, fromTextReport };
