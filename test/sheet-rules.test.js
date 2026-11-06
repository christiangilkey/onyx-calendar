// A live Excel sheet read by rules of your own (providers/sheet-rows.js): which rows become blocks, which
// column holds what, and what to use when a cell is empty; the cells Excel formats as dates; and the editor
// that sets them, with its preview, on the PC, the phone and the demo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const rows = require('../src/main/providers/sheet-rows');
const sheet = require('../src/main/providers/sheet');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const NOW = new Date(2026, 10, 6, 12, 0); // Friday 6 November 2026, noon
const at = (iso) => new Date(iso).getTime();
const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

// The office's job board: a title row, a blank one, then the headings in row 3.
const BOARD = [
  ['Job board'],
  [],
  ['Job', 'Client', 'Status', 'Day', 'Time', 'Hours', 'Site', 'Notes', 'Onyx?'],
  ['Kitchen remodel', 'Alvarez', 'Booked', '11/6/2026', '9:00 AM', 3, '14 Pine St', 'Bring tiles', true],
  ['Deck repair', 'Chen', 'Insert', '11/6/2026', '1-3:30pm', null, 'Lakeview Dr', null, true],
  ['Bathroom tiles', 'Okafor', 'insert', null, '10:30', 1.5, 'Elm Ave', null, true],
  ['Quote visit', 'Patel', 'Maybe', '11/7/2026', null, null, null, null, false],
  ['Fence', 'Nguyen', 'Insert', '11/8/2026', null, null, 'Ridge Rd', null, 'yes'],
  ['Painting', 'Garcia', 'Insert', 'next week?', null, null, null, null, false],
  ['Gutters', 'Smith', 'Done', '11/2/2026', '8:00', 2, null, null, false],
];
const RULES = {
  head: 3, when: [{ col: 2, op: 'has', value: 'INSERT' }], title: '{Job} for {Client}', date: 3, start: 4, end: -1,
  length: 5, lengthIn: 'hours', notes: 'Client: {Client}\nSite: {Site}', location: 6, time: '08:00', minutes: 45, noDate: 'above',
};

test('rules: which rows (a condition, any capitals), the title from two columns, the date above, a set time, a range in one cell', () => {
  const { items, skipped, left } = rows.toItems(BOARD, NOW, RULES);
  assert.deepEqual(items.map((i) => i.title), ['Deck repair for Chen', 'Bathroom tiles for Okafor', 'Fence for Nguyen']);
  assert.equal(left, 3, 'Booked, Maybe and Done are left out');
  assert.equal(skipped, 1, '“next week?” is said, not guessed at');
  const [deck, bath, fence] = items;
  assert.equal(deck.start, local(2026, 11, 6, 13, 0), '1-3:30pm is 1:00 to 3:30 in the afternoon');
  assert.equal(deck.end, local(2026, 11, 6, 15, 30));
  assert.equal(bath.start, local(2026, 11, 6, 10, 30), 'no date: the one above it');
  assert.equal(at(bath.end) - at(bath.start), 90 * 60000, 'the Hours column: 1.5 is an hour and a half');
  assert.equal(fence.start, local(2026, 11, 8, 8, 0), 'no time: the set one');
  assert.equal(at(fence.end) - at(fence.start), 45 * 60000, 'no end or length: the set one');
  assert.equal(fence.location, 'Ridge Rd');
  assert.equal(deck.notes, 'Client: Chen\nSite: Lakeview Dr', 'notes keep their lines');
  assert.equal(new Set(items.map((i) => i.rawId)).size, 3);
});

