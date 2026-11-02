// A live Excel sheet as a calendar (providers/sheet.js): workbooks read without a library, the rows
// turned into blocks under the usual headings, links that download the sheet, and a file read again
// when it is saved.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const sheet = require('../src/main/providers/sheet');

/** A zip (an .xlsx is one) of { name: text }, deflated or stored. */
function zip(files, deflate = true) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8');
    const data = deflate ? zlib.deflateRawSync(raw) : raw;
    const n = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** A workbook of tabs { name: rows }, its words kept as shared strings like Excel does. */
function workbook(tabs, { hidden = [], deflate = true } = {}) {
  const shared = [];
  const files = {};
  const names = Object.keys(tabs);
  names.forEach((name, t) => {
    const rows = tabs[name].map((row, r) => `<row r="${r + 1}">${row.map((v, c) => {
      if (v == null) return '';
      const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
      if (typeof v === 'number') return `<c r="${ref}" s="1"><v>${v}</v></c>`;
      if (typeof v === 'object' && v.inline) return `<c r="${ref}" t="inlineStr"><is><t>${esc(v.inline)}</t></is></c>`;
      shared.push(v);
      return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`;
    }).join('')}</row>`).join('');
    files[`xl/worksheets/sheet${t + 1}.xml`] = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });
  files['xl/workbook.xml'] = `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
    names.map((n, t) => `<sheet name="${esc(n)}" sheetId="${t + 1}"${hidden.includes(n) ? ' state="hidden"' : ''} r:id="rId${t + 1}"/>`).join('')}</sheets></workbook>`;
  files['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0"?><Relationships>${names.map((n, t) => `<Relationship Id="rId${t + 1}" Type="worksheet" Target="worksheets/sheet${t + 1}.xml"/>`).join('')}</Relationships>`;
  // An empty string and a rich-text one (two runs and a phonetic guide), as Excel writes them.
  files['xl/sharedStrings.xml'] = `<?xml version="1.0"?><sst>${shared.map((s) => (s === '' ? '<si/>' : s === 'Rich title'
    ? '<si><r><t>Rich </t></r><r><t>title</t></r><rPh><t>ignored</t></rPh></si>' : `<si><t>${esc(s)}</t></si>`)).join('')}</sst>`;
  return zip(files, deflate);
}

/** Excel's number for a day here (and a time of it). */
const serial = (y, m, d, h = 0, min = 0) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000 + (h * 60 + min) / 1440;
const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

test('an Excel workbook is read: words, Excel\'s dates and times, inline text, rich text', () => {
  const buf = workbook({ Plan: [
    ['Title', 'Date', 'Start', 'End', 'Notes'],
    ['Deep work', serial(2026, 11, 3), serial(2026, 1, 1, 9, 0) % 1, serial(2026, 1, 1, 11, 30) % 1, 'Chapter 4 & 5'],
    [{ inline: 'Gym' }, serial(2026, 11, 4), '6:30 pm', null, null],
    ['Rich title', serial(2026, 11, 5), null, null, ''],
  ] });
  const rows = sheet.readXlsx(buf);
  assert.equal(rows[1][0], 'Deep work');
  assert.equal(rows[1][4], 'Chapter 4 & 5');
  assert.equal(rows[2][0], 'Gym');
  assert.equal(rows[3][0], 'Rich title', 'the runs joined, without the phonetic guide');
  const { items } = sheet.toItems(rows);
  assert.deepEqual(items.map((i) => [i.title, i.start, i.end, i.allDay]), [
    ['Deep work', local(2026, 11, 3, 9), local(2026, 11, 3, 11, 30), false],
    ['Gym', local(2026, 11, 4, 18, 30), local(2026, 11, 4, 19, 30), false], // no end: an hour
    ['Rich title', '2026-11-05', '2026-11-06', true], // no time: all day
  ]);
  assert.equal(items[0].notes, 'Chapter 4 & 5');
});

test('stored (not deflated) workbooks read too, and the first tab shown is used unless one is named', () => {
  const tabs = { Old: [['Title', 'Date'], ['Old row', '2026-01-01']], Now: [['Title', 'Date'], ['New row', '2026-11-10']] };
  const buf = workbook(tabs, { hidden: ['Old'], deflate: false });
  assert.equal(sheet.toItems(sheet.readXlsx(buf)).items[0].title, 'New row');
  assert.equal(sheet.toItems(sheet.readXlsx(buf, 'old')).items[0].title, 'Old row');
  assert.throws(() => sheet.readXlsx(buf, 'Missing'), /no tab called "Missing".*"Old", "Now"/);
});

