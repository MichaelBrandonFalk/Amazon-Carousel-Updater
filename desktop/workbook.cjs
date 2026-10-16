const fs = require('node:fs/promises');
const { unzipSync, strFromU8 } = require('fflate');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const normalize = value => String(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const array = value => value == null ? [] : Array.isArray(value) ? value : [value];
const clean = value => String(value ?? '').replace(/\u00a0/g, ' ').trim();
const stringText = value => typeof value !== 'object' ? String(value ?? '') : value?.t != null ? stringText(value.t) : value?.r != null ? array(value.r).map(stringText).join('') : String(value?.['#text'] ?? '');

function parseWorkbook(bytes) {
  if (bytes.length >= 25_000_000) throw Error('Choose a workbook smaller than 25 MB.');
  let total = 0, count = 0;
  const entries = unzipSync(new Uint8Array(bytes), { filter(entry) {
    if (++count > 20_000) throw Error('Workbook has too many ZIP entries.');
    if (!/^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(entry.name)) return false;
    total += entry.originalSize;
    if (entry.originalSize > 32_000_000 || total > 128_000_000) throw Error('Workbook XML exceeds the supported size.');
    return true;
  } });
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: false, processEntities: true });
  function read(name) {
    if (!entries[name]) throw Error(`Workbook component is missing or unsafe: ${name}`);
    const xml = strFromU8(entries[name]);
    if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml)) throw Error('Workbook XML entity declarations are not supported.');
    if (XMLValidator.validate(xml) !== true) throw Error('Workbook contains invalid XML.');
    return parser.parse(xml);
  }
  const rels = new Map(array(read('xl/_rels/workbook.xml.rels').Relationships?.Relationship)
    .filter(r => r['@_TargetMode'] !== 'External').map(r => [r['@_Id'], r['@_Target']]));
  const shared = entries['xl/sharedStrings.xml'] ? array(read('xl/sharedStrings.xml').sst?.si).map(stringText) : [];
  const sheets = [];
  for (const sheet of array(read('xl/workbook.xml').workbook?.sheets?.sheet)) {
    if (sheet['@_state'] && sheet['@_state'] !== 'visible') continue;
    const target = rels.get(sheet['@_r:id']);
    if (typeof target !== 'string' || target.includes('..')) throw Error('Unsafe worksheet relationship.');
    const name = sheet['@_name'];
    const rows = array(read(target.startsWith('/') ? target.slice(1) : 'xl/' + target).worksheet?.sheetData?.row).map(row => {
      const values = {};
      for (const cell of array(row.c)) {
        const col = String(cell['@_r'] || '').replace(/\d/g, '');
        const raw = cell['@_t'] === 's' ? shared[Number(cell.v)] : cell['@_t'] === 'inlineStr' ? stringText(cell.is) : cell.v;
        values[col] = clean(raw);
      }
      return values;
    });
    const headerIndex = rows.findIndex(row => Object.values(row).some(v => v.toLowerCase() === 'position') && Object.values(row).some(v => v.toLowerCase() === 'rail name'));
    if (headerIndex < 0) continue;
    const header = rows[headerIndex], columns = Object.keys(header).sort((a, b) => a.length - b.length || a.localeCompare(b));
    const positionCol = columns.find(c => header[c].toLowerCase() === 'position');
    const nameCol = columns.find(c => header[c].toLowerCase() === 'rail name');
    const titleCols = columns.filter(c => /^(?:#\s*\d+\s*)?title$/i.test(header[c])).slice(0, 6);
    const positions = new Set(), names = new Set(), rails = [];
    for (const row of rows.slice(headerIndex + 1)) {
      const railName = row[nameCol] || '', rawPosition = row[positionCol] || '';
      const titles = titleCols.map(c => row[c] || '').filter(Boolean);
      if (!railName || (!rawPosition && !titles.length)) continue;
      const position = Number(rawPosition);
      if (!Number.isInteger(position) || position < 1 || position > 1000) throw Error(`${name}: invalid position for ${railName}.`);
      if (positions.has(position) || names.has(normalize(railName))) throw Error(`${name}: duplicate position or rail name at ${railName}.`);
      positions.add(position); names.add(normalize(railName));
      if (normalize(railName) === normalize('Top 10 in the U.S.')) continue;
      const dynamic = titles.length === 1 && titles[0].toLowerCase() === 'dynamic';
      if (!dynamic && new Set(titles.map(normalize)).size !== titles.length) throw Error(`${railName} has duplicate leading title targets.`);
      rails.push({ position, name: railName, titles: dynamic ? [] : titles, dynamic });
    }
    if (rails.length) sheets.push({ name, rails: rails.sort((a, b) => a.position - b.position) });
  }
  if (!sheets.length) throw Error('No visible worksheet has Position and Rail Name headers.');
  return sheets;
}
async function readWorkbook(filename) {
  if (!filename.toLowerCase().endsWith('.xlsx')) throw Error('Choose an .xlsx workbook.');
  if ((await fs.stat(filename)).size >= 25_000_000) throw Error('Choose a workbook smaller than 25 MB.');
  return parseWorkbook(await fs.readFile(filename));
}
module.exports = { parseWorkbook, readWorkbook, normalize };