test('rules: all or any of the conditions, ticks, numbers, dates from today on, and no time made all-day', () => {
  const base = { ...RULES, time: '', noDate: 'skip' };
  const titles = (r) => rows.toItems(BOARD, NOW, { ...base, ...r }).items.map((i) => i.title.split(' for ')[0]);
  assert.deepEqual(titles({ when: [{ col: 8, op: 'ticked' }] }), ['Kitchen remodel', 'Deck repair', 'Fence'], 'TRUE and yes are ticked (Bathroom has no date)');
  assert.deepEqual(titles({ match: 'any', when: [{ col: 2, op: 'is', value: 'booked' }, { col: 2, op: 'is', value: 'done' }] }), ['Kitchen remodel', 'Gutters']);
  assert.deepEqual(titles({ when: [{ col: 2, op: 'is', value: 'booked' }, { col: 2, op: 'is', value: 'done' }] }), [], 'all of them: none is both');
  assert.deepEqual(titles({ when: [{ col: 5, op: 'more', value: '1.5' }] }), ['Kitchen remodel', 'Gutters']);
  assert.deepEqual(titles({ when: [{ col: 3, op: 'upcoming' }] }), ['Kitchen remodel', 'Deck repair', 'Quote visit', 'Fence']);
  assert.deepEqual(titles({ when: [{ col: 3, op: 'past' }] }), ['Gutters']);
  assert.deepEqual(titles({ when: [{ col: 7, op: 'empty' }, { col: 6, op: 'filled' }, { col: 0, op: 'starts', value: 'f' }] }), ['Fence']);
  assert.deepEqual(titles({ when: [{ col: 2, op: 'lacks', value: 'insert' }, { col: 2, op: 'isnt', value: 'Maybe' }, { col: 1, op: 'ends', value: 'h' }] }), ['Gutters']);
  const fence = rows.toItems(BOARD, NOW, { ...base, when: [{ col: 0, op: 'is', value: 'fence' }] }).items[0];
  assert.equal(fence.allDay, true);
  assert.deepEqual([fence.start, fence.end], ['2026-11-08', '2026-11-09']);
});

test('rules: a fixed title, no headings, dates written day first, and today for a row with no date', () => {
  const bare = [['Shift', '6/11/2026', '07:00', '15:00'], ['Shift', '', '22:00', '06:00'], ['Shift', '25/12/2026', '', '']];
  const r = { head: 0, title: 'Work', date: 1, start: 2, end: 3, order: 'dmy', noDate: 'today' };
  const { items } = rows.toItems(bare, NOW, r);
  assert.deepEqual(items.map((i) => i.title), ['Work', 'Work', 'Work']);
  assert.equal(items[0].start, local(2026, 11, 6, 7, 0), '6/11 is 6 November, day first');
  assert.equal(items[1].start, local(2026, 11, 6, 22, 0), 'no date: today');
  assert.equal(items[1].end, local(2026, 11, 7, 6, 0), 'a night shift ends the next morning');
  assert.deepEqual([items[2].start, items[2].allDay], ['2026-12-25', true], '25/12 can only be day first');
  assert.equal(rows.toItems([['A', '6/11/2026', '9:00']], NOW, { ...r, order: 'mdy' }).items[0].start, local(2026, 6, 11, 9, 0), 'month first: 11 June');
});

test('the preview says what each row became, and why the others did not', () => {
  const p = rows.preview(BOARD, RULES, NOW);
  assert.deepEqual(p.totals, { blocks: 3, skipped: 1, left: 3, rows: 7 });
  assert.deepEqual(p.columns.slice(0, 3), [{ i: 0, letter: 'A', name: 'Job' }, { i: 1, letter: 'B', name: 'Client' }, { i: 2, letter: 'C', name: 'Status' }]);
  const by = Object.fromEntries(p.shown.map((r) => [r.row, r]));
  assert.ok(by[1].above && !by[2], 'the title row is above the headings; the blank row is not shown');
  assert.ok(by[3].head);
  assert.equal(by[4].out, 'Status doesn’t contain “INSERT”');
  assert.equal(by[6].block.dayFrom, 'above');
  assert.equal(by[8].block.timeFrom, 'default');
  assert.equal(by[8].block.lengthFrom, 'default');
  assert.equal(by[9].skip, 'No date Onyx can read in “next week?”');
  assert.deepEqual(by[5].cells.slice(0, 3), ['Deck repair', 'Chen', 'Insert']);
  assert.equal(rows.preview(BOARD, { ...RULES, match: 'any', when: [...RULES.when, { col: 0, op: 'is', value: 'x' }] }, NOW).shown.find((r) => r.row === 4).out, 'None of your conditions match');
  assert.equal(rows.preview(BOARD, { ...RULES, title: 7 }, NOW).shown.find((r) => r.row === 5).skip, 'No title in Notes');
});

