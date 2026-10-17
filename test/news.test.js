// The News panel: each channel's YouTube Videos page, merged newest first, against a
// stand-in for YouTube; and the news in the language Tamkeen is teaching.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../src/main/store');
const news = require('../src/main/news');

store.save = () => {};

// A Videos page as YouTube sends it: the data in `var ytInitialData = {...};`.
const lockup = (id, title, parts, live = false) => ({
  richItemRenderer: { content: { lockupViewModel: {
    contentId: id, contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
    contentImage: { thumbnailViewModel: { overlays: [{ badges: [{ text: live ? 'LIVE' : '5:24' }] }] } },
    metadata: { lockupMetadataViewModel: {
      title: { content: title },
      metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: parts.map((p) => ({ text: { content: p } })) }] } },
    } },
  } } },
});
const page = (name, id, items) => `<html><script>var ytInitialData = ${JSON.stringify({
  metadata: { channelMetadataRenderer: { title: name, externalId: id } },
  contents: { tabs: [{ tabRenderer: { content: { richGridRenderer: { contents: items } } } }] },
})};</script></html>`;

const PAGES = {
  UCaaaaaaaaaaaaaaaaaaaaaa: page('Alpha News', 'UCaaaaaaaaaaaaaaaaaaaaaa', [
    lockup('AAAAAAAAAA1', 'Storm & floods: what we know', ['12K', '5h ago']),
    lockup('AAAAAAAAAA2', 'Coming up tonight', ['Scheduled for 10/17/26']),
  ]),
  UCbbbbbbbbbbbbbbbbbbbbbb: page('Beta TV', 'UCbbbbbbbbbbbbbbbbbbbbbb', [
    lockup('BBBBBBBBBB1', "Markets 'rally'", ['2.3K', '1h ago']),
    lockup('BBBBBBBBBB2', 'Live: the summit', ['5K watching'], true),
  ]),
  UCdddddddddddddddddddddd: page('قناة', 'UCdddddddddddddddddddddd', [
    lockup('DDDDDDDDDD1', 'أخبار اليوم', ['1.3 ألف', 'قبل ساعتين']),
  ]),
};

function fakeYouTube() {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url, lang: opts.headers?.['Accept-Language'] });
    const id = (url.match(/\/channel\/(UC[\w-]{22})\/videos/) || [])[1];
    if (id && PAGES[id]) return { ok: true, status: 200, text: async () => PAGES[id] };
    if (url.endsWith('/@betatv/videos')) return { ok: true, status: 200, text: async () => PAGES.UCbbbbbbbbbbbbbbbbbbbbbb };
    return { ok: false, status: 404, text: async () => '' };
  };
  return calls;
}

test('a Videos page gives its videos with their age; upcoming ones are left out', () => {
  const now = Date.parse('2026-10-17T12:00:00Z');
  const items = news.parsePage(PAGES.UCbbbbbbbbbbbbbbbbbbbbbb, { id: 'UCbbbbbbbbbbbbbbbbbbbbbb', name: 'Beta TV' }, now);
  assert.deepEqual(items.map((s) => [s.id, s.title, s.published, s.views, !!s.live]), [
    ['BBBBBBBBBB1', "Markets 'rally'", '2026-10-17T11:00:00.000Z', 2300, false],
    ['BBBBBBBBBB2', 'Live: the summit', '2026-10-17T12:00:00.000Z', 5000, true],
  ]);
  assert.equal(news.parsePage(PAGES.UCaaaaaaaaaaaaaaaaaaaaaa, { id: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: 'Alpha News' }).length, 1);
});

test('ages and view counts are read in every language Tamkeen teaches', () => {
  const H = 3600000, M = 60000, D = 86400000;
  for (const [text, ms] of [
    ['4h ago', 4 * H], ['Streamed 2 days ago', 2 * D], ['قبل 7 دقائق', 7 * M], ['قبل ساعتين', 2 * H], ['قبل ساعة واحدة', H],
    ['hace 3 h', 3 * H], ['il y a 3 jours', 3 * D], ['28 分前', 28 * M], ['18小时前', 18 * H], ['1 дн. назад', D],
    ['8 h fa', 8 * H], ['1 oras ang nakalipas', H],
  ]) assert.equal(news.ageMs(text), ms, text);
  assert.equal(news.ageMs('1,3 K'), null);
  for (const [text, n] of [['2.3K', 2300], ['1,3 K', 1300], ['1.3万', 13000], ['35 тыс.', 35000], ['1.3 ألف', 1300], ['15,204 views', 15204]]) {
    assert.equal(news.viewCount(text), n, text);
  }
});

test('stories from the channels switched on are merged newest first, and cached', async () => {
  const calls = fakeYouTube();
  store.data.news = { channels: [
    { id: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: 'Alpha News', on: true },
    { id: 'UCbbbbbbbbbbbbbbbbbbbbbb', name: 'Beta TV', on: true },
    { id: 'UCcccccccccccccccccccccc', name: 'Gone', on: false },
  ] };
  const res = await news.list(true);
  assert.deepEqual(res.stories.map((s) => s.title), ['Live: the summit', "Markets 'rally'", 'Storm & floods: what we know']);
  assert.deepEqual(res.errors, []);
  const before = calls.length;
  await news.list();
  assert.equal(calls.length, before, 'a second look within minutes uses the cache');
});

test('channels are added from a link or @handle, switched and removed', async () => {
  fakeYouTube();
  store.data.news = { channels: [] };
  let list = await news.addChannel('https://www.youtube.com/@betatv');
  assert.deepEqual(list.map((c) => [c.id, c.name, c.on]), [['UCbbbbbbbbbbbbbbbbbbbbbb', 'Beta TV', true]]);
  list = await news.addChannel('https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(list[1].name, 'Alpha News');
  assert.equal(news.setChannel('UCaaaaaaaaaaaaaaaaaaaaaa', false)[1].on, false);
  assert.equal(news.removeChannel('UCbbbbbbbbbbbbbbbbbbbbbb').length, 1);
  await assert.rejects(news.addChannel('@nobody-here'), /no YouTube channel/);
  await assert.rejects(news.addChannel('not a channel!'), /channel link or its @handle/);
  assert.equal(news.resetChannels().length, news.DEFAULT_CHANNELS.length);
});

test('with Tamkeen, the news comes from channels in the language it teaches, in that language', async () => {
  // A stand-in for Tamkeen's data folder, with its settings table.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-tamkeen-'));
  fs.mkdirSync(path.join(home, 'ArabicPodcastStudio'));
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(home, 'ArabicPodcastStudio', 'library.db'));
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT); INSERT INTO settings VALUES ('study_language', '\"ar\"');");
  db.close();
  const saved = process.env.APPDATA;
  process.env.APPDATA = home;
  const arabic = news.LANGUAGES.ar.channels;
  news.LANGUAGES.ar.channels = [{ id: 'UCdddddddddddddddddddddd', name: 'قناة' }];
  try {
    const calls = fakeYouTube();
    assert.equal(news.tamkeenLanguage(), 'ar');
    const res = await news.list(true, { tamkeen: true });
    assert.deepEqual(res.language, { code: 'ar', name: 'Arabic' });
    assert.deepEqual(res.stories.map((s) => [s.title, s.views]), [['أخبار اليوم', 1300]]);
    assert.ok(calls.some((c) => c.url.includes('hl=ar') && c.lang === 'ar'), 'asked for in Arabic, so the titles are the originals');
    const usual = await news.list(true);
    assert.equal(usual.language, null);
  } finally {
    news.LANGUAGES.ar.channels = arabic;
    process.env.APPDATA = saved;
  }
});