test('headings under their usual names, durations, past midnight, ranges of days, and rows without a date', () => {
  const { items, skipped } = sheet.toItems([
    ['My study plan'], // a title row above the headings
    ['Task', 'Day', 'Start time', 'Duration (min)', 'Where'],
    ['Arabic', '11/3/2026', '9:00 AM', 90, 'Library'],
    ['Night shift', '2026-11-03', '22:00', '', ''],
    ['Reading', 'Nov 4, 2026', '7pm', '1h30', ''],
    ['No date here', '', '9:00', '', ''],
    ['', '', '', '', ''],
  ]);
  assert.equal(skipped, 1);
  assert.deepEqual(items.map((i) => [i.title, i.start, i.end]), [
    ['Arabic', local(2026, 11, 3, 9), local(2026, 11, 3, 10, 30)],
    ['Night shift', local(2026, 11, 3, 22), local(2026, 11, 3, 23)],
    ['Reading', local(2026, 11, 4, 19), local(2026, 11, 4, 20, 30)],
  ]);
  assert.equal(items[0].location, 'Library');

  const late = sheet.toItems([['Title', 'Date', 'From', 'To'], ['Late', '2026-11-03', '22:00', '01:00']]).items[0];
  assert.equal(late.end, local(2026, 11, 4, 1), 'an end before the start is the next morning');
  const trip = sheet.toItems([['Title', 'Start date', 'End date'], ['Trip', '2026-11-10', '2026-11-12']]).items[0];
  assert.deepEqual([trip.allDay, trip.start, trip.end], [true, '2026-11-10', '2026-11-13'], 'all of its last day');
  const hours = sheet.toItems([['Title', 'Date', 'Start', 'Hours'], ['Long', '2026-11-03', '8:00', 2.5]]).items[0];
  assert.equal(hours.end, local(2026, 11, 3, 10, 30));
});

test('no headings: Title, Date, Start, End, Notes; and a date and time in one cell', () => {
  const { items } = sheet.toItems([
    ['Dentist', '2026-11-06 15:00', null, '16:15'],
    ['Call mum', serial(2026, 11, 7, 18, 0), null, null],
  ]);
  assert.deepEqual(items.map((i) => [i.title, i.start, i.end]), [
    ['Dentist', local(2026, 11, 6, 15), local(2026, 11, 6, 16, 15)],
    ['Call mum', local(2026, 11, 7, 18), local(2026, 11, 7, 19)],
  ]);
});

test('a row keeps its id while it says the same, so Onyx\'s notes and tags on it stay; an ID column wins', () => {
  const rows = [['Title', 'Date'], ['Gym', '2026-11-03'], ['Gym', '2026-11-03'], ['Swim', '2026-11-03']];
  const a = sheet.toItems(rows).items, b = sheet.toItems([...rows.slice(0, 1), ['New first row', '2026-11-01'], ...rows.slice(1)]).items;
  assert.equal(new Set(a.map((i) => i.rawId)).size, 3, 'two rows alike still get two ids');
  assert.deepEqual(b.slice(1).map((i) => i.rawId), a.map((i) => i.rawId), 'a row added above changes no other row\'s id');
  const byId = sheet.toItems([['ID', 'Title', 'Date'], [7, 'Gym', '2026-11-03']]).items[0];
  assert.equal(byId.rawId, 'id-7');
});

test('dates and times written the usual ways', () => {
  const now = new Date(2026, 10, 2);
  const day = (v, kind = 'date') => sheet.parseWhen(v, kind, now);
  assert.deepEqual(day('2026-11-03').day, { y: 2026, m: 11, d: 3 });
  assert.deepEqual(day('11/3/2026').day, { y: 2026, m: 11, d: 3 }, 'month first, as in the US');
  assert.deepEqual(day('25/12/2026').day, { y: 2026, m: 12, d: 25 }, 'unless it can only be day first');
  assert.deepEqual(day('3rd November').day, { y: 2026, m: 11, d: 3 }, 'no year: this year');
  assert.deepEqual(day('Tuesday, Nov 3 2026 9:30am'), { day: { y: 2026, m: 11, d: 3 }, min: 570 });
  assert.deepEqual(day('tomorrow').day, { y: 2026, m: 11, d: 3 });
  assert.equal(day('2/30/2026'), null, 'no such day');
  assert.equal(day('Dentist'), null);
  assert.equal(sheet.parseTime('12am'), 0);
  assert.equal(sheet.parseTime('12:15 PM'), 735);
  assert.equal(sheet.parseTime('9.30'), 570);
  assert.equal(sheet.parseTime('9'), null, 'a bare number is a time only in a time column');
  assert.equal(day('9', 'time').min, 540);
  assert.equal(day(14, 'time').min, 840);
  assert.equal(sheet.parseMinutes('1:30'), 90);
  assert.equal(sheet.parseMinutes('45 min'), 45);
  assert.equal(sheet.parseMinutes('1h30'), 90);
  assert.equal(sheet.parseMinutes('2 hours 15 minutes'), 135);
  assert.equal(sheet.parseMinutes(1.5, true), 90);
  assert.equal(sheet.parseMinutes(serial(2026, 1, 1, 2, 0) % 1), 120, 'a length Excel keeps as a time');
});