test('Onyx’s own reading, written as rules, is where the editor starts and reads the same', () => {
  const s = rows.suggest(BOARD, NOW);
  assert.equal(s.head, 3);
  assert.deepEqual([s.title, s.date, s.start, s.length, s.lengthIn, s.notes, s.location], [0, 3, 4, 5, 'hours', 7, 6]);
  assert.deepEqual(s.when, []);
  const auto = rows.toItems(BOARD, NOW).items, guessed = rows.toItems(BOARD, NOW, s).items;
  assert.deepEqual(guessed.map((i) => [i.title, i.start, i.end]), auto.map((i) => [i.title, i.start, i.end]));
  assert.deepEqual(rows.suggest([['Dentist', '11/9/2026', '9:00']], NOW).head, 0, 'no headings');
});

test('rules from anywhere are put right before they are kept', () => {
  const c = rows.clean({ head: '-4', when: [{ col: 'x', op: 'has' }, { col: 1, op: 'drop table' }, { col: 2, op: 'is', value: 'a'.repeat(500) }],
    title: '1', date: 'B', minutes: 99999, time: '25:00', noDate: 'sometimes', order: 'ymd', lengthIn: 'days', match: 'most' });
  assert.equal(c.head, 0);
  assert.deepEqual(c.when.map((w) => [w.col, w.op, w.value.length]), [[2, 'is', 120]]);
  assert.deepEqual([c.title, c.date, c.minutes, c.time, c.noDate, c.order, c.lengthIn, c.match], [1, -1, 1440, '', 'skip', 'mdy', 'minutes', 'all']);
  assert.equal(rows.clean(null), null);
  assert.equal(rows.clean({ when: Array.from({ length: 40 }, () => ({ col: 0, op: 'filled' })) }).when.length, 12);
});

test('a title of your own: {Heading} or {B}, and a dash left beside an empty cell goes too', () => {
  const names = ['Job', 'Client', 'Room'];
  assert.equal(rows.fill('{job} – {Client} ({C})', ['Deck', 'Chen', '4'], names), 'Deck – Chen (4)');
  assert.equal(rows.fill('{Job} – {Client}', ['Deck', null], names), 'Deck');
  assert.equal(rows.fill('{Job} · {Room} · {Client}', ['Deck', 'Chen', ''], names), 'Deck · Chen');
  assert.equal(rows.fill('Shift', [], names), 'Shift');
  assert.equal(rows.fill(1, ['Deck', 'Chen'], names), 'Chen');
  assert.equal(rows.fill('{Nope}', ['x'], names), '');
});

test('two times in one cell', () => {
  const r = rows.parseRange;
  assert.deepEqual(r('9-10:30am'), { start: 540, end: 630 });
  assert.deepEqual(r('11-1pm'), { start: 660, end: 780 });
  assert.deepEqual(r('9:00 AM - 5:00 PM'), { start: 540, end: 1020 });
  assert.deepEqual(r('14:00 to 15:30'), { start: 840, end: 930 });
  assert.deepEqual(r('7pm–9pm'), { start: 1140, end: 1260 });
  assert.equal(r('11-06'), null, 'not a range of times');
  assert.equal(r('2026-11-06'), null);
  assert.equal(r('Pizza - Pasta'), null);
  assert.equal(r(930), null);
});

// ---------------------------------------------------------------- Excel's dates, kept as numbers with a format

function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8'), data = zlib.deflateRawSync(raw), n = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, data); centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
/** A workbook whose cells are [value, style]: style 0 general, 1 a date (built in), 2 a time, 3 [h]:mm, 4 dddd, mmmm d (own), 5 a number with words. */
function styled(tabs, { base1904 = false } = {}) {
  const files = {};
  const names = Object.keys(tabs);
  names.forEach((name, t) => {
    const xml = tabs[name].map((row, r) => `<row r="${r + 1}">${row.map(([v, s], c) => (v == null ? '' : typeof v === 'number'
      ? `<c r="${String.fromCharCode(65 + c)}${r + 1}" s="${s || 0}"><v>${v}</v></c>`
      : `<c r="${String.fromCharCode(65 + c)}${r + 1}" t="inlineStr"><is><t>${v}</t></is></c>`)).join('')}</row>`).join('');
    files[`xl/worksheets/sheet${t + 1}.xml`] = `<worksheet><sheetData>${xml}</sheetData></worksheet>`;
  });
  files['xl/workbook.xml'] = `<workbook xmlns:r="r">${base1904 ? '<workbookPr date1904="1"/>' : ''}<sheets>${names.map((n, t) => `<sheet name="${n}" sheetId="${t + 1}"${n === 'Secret' ? ' state="hidden"' : ''} r:id="rId${t + 1}"/>`).join('')}</sheets></workbook>`;
  files['xl/_rels/workbook.xml.rels'] = `<Relationships>${names.map((n, t) => `<Relationship Id="rId${t + 1}" Target="worksheets/sheet${t + 1}.xml"/>`).join('')}</Relationships>`;
  files['xl/styles.xml'] = '<styleSheet><numFmts count="2"><numFmt numFmtId="164" formatCode="dddd, mmmm d"/><numFmt numFmtId="165" formatCode="0.0 &quot;hrs&quot;"/></numFmts>'
    + '<cellXfs count="6"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="20"><alignment/></xf><xf numFmtId="46"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>';
  return zip(files);
}
const NOV6 = 46332; // 6 November 2026 as Excel counts

