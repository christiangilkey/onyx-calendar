// Reading for Magic add and Magic goal: a webpage, a Notion page or a picture, each into plain text.
// The network is stood in for: a fake fetch answers as the site, Notion or Claude would.

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const sources = require('../src/main/sources');
const { schedule, normalizeTasks } = require('../src/main/magic-plan');
const goalPlan = require('../src/main/goal-plan');

store.save = () => {};

const withFetch = (impl, fn) => async () => {
  const real = global.fetch;
  global.fetch = impl;
  try { await fn(); } finally { global.fetch = real; }
};
const page = (html, { status = 200, type = 'text/html; charset=utf-8', url = '' } = {}) => ({
  status, ok: status >= 200 && status < 300, url,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? type : null) },
  arrayBuffer: async () => new TextEncoder().encode(html).buffer,
});
const json = (body, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

const GUIDE = `<!doctype html><html><head><title>Ignored title</title><meta property="og:title" content="Desk assembly &amp; setup">
<style>.x{color:red}</style><script>var tracking = "do not read";</script></head><body>
<nav><a href="/">Home</a><a href="/shop">Shop</a></nav>
<article><h1>Assemble your desk</h1><p>You need a 5&nbsp;mm hex key. Allow about an hour.</p>
<h2>Steps</h2><ol><li>Unbox the frame &mdash; check the parts list</li><li>Attach the legs (4 bolts each)</li><li>Fix the top &amp; plug in the controller</li></ol>
<p>${'Keep the bolts finger-tight until the frame is square. '.repeat(12)}</p></article>
<footer>© Desk Co. All rights reserved.</footer></body></html>`;

test('a webpage becomes its readable text: the article, its headings and steps, no menus, scripts or footer', () => {
  const { title, text } = sources.htmlToText(GUIDE);
  assert.equal(title, 'Desk assembly & setup');
  assert.match(text, /^# Assemble your desk/m);
  assert.match(text, /^## Steps/m);
  assert.match(text, /^- Unbox the frame — check the parts list$/m);
  assert.match(text, /^- Fix the top & plug in the controller$/m);
  assert.match(text, /5 mm hex key/);
  assert.doesNotMatch(text, /tracking|Shop|All rights reserved|color:red/);
});

test('Notion links give their page id; other links are not Notion', () => {
  const id = (u) => sources.notionPageId(new URL(u));
  assert.equal(id('https://www.notion.so/team/Desk-Plan-0123456789abcdef0123456789abcdef'), '01234567-89ab-cdef-0123-456789abcdef');
  assert.equal(id('https://someone.notion.site/0123456789abcdef0123456789ABCDEF?pvs=4'), '01234567-89ab-cdef-0123-456789abcdef');
  assert.equal(id('https://www.notion.so/My-Page-01234567-89ab-cdef-0123-456789abcdef'), '01234567-89ab-cdef-0123-456789abcdef');
  assert.equal(id('https://www.notion.so/login'), null);
  assert.equal(id('https://example.com/0123456789abcdef0123456789abcdef'), null);
});

test('reading a webpage: fetched like a browser, its text and word count back', withFetch(async (url, init) => {
  assert.equal(url, 'https://example.com/desk');
  assert.match(init.headers['User-Agent'], /Mozilla/);
  return page(GUIDE, { url: 'https://example.com/desk' });
}, async () => {
  const r = await sources.read({ kind: 'link', url: 'example.com/desk' });
  assert.equal(r.kind, 'web');
  assert.equal(r.title, 'Desk assembly & setup');
  assert.equal(r.url, 'https://example.com/desk');
  assert.ok(r.words > 50);
  assert.equal(r.cut, false);
}));

test('pages that can\'t be read say why and what to do instead', async () => {
  const real = global.fetch;
  try {
    global.fetch = async () => page('', { status: 403 });
    await assert.rejects(sources.read({ kind: 'link', url: 'https://example.com/members' }), /sign-in.*screenshot/);
    global.fetch = async () => page('%PDF-1.7', { type: 'application/pdf' });
    await assert.rejects(sources.read({ kind: 'link', url: 'https://example.com/guide.pdf' }), /PDF/);
    global.fetch = async () => page('<html><body><div id="root"></div><script src="app.js"></script></body></html>');
    await assert.rejects(sources.read({ kind: 'link', url: 'https://app.example.com' }), /couldn't find text/);
    await assert.rejects(sources.read({ kind: 'link', url: 'ftp://example.com/file' }), /http/);
    await assert.rejects(sources.read({ kind: 'other' }), /link or a picture/);
  } finally { global.fetch = real; }
});

test('a very long page is kept to its first part', withFetch(async () => page(`<html><body><main><p>${'word '.repeat(12000)}</p></main></body></html>`), async () => {
  const r = await sources.read({ kind: 'link', url: 'https://example.com/long' });
  assert.equal(r.cut, true);
  assert.ok(r.text.length <= sources.MAX_TEXT);
}));

test('reading a Notion page: through the person\'s own connection, nested blocks and all', withFetch(async (url, init) => {
  assert.equal(init.headers.Authorization, 'Bearer secret_test');
  if (url.endsWith('/pages/01234567-89ab-cdef-0123-456789abcdef')) {
    return json({ object: 'page', url: 'https://www.notion.so/Desk-0123', properties: { Name: { type: 'title', title: [{ plain_text: 'Desk plan' }] } } });
  }
  const rt = (t) => ({ rich_text: [{ plain_text: t }] });
  if (url.includes('/blocks/01234567-89ab-cdef-0123-456789abcdef/children') && !url.includes('start_cursor')) {
    return json({ results: [
      { id: 'h', type: 'heading_2', heading_2: rt('Build'), has_children: false },
      { id: 'n1', type: 'numbered_list_item', numbered_list_item: rt('Cut the boards'), has_children: true },
    ], has_more: true, next_cursor: 'c2' });
  }
  if (url.includes('start_cursor=c2')) {
    return json({ results: [
      { id: 'n2', type: 'numbered_list_item', numbered_list_item: rt('Sand the edges'), has_children: false },
      { id: 't', type: 'to_do', to_do: { ...rt('Buy screws'), checked: true }, has_children: false },
    ], has_more: false });
  }
  if (url.includes('/blocks/n1/children')) return json({ results: [{ id: 'b', type: 'bulleted_list_item', bulleted_list_item: rt('Measure twice'), has_children: false }], has_more: false });
  throw new Error(`unexpected ${url}`);
}, async () => {
  store.data.secrets.notionToken = 'secret_test';
  const r = await sources.read({ kind: 'link', url: 'https://www.notion.so/Desk-plan-0123456789abcdef0123456789abcdef' });
  assert.equal(r.kind, 'notion');
  assert.equal(r.title, 'Desk plan');
  assert.equal(r.text, '## Build\n1. Cut the boards\n  - Measure twice\n2. Sand the edges\n- [x] Buy screws');
}));

test('a Notion page Onyx can\'t see, or no Notion connection, says how to fix it', async () => {
  const real = global.fetch;
  try {
    store.data.secrets.notionToken = 'secret_test';
    global.fetch = async () => json({ message: 'Could not find page with ID: 0123.' }, 404);
    await assert.rejects(sources.read({ kind: 'link', url: 'https://www.notion.so/0123456789abcdef0123456789abcdef' }), /Connections/);
    store.data.secrets.notionToken = '';
    await assert.rejects(sources.read({ kind: 'link', url: 'https://www.notion.so/0123456789abcdef0123456789abcdef' }), /connect Notion/);
  } finally { global.fetch = real; }
});

test('a picture is written out by Claude with the person\'s key: its title, then its contents', async () => {
  const real = global.fetch;
  try {
    store.data.secrets.anthropicKey = '';
    await assert.rejects(sources.read({ kind: 'image', data: 'AAAA', type: 'image/jpeg' }), /Claude key/);
    store.data.secrets.anthropicKey = 'sk-ant-test-key-0000000000000000';
    await assert.rejects(sources.read({ kind: 'image', data: 'AAAA', type: 'application/pdf' }), /JPEG/);
    let body = null, headers = null;
    global.fetch = async (url, init) => {
      body = JSON.parse(init.body); headers = init.headers;
      return json({ content: [{ type: 'text', text: '# Desk steps\n\n1. Unbox the frame\n2. Attach the legs' }] });
    };
    const r = await sources.read({ kind: 'image', data: 'iVBORw0KGgo=', type: 'image/png' });
    assert.equal(headers['x-api-key'], 'sk-ant-test-key-0000000000000000');
    assert.ok(!JSON.stringify(body).includes('sk-ant'), 'the key is never in the body');
    const [img, ask] = body.messages[0].content;
    assert.deepEqual(img, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } });
    assert.match(ask.text, /instructions/);
    assert.equal(r.kind, 'image');
    assert.equal(r.title, 'Desk steps');
    assert.equal(r.text, '1. Unbox the frame\n2. Attach the legs');
    global.fetch = async () => json({ content: [{ type: 'text', text: 'NOTHING TO READ' }] });
    await assert.rejects(sources.read({ kind: 'image', data: 'iVBORw0KGgo=', type: 'image/png' }), /nothing to read/);
  } finally { global.fetch = real; store.data.secrets.anthropicKey = ''; }
});

test('what goes to Claude: at most four sources, sharing the room', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ title: `Page ${i + 1}`, url: `https://example.com/${i}`, kind: 'web', text: 'x'.repeat(50000) }));
  const sent = sources.forPrompt(many, 60000);
  assert.equal(sent.length, 4);
  assert.ok(sent.every((s) => s.text.length === 15000));
  assert.deepEqual(sources.forPrompt([{ title: 'Bad', url: 'javascript:alert(1)', text: 'hi' }]).map((s) => s.url), ['']);
  assert.match(sources.promptBlock(sent.slice(0, 2)), /^Material 1: Page 1 \(https:\/\/example\.com\/0\)\nx+\n\nMaterial 2: Page 2/);
});

