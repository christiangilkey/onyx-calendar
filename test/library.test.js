// Notes and pinned Notion / Drive items on the globe, and the Notion and Drive
// searches, run against stand-ins for their APIs.

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const accounts = require('../src/main/accounts');
const library = require('../src/main/library');
const hub = require('../src/main/hub');
const notion = require('../src/main/providers/notion');
const drive = require('../src/main/providers/drive');

store.save = () => {};

function reset() {
  Object.assign(store.data, { notes: [], pins: [], tags: {}, tagColors: {}, accounts: [], notion: null });
  store.data.secrets.notionToken = '';
}

test('notes carry tags and can be edited and deleted', () => {
  reset();
  const note = library.createNote({ title: '  Lease questions ', body: 'pets?', tags: ['home', '#Admin'] });
  assert.match(note.id, /^note\/[0-9a-f]+$/);
  assert.equal(note.title, 'Lease questions');
  assert.deepEqual(note.tags, ['home', 'Admin']);
  assert.equal(library.createNote({}).title, 'Untitled note');

  const edited = library.updateNote(note.id, { body: 'pets and parking', tags: ['home'] });
  assert.equal(edited.body, 'pets and parking');
  assert.deepEqual(edited.tags, ['home']);
  assert.deepEqual(hub.allTags().map((t) => t.name), ['home']);

  library.deleteNote(note.id);
  assert.equal(library.listNotes().length, 1);
  assert.deepEqual(hub.allTags(), []);
  assert.throws(() => library.updateNote(note.id, { body: 'x' }), /no longer exists/);
});

test('pinning the same document twice updates it instead of adding a copy', () => {
  reset();
  library.addPin({ source: 'notion', ref: 'abc', title: 'Plan', url: 'https://www.notion.so/abc', kind: 'page', tags: ['study'] });
  const again = library.addPin({ source: 'notion', ref: 'abc', title: 'Plan (renamed)', url: 'https://www.notion.so/abc', kind: 'page' });
  assert.equal(library.listPins().length, 1);
  assert.equal(again.title, 'Plan (renamed)');
  assert.deepEqual(again.tags, ['study']);
  assert.deepEqual(library.updatePin(again.id, { tags: ['study', 'goals'] }).tags, ['study', 'goals']);

  assert.throws(() => library.addPin({ source: 'dropbox', ref: 'x', url: 'https://x' }), /Unknown source/);
  assert.throws(() => library.addPin({ source: 'drive', ref: 'x', url: 'javascript:alert(1)' }), /https/);

  library.removePin(again.id);
  assert.deepEqual(library.globeItems(), { notes: [], pins: [] });
  assert.deepEqual(hub.allTags(), []);
});

test('Notion search turns pages and databases into pinnable results', async () => {
  reset();
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    if (url.endsWith('/users/me')) return { ok: true, status: 200, json: async () => ({ name: 'Onyx', bot: { workspace_name: 'Home' } }) };
    return {
      ok: true, status: 200,
      json: async () => ({ results: [
        { object: 'page', id: 'p1', url: 'https://www.notion.so/p1', icon: { type: 'emoji', emoji: '📚' }, last_edited_time: '2026-10-01T00:00:00Z',
          properties: { Name: { type: 'title', title: [{ plain_text: 'Study ' }, { plain_text: 'plan' }] } } },
        { object: 'database', id: 'd1', url: 'https://www.notion.so/d1', title: [{ plain_text: 'Reading list' }], properties: {} },
        { object: 'page', id: 'gone', url: 'https://www.notion.so/gone', archived: true, properties: {} },
      ] }),
    };
  };
  try {
    await assert.rejects(notion.search('x'), /Connect Notion first/);
    assert.deepEqual(await notion.connect(' ntn_secret '), { name: 'Onyx', workspace: 'Home' });
    assert.equal(store.data.secrets.notionToken, 'ntn_secret');
    const results = await notion.search('study');
    assert.deepEqual(results.map((r) => [r.title, r.kind, r.icon]), [['Study plan', 'page', '📚'], ['Reading list', 'database', '']]);
    const last = calls.at(-1);
    assert.equal(last.opts.headers.Authorization, 'Bearer ntn_secret');
    assert.equal(JSON.parse(last.opts.body).query, 'study');
    notion.disconnect();
    assert.equal(notion.info().connected, false);
  } finally {
    global.fetch = realFetch;
  }
});

test('Drive search covers every Google account and explains a missing permission', async () => {
  reset();
  await assert.rejects(drive.search(''), /Connect a Google account/);
  store.data.accounts = [{ id: 'g1', provider: 'google', label: 'a@x.com' }, { id: 'g2', provider: 'google', label: 'b@x.com' }];
  const realRequest = accounts.request;
  const urls = [];
  accounts.request = async (acct, url) => {
    urls.push(url);
    if (acct.id === 'g2') throw Object.assign(new Error('b@x.com: insufficient scopes'), { status: 403 });
    return { files: [
      { id: 'f1', name: "Q4 'budget'", mimeType: 'application/vnd.google-apps.spreadsheet', webViewLink: 'https://docs.google.com/f1', modifiedTime: '2026-10-02T00:00:00Z' },
      { id: 'f2', name: 'scan.pdf', mimeType: 'application/pdf', webViewLink: 'https://drive.google.com/f2', modifiedTime: '2026-10-05T00:00:00Z' },
      { id: 'f3', name: 'no link' },
    ] };
  };
  try {
    const results = await drive.search("Q4 'budget'");
    assert.deepEqual(results.map((r) => [r.title, r.kind, r.account]), [['scan.pdf', 'pdf', 'a@x.com'], ["Q4 'budget'", 'sheet', 'a@x.com']]);
    assert.equal(new URL(urls[0]).searchParams.get('q'), "trashed = false and name contains 'Q4 \\'budget\\''");

    accounts.request = async () => { throw Object.assign(new Error('nope'), { status: 403 }); };
    await assert.rejects(drive.search(''), /sign in with Google again/);
  } finally {
    accounts.request = realRequest;
  }
});