test('a number Excel shows as a date or a time is read as one: built-in formats, your own, lengths of time, 1904 workbooks', () => {
  const book = sheet.readBook(styled({ Jobs: [[[NOV6, 1], [0.375, 2], [0.0625, 3], [NOV6 + 1, 4], [1.5, 5], [NOV6 + 0.75, 1], [7, 0]]] }));
  assert.deepEqual(book.rows[0], ['2026-11-06', '09:00', '1:30', '2026-11-07', 1.5, '2026-11-06', 7], 'a date shown without its time is that day');
  assert.equal(sheet.readBook(styled({ A: [[[NOV6 - 1462, 1]]] }, { base1904: true })).rows[0][0], '2026-11-06');
  assert.deepEqual(['dd/mm/yyyy', 'h:mm AM/PM', 'm/d/yy h:mm', '[h]:mm', '0.00%', 'General', '#,##0 "days"', '[Red]0.0', '@', '[$-409]mmmm d, yyyy'].map(sheet.formatKind),
    ['date', 'time', 'datetime', 'elapsed', null, null, null, null, null, 'date']);
  // And read into blocks like that: Excel's date, its time and its length of time.
  const { items } = rows.toItems(book.rows, NOW, { head: 0, title: 'Job', date: 0, start: 1, length: 2 });
  assert.equal(items[0].start, local(2026, 11, 6, 9, 0));
  assert.equal(at(items[0].end) - at(items[0].start), 90 * 60000);
});

test('the editor sees the tabs (not hidden ones), and a tab of its own; a .csv has none', () => {
  const buf = styled({ Jobs: [[['Job'], ['Day']]], Secret: [[['x']]], Archive: [[['Old'], ['Day']]] });
  assert.deepEqual(sheet.readSheet(buf).tabs, ['Jobs', 'Archive']);
  assert.equal(sheet.readSheet(buf, 'archive').tab, 'Archive');
  assert.deepEqual(sheet.readSheet(buf, 'Secret').tabs, ['Jobs', 'Secret', 'Archive'], 'a hidden tab asked for by name is listed');
  assert.deepEqual(sheet.readSheet(Buffer.from('Title,Date\nA,11/6/2026')), { rows: [['Title', 'Date'], ['A', '11/6/2026']], tabs: [], tab: null });
});