// ---------------------------------------------------------------- the steps of something read, planned in order

const DAY = new Date(2026, 10, 3);
const at = (h, m = 0) => new Date(2026, 10, 3, h, m).getTime();
const hm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

test('steps read from one page are planned in their order, even when a longer one would usually go first', () => {
  const tasks = normalizeTasks([
    { title: 'Unbox', minutes: 15, chain: 'm1', step: 1 },
    { title: 'Assemble the frame', minutes: 90, chain: 'm1', step: 2, notes: 'Use the 5 mm key' },
    { title: 'Plug in and reset', minutes: 10, chain: 'm1', step: 3 },
    { title: 'Write the report', minutes: 120, kind: 'focus' },
  ]);
  assert.equal(tasks[1].notes, 'Use the 5 mm key');
  // Free 09:00-10:00 and 10:30-17:00.
  const busy = [{ start: at(10), end: at(10, 30), title: 'Call' }];
  const { blocks, unplaced } = schedule(busy, tasks, { day: DAY, from: at(9), to: at(17), home: null, travel: false, lunch: false });
  assert.equal(unplaced.length, 0);
  const of = (t) => blocks.find((b) => b.title === t);
  assert.ok(of('Unbox').end <= of('Assemble the frame').start, 'step 1 before step 2');
  assert.ok(of('Assemble the frame').end <= of('Plug in and reset').start, 'step 2 before step 3');
  assert.equal(of('Assemble the frame').notes, 'Use the 5 mm key');
});

