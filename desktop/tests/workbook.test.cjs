const { test } = require('node:test');
const assert = require('node:assert/strict');
const { zipSync, strToU8 } = require('fflate');
const { parseWorkbook } = require('../workbook.cjs');
function workbook({ duplicate = false, badPosition = false, entity = false, dynamic = true, formula = false, duplicateTitle = false, rich = false } = {}) {
  const cell = (ref, value) => `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
  const files = {
    'xl/workbook.xml': '<workbook><sheets><sheet name="Visible week" sheetId="1" r:id="rId1"/><sheet name="Hidden week" state="hidden" r:id="rId2"/><sheet name="Very hidden" state="veryHidden" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml': `<sst><si><t>Romance</t></si><si>${rich ? '<r><t>Alpha &amp; </t></r><r><t>Beta</t></r>' : '<t>Alpha &amp; Beta</t>'}</si></sst>`,
    'xl/worksheets/sheet1.xml': `${entity ? '<!DOCTYPE x [<!ENTITY leak SYSTEM "file:///etc/passwd">]>' : ''}<worksheet><sheetData>
      <row r="1">${cell('A1', 'Position')}${cell('B1', 'Rail Name')}${Array.from({ length: 7 }, (_, i) => cell(String.fromCharCode(67 + i) + '1', '#' + (i + 1) + ' Title')).join('')}</row>
      <row r="2"><c r="A2"><v>${badPosition ? '1.5' : '2'}</v></c>${cell('B2', 'Faith Favorites')}<c r="C2" t="s"><v>1</v></c>${cell('D2', duplicateTitle ? 'Alpha &amp; Beta' : ' Second Title ')}${cell('I2', 'Ignored seventh target')}</row>
      <row r="3"><c r="A3"><v>${duplicate ? '2' : '1'}</v></c><c r="B3" t="s"><v>0</v></c>${formula ? '<c r="C3" t="str"><f>NEVER_EXECUTE()</f><v>Cached title</v></c>' : cell('C3', 'First Title')}</row>
      <row r="4"><c r="A4"><v>3</v></c>${cell('B4', 'Leaving Soon')}${cell('C4', dynamic ? 'Dynamic' : '')}</row>
      <row r="5">${cell('B5', 'Section marker')}</row>
    </sheetData></worksheet>`,
    'xl/worksheets/sheet2.xml': '<worksheet><sheetData/></worksheet>'
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, xml]) => [name, strToU8(xml)])));
}
test('visible sheets only; shared strings; position sorting; first six target columns', () => {
  const sheets = parseWorkbook(workbook());
  assert.equal(sheets.length, 1); assert.equal(sheets[0].name, 'Visible week');
  assert.deepEqual(sheets[0].rails.map(r => r.position), [1, 2, 3]);
  assert.equal(sheets[0].rails[0].name, 'Romance');
  assert.deepEqual(sheets[0].rails[1].titles, ['Alpha & Beta', 'Second Title']);
  assert.deepEqual(sheets[0].rails[2].titles, []); assert.equal(sheets[0].rails[2].dynamic, true);
});
test('rich strings and cached formula results are data, not instructions', () => {
  const sheets = parseWorkbook(workbook({ formula: true, rich: true }));
  assert.equal(sheets[0].rails[0].titles[0], 'Cached title');
  assert.equal(sheets[0].rails[1].titles[0], 'Alpha & Beta');
});
test('reject duplicate positions, duplicate targets, fractional positions and entity declarations', () => {
  assert.throws(() => parseWorkbook(workbook({ duplicate: true })), /duplicate position/);
  assert.throws(() => parseWorkbook(workbook({ duplicateTitle: true })), /duplicate leading/);
  assert.throws(() => parseWorkbook(workbook({ badPosition: true })), /invalid position/);
  assert.throws(() => parseWorkbook(workbook({ entity: true })), /entity declarations/);
});
test('reject large and malformed workbooks', () => {
  assert.throws(() => parseWorkbook(new Uint8Array(25_000_000)), /smaller than 25 MB/);
  assert.throws(() => parseWorkbook(new Uint8Array([1, 2, 3])));
});