test('a file on this PC with rules: looked at, tried, kept, and read by them from then on', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-rules-'));
  const file = path.join(dir, 'Jobs.xlsx');
  const board = BOARD.map((row) => row.map((v) => [v]));
  fs.writeFileSync(file, styled({ Jobs: board, Archive: [[['Title'], ['Date']], [['Old job'], ['11/1/2026']]] }));
  const acct = { id: 'sR1', provider: 'sheet', label: 'Jobs', path: file, host: os.hostname() };
  try {
    // With nothing set, Onyx reads it by its headings, and the editor starts from that.
    const peek = await sheet.peek(acct);
    assert.deepEqual(peek.tabs, ['Jobs', 'Archive']);
    assert.equal(peek.tab, 'Jobs');
    assert.equal(peek.saved, false);
    assert.deepEqual(peek.rules, peek.suggested);
    assert.equal(peek.rules.head, 3);
    assert.ok(peek.shown.length && peek.columns.length === 9);
    // Another tab starts from Onyx's reading of that one.
    const other = await sheet.peek(acct, 'Archive');
    assert.equal(other.tab, 'Archive');
    assert.equal(other.totals.blocks, 1);
    // Trying rules keeps nothing.
    const tried = await sheet.preview(acct, { rules: RULES });
    assert.equal(tried.totals.blocks, 3);
    assert.equal(acct.rules, undefined);
    // Kept: the calendar reads by them.
    sheet.setRules(acct, { tab: 'Jobs', rules: RULES });
    assert.equal(acct.tab, 'Jobs');
    assert.equal(acct.rules.when[0].value, 'INSERT');
    const blocks = await sheet.events(acct, '2026-11-01T00:00:00', '2026-11-30T00:00:00');
    assert.deepEqual(blocks.map((b) => b.title), ['Deck repair for Chen', 'Bathroom tiles for Okafor', 'Fence for Nguyen']);
    assert.deepEqual(sheet.status(acct.id), { ...sheet.status(acct.id), blocks: 3, skipped: 1, left: 3 });
    assert.equal((await sheet.peek(acct)).saved, true);
    // Back to its headings.
    sheet.setRules(acct, { rules: null });
    assert.equal(acct.rules, undefined);
    assert.equal((await sheet.events(acct, '2026-11-01T00:00:00', '2026-11-30T00:00:00')).length, 5, 'every row with a date');
    // A sheet whose dates Onyx can't find on its own is still added: its rules say where they are.
    fs.writeFileSync(path.join(dir, 'odd.csv'), 'Thing,Who\nDeck,Sam\nFence,Ana');
    const odd = await sheet.check({ id: 'sR2', label: 'Odd', path: path.join(dir, 'odd.csv') });
    assert.deepEqual(odd, { blocks: 0, skipped: 3 });
  } finally {
    sheet.forget(acct.id);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the rules editor: on the PC and the phone, opened when a sheet is added, kept on the PC', () => {
  const api = read('src/main/api.js'), app = read('src/renderer/app.js'), css = read('src/renderer/styles.css');
  for (const name of ['sheet:peek', 'sheet:preview', 'sheet:rules']) assert.match(api, new RegExp(`'${name}': `), name);
  assert.match(api, /rules: !!rules, sheet: require\('\.\/providers\/sheet'\)\.status\(id\)/, 'Settings is told a sheet has rules, not what they are');
  assert.match(api, /return \{ \.\.\.\(await afterAccountChange\(\)\), blocks, id: acct\.id \};/);
  assert.match(read('src/main/main.js'), /return \{ \.\.\.\(await afterAccountChange\(\)\), blocks, id: acct\.id \};/, 'a file picked on the PC too');
  for (const f of ['src/preload.js', 'src/renderer/remote.js', 'src/renderer/mock.js']) {
    for (const m of ['sheetPeek', 'sheetPreview', 'sheetRules']) assert.match(read(f), new RegExp(`${m}: `), `${f}: ${m}`);
  }
  assert.match(read('src/renderer/remote.js'), /sheetRules: async \(id, o\) => withLocal\(await call\('sheet:rules', id, o\)\)/);
  assert.match(read('src/engine/index.js'), /'sheet:add', 'sheet:rules'/);
  assert.match(app, /if \(r\?\.id\) setTimeout\(\(\) => openSheetRules\(r\.id, \{ fresh: true \}\), 0\);/);
  assert.match(app, /onclick: \(\) => openSheetRules\(a\.id\) \}, icon\('sliders'\), a\.rules \? 'Rules' : 'Set rules'\)/);
  assert.match(app, /const next = await onyx\.sheetPreview\(id, \{ tab, rules \}\);/);
  assert.match(app, /if \(\$\('\.sheet\.sr', \$\('#modal'\)\) && sheetRulesClose\) sheetRulesClose\(\);/, 'back goes back to Settings');
  const ops = [...app.matchAll(/\['(\w+)', '[^']+'\]/g)].map((m) => m[1]).filter((k) => rows.OPS.includes(k));
  assert.deepEqual([...new Set(ops)].sort(), [...rows.OPS].sort(), 'every kind of condition can be chosen');
  assert.match(css, /body\.mobile \.sheet\.sr\[data-show="rules"\] \.sr-right, body\.mobile \.sheet\.sr\[data-show="preview"\] \.sr-left \{ display: none; \}/);
  // The demo runs the PC's own rules, loaded as a script of the page.
  assert.match(read('src/renderer/mock.js'), /s\.src = new URL\('\.\.\/main\/providers\/sheet-rows\.js', location\.href\)\.href;/);
  assert.doesNotMatch(read('src/main/providers/sheet-rows.js'), /require\('(fs|os|zlib|path|\.\.\/net)'\)/, 'nothing that needs Node');
});