test('when a step does not fit, the steps after it wait for another day', () => {
  const tasks = normalizeTasks([
    { title: 'Prime the walls', minutes: 60, chain: 'm1', step: 1 },
    { title: 'Paint the walls', minutes: 240, chain: 'm1', step: 2, kind: 'errand' },
    { title: 'Put the furniture back', minutes: 30, chain: 'm1', step: 3 },
  ]);
  const { blocks, unplaced } = schedule([], tasks, { day: DAY, from: at(9), to: at(12), home: null, travel: false, lunch: false });
  assert.deepEqual(blocks.map((b) => b.title), ['Prime the walls']);
  assert.deepEqual(unplaced.map((u) => [u.task.title, u.reason]), [
    ['Paint the walls', 'Longer than any free stretch in the window'],
    ['Put the furniture back', 'Comes after a step that did not fit'],
  ]);
  assert.equal(hm(blocks[0].start), '09:00');
});

test('a step split into sittings keeps its place in the order', () => {
  const tasks = normalizeTasks([
    { title: 'Read chapter 1', minutes: 120, chain: 'm1', step: 1, kind: 'focus' },
    { title: 'Do the exercises', minutes: 30, chain: 'm1', step: 2 },
  ]);
  // Two free hours, a break, then two more: chapter 1 goes in two sittings, the exercises after both.
  const busy = [{ start: at(10), end: at(11), title: 'Meeting' }, { start: at(12), end: at(13), title: 'Gym' }];
  const { blocks } = schedule(busy, tasks, { day: DAY, from: at(9), to: at(14), home: null, travel: false, lunch: false });
  const ex = blocks.find((b) => b.title === 'Do the exercises');
  for (const b of blocks.filter((x) => x.title.startsWith('Read chapter 1'))) assert.ok(b.end <= ex.start, `${b.title} before the exercises`);
});

test('Magic goal: attached material goes to Claude, numbered, after the outline', () => {
  const msg = goalPlan.userMessage({ title: 'Learn woodworking', start: '2026-11-01', end: '2027-02-01', today: '2026-11-01', outline: 'Weekends only',
    material: [{ title: 'Beginner course', url: 'https://example.com/course', kind: 'web', text: '# Module 1\n- Safety' }, { title: 'Sketch', url: '', kind: 'image', text: 'Shelf plan' }] });
  assert.match(msg, /Their outline[\s\S]*Weekends only[\s\S]*Material 1: Beginner course \(https:\/\/example\.com\/course\)\n# Module 1\n- Safety\n\nMaterial 2: Sketch \(from a picture\)\nShelf plan/);
  assert.match(goalPlan.SYSTEM, /attach material/);
});
