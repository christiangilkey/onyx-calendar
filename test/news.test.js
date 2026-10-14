// The News panel: YouTube channel feeds, merged newest first, against a stand-in for YouTube.
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const news = require('../src/main/news');

store.save = () => {};

const entry = (id, title, published, short = false) => `<entry>
  <id>yt:video:${id}</id><yt:videoId>${id}</yt:videoId><title>${title}</title>
  <link rel="alternate" href="https://www.youtube.com/${short ? 'shorts/' : 'watch?v='}${id}"/>
  <published>${published}</published>
  <media:group><media:community><media:statistics views="1234"/></media:community></media:group>
</entry>`;
const feed = (name, entries) => `<?xml version="1.0"?><feed><title>${name}</title><author><name>${name}</name></author>${entries.join('')}</feed>`;

const FEEDS = {
  UCaaaaaaaaaaaaaaaaaaaaaa: feed('Alpha News', [
    entry('AAAAAAAAAA1', 'Storm &amp; floods: what we know', '2026-10-14T12:00:00+00:00'),
    entry('AAAAAAAAAA2', 'A short clip', '2026-10-14T13:00:00+00:00', true),
  ]),
  UCbbbbbbbbbbbbbbbbbbbbbb: feed('Beta TV', [entry('BBBBBBBBBB1', 'Markets &#39;rally&#39;', '2026-10-14T15:00:00+00:00')]),
};

function fakeYouTube() {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    const id = new URL(url).searchParams.get('channel_id');
    if (id && FEEDS[id]) return { ok: true, status: 200, text: async () => FEEDS[id] };
    if (url.endsWith('/@betatv')) return { ok: true, status: 200, text: async () => '<link rel="canonical" href="https://www.youtube.com/channel/UCbbbbbbbbbbbbbbbbbbbbbb">' };
    return { ok: false, status: 404, text: async () => '' };
  };
  return calls;
}

test('a feed gives its videos, without Shorts, with titles decoded', () => {
  const items = news.parseFeed(FEEDS.UCaaaaaaaaaaaaaaaaaaaaaa, { id: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: 'Alpha News' });
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Storm & floods: what we know');
  assert.equal(items[0].channel, 'Alpha News');
  assert.equal(items[0].views, 1234);
  assert.equal(items[0].thumb, 'https://i.ytimg.com/vi/AAAAAAAAAA1/mqdefault.jpg');
});

test('stories from the channels switched on are merged newest first, and cached', async () => {
  const calls = fakeYouTube();
  store.data.news = { channels: [
    { id: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: 'Alpha News', on: true },
    { id: 'UCbbbbbbbbbbbbbbbbbbbbbb', name: 'Beta TV', on: true },
    { id: 'UCcccccccccccccccccccccc', name: 'Gone', on: false },
  ] };
  const res = await news.list(true);
  assert.deepEqual(res.stories.map((s) => s.title), ["Markets 'rally'", 'Storm & floods: what we know']);
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