test('a .csv reads too: quotes, commas inside them, semicolons, a BOM', () => {
  const rows = sheet.readCsv('\uFEFFTitle,Date,Notes\r\n"Meet, then lunch",2026-11-03,"She said ""hi"""\r\n');
  assert.deepEqual(rows[1], ['Meet, then lunch', '2026-11-03', 'She said "hi"']);
  assert.deepEqual(sheet.readCsv('Title;Date\nA;3/11/2026')[1], ['A', '3/11/2026']);
  assert.throws(() => sheet.readRows(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])), /old \.xls/);
});

test('links download the sheet itself: Google Sheets (a tab by its gid), published sheets, OneDrive, SharePoint', () => {
  assert.deepEqual(sheet.downloadUrls('https://docs.google.com/spreadsheets/d/AbC-123_x/edit?usp=sharing'),
    ['https://docs.google.com/spreadsheets/d/AbC-123_x/export?format=xlsx']);
  assert.deepEqual(sheet.downloadUrls('https://docs.google.com/spreadsheets/d/AbC/edit#gid=42'),
    ['https://docs.google.com/spreadsheets/d/AbC/export?format=csv&gid=42']);
  assert.deepEqual(sheet.downloadUrls('https://docs.google.com/spreadsheets/d/e/2PACX-1v/pubhtml'),
    ['https://docs.google.com/spreadsheets/d/e/2PACX-1v/pub?output=xlsx']);
  const od = sheet.downloadUrls('https://1drv.ms/x/s!AbcDef');
  assert.equal(od[0], `https://api.onedrive.com/v1.0/shares/u!${Buffer.from('https://1drv.ms/x/s!AbcDef').toString('base64url')}/root/content`);
  assert.equal(od[1], 'https://1drv.ms/x/s!AbcDef?download=1');
  assert.deepEqual(sheet.downloadUrls('https://contoso-my.sharepoint.com/:x:/g/personal/me/EaBc?e=xyz'),
    ['https://contoso-my.sharepoint.com/:x:/g/personal/me/EaBc?e=xyz&download=1']);
  assert.deepEqual(sheet.downloadUrls('https://example.com/plan.csv'), ['https://example.com/plan.csv']);
});

test('a file on this PC: its blocks in a range, a row added shows up once it is saved, and the poller says so', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-sheet-'));
  const file = path.join(dir, 'plan.xlsx');
  const write = (rows, at) => { fs.writeFileSync(file, workbook({ Sheet1: rows })); fs.utimesSync(file, at, at); };
  const head = ['Title', 'Date', 'Start', 'Duration'];
  write([head, ['First', '2026-11-03', '9:00', 30]], new Date(2026, 0, 1));
  const acct = { id: 'stest', provider: 'sheet', label: 'Plan', path: file, host: os.hostname() };
  const range = [new Date(2026, 10, 1).toISOString(), new Date(2026, 10, 30).toISOString()];
  let got = await sheet.events(acct, ...range);
  assert.deepEqual(got.map((e) => e.title), ['First']);
  assert.ok(!('from' in got[0]), 'only what a calendar entry has');
  assert.equal((await sheet.events(acct, new Date(2026, 11, 1).toISOString(), new Date(2026, 11, 30).toISOString())).length, 0);

  const changed = [];
  sheet.start(() => [acct], (a) => changed.push(a.id), 40);
  write([head, ['First', '2026-11-03', '9:00', 30], ['Added later', '2026-11-04', '10:00', 60]], new Date(2026, 0, 2));
  for (let i = 0; i < 80 && !changed.length; i++) await new Promise((r) => setTimeout(r, 50));
  sheet.stop();
  assert.deepEqual(changed, ['stest'], 'told once the saved file has a new row');
  got = await sheet.events(acct, ...range);
  assert.deepEqual(got.map((e) => e.title), ['First', 'Added later']);
  assert.equal(sheet.status('stest').blocks, 2);

  // Excel holding the file mid-save: what was read last stays.
  fs.writeFileSync(file, 'PK not really a workbook');
  fs.utimesSync(file, new Date(2026, 0, 3), new Date(2026, 0, 3));
  assert.equal((await sheet.events(acct, ...range)).length, 2);
  assert.match(sheet.status('stest').error, /not a readable \.xlsx/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a file chosen on another linked PC, not on this one, shows nothing rather than an error', async () => {
  const acct = { id: 'selse', provider: 'sheet', label: 'Elsewhere', path: path.join(os.tmpdir(), 'no-such-dir-onyx', 'x.xlsx'), host: 'some-other-pc' };
  assert.deepEqual(await sheet.events(acct, '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z'), []);
  await assert.rejects(sheet.events({ ...acct, id: 'shere', host: os.hostname() }, '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z'), /is no longer at/);
});

test('the phone adds a sheet by link only: a file path is taken only from the PC\'s own file picker', () => {
  const api = fs.readFileSync(path.join(__dirname, '../src/main/api.js'), 'utf8');
  const line = api.split('\n').find((l) => l.includes("'sheet:add'"));
  assert.ok(line, 'sheet:add is a command');
  assert.doesNotMatch(line, /path/);
  const main = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8');
  assert.match(main, /'sheet:pick': async[\s\S]*?showOpenDialog[\s\S]*?addSheet\(\{[^}]*path: res\.filePaths\[0\]/);
});
