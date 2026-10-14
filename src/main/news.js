// The News panel: the latest videos from news channels on YouTube, read from each
// channel's public feed (no API key), newest first. Channels can be switched on and off,
// and any YouTube channel can be added by its link or @handle.

const store = require('./store');

const FEED = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const CACHE_MS = 8 * 60 * 1000;
const MAX_STORIES = 80;
const MAX_CHANNELS = 30;

// `live`: the channel runs a 24/7 stream that YouTube lets other apps embed.
const DEFAULT_CHANNELS = [
  { id: 'UC16niRr50-MSBwiO3YDb3RA', name: 'BBC News', on: true },
  { id: 'UChqUTb7kYRX8-EiaN3XFrSQ', name: 'Reuters', on: true },
  { id: 'UC52X5wxOL_s5yw0dQk7NtgA', name: 'Associated Press', on: true },
  { id: 'UCeY0bbntWzzVIaj2z3QigXg', name: 'NBC News', on: true, live: true },
  { id: 'UC8p1vwvWtl6T73JiExfWs1g', name: 'CBS News', on: true, live: true },
  { id: 'UCNye-wNBqNL5ZzHSJj3l8Bg', name: 'Al Jazeera English', on: true, live: true },
  { id: 'UCupvZG-5ko_eiXAupbDfxWw', name: 'CNN', on: false },
  { id: 'UCBi2mrWuNuyYy4gbM6fU18Q', name: 'ABC News', on: false },
  { id: 'UCXIJgqnII2ZOINSWNOGFThA', name: 'Fox News', on: false },
  { id: 'UCoMdktPbSTixAyNGwb-UYkQ', name: 'Sky News', on: false },
  { id: 'UC6ZFN9Tx6xh-skXCuRHCDpQ', name: 'PBS NewsHour', on: false },
  { id: 'UCknLrEdhRCp1aegoMqRaCZg', name: 'DW News', on: false, live: true },
  { id: 'UCQfwfsi5VrQ8yKZ-UWmAEFg', name: 'FRANCE 24 English', on: false, live: true },
  { id: 'UCIALMKvObZNtJ6AmdCLP7Lg', name: 'Bloomberg Television', on: false, live: true },
];

const feeds = new Map(); // channel id -> { at, items }

function channels() {
  if (!Array.isArray(store.data.news?.channels)) {
    store.data.news = { channels: structuredClone(DEFAULT_CHANNELS) };
  }
  return store.data.news.channels;
}

const decode = (s) => String(s || '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&amp;/g, '&');
const tag = (xml, name) => decode((xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)) || [])[1]).trim();

/** The videos in one channel's feed. Shorts (vertical clips) are left out. */
function parseFeed(xml, channel) {
  const out = [];
  for (const entry of xml.split('<entry>').slice(1)) {
    const id = tag(entry, 'yt:videoId');
    const link = (entry.match(/<link rel="alternate" href="([^"]+)"/) || [])[1] || '';
    if (!/^[\w-]{11}$/.test(id) || link.includes('/shorts/')) continue;
    out.push({
      id, title: tag(entry, 'title') || 'Untitled', published: tag(entry, 'published'),
      channelId: channel.id, channel: channel.name,
      thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      views: Number((entry.match(/<media:statistics views="(\d+)"/) || [])[1]) || 0,
    });
  }
  return out;
}

async function get(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(`YouTube answered ${res.status}`);
  return res.text();
}

async function channelFeed(channel, force) {
  const hit = feeds.get(channel.id);
  if (hit && !force && Date.now() - hit.at < CACHE_MS) return hit.items;
  const items = parseFeed(await get(FEED + channel.id), channel);
  feeds.set(channel.id, { at: Date.now(), items });
  return items;
}

/** The latest stories from every channel switched on. Returns { stories, channels, errors }. */
async function list(force = false) {
  const errors = [];
  const on = channels().filter((c) => c.on);
  const lists = await Promise.all(on.map((c) => channelFeed(c, force).catch((err) => {
    errors.push(`${c.name}: ${err.message}`);
    return feeds.get(c.id)?.items || []; // an older copy is better than nothing
  })));
  const stories = lists.flat().sort((a, b) => b.published.localeCompare(a.published)).slice(0, MAX_STORIES);
  return { stories, channels: channels(), errors };
}

/**
 * Finds a channel from what someone pastes: a channel link, a channel id (UC…), an
 * @handle or a link to one. Returns { id, name }.
 */
async function resolveChannel(input) {
  const text = String(input || '').trim();
  let id = (text.match(/(?:^|\/channel\/)(UC[\w-]{22})(?:[/?#]|$)/) || [])[1];
  if (!id) {
    const handle = (text.match(/(?:youtube\.com\/)?@([\w.-]{3,30})/) || text.match(/^([\w.-]{3,30})$/) || [])[1];
    if (!handle) throw new Error('Paste a YouTube channel link or its @handle.');
    // Consent cookies keep the EU cookie wall out of the way.
    const res = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}`, {
      signal: AbortSignal.timeout(12000),
      headers: { 'Accept-Language': 'en', 'User-Agent': 'Mozilla/5.0', Cookie: 'CONSENT=YES+1; SOCS=CAI' },
    });
    if (res.status === 404) throw new Error(`There is no YouTube channel @${handle}.`);
    const page = await res.text();
    id = (page.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)
      || page.match(/"externalId":"(UC[\w-]{22})"/) || [])[1];
    if (!id) throw new Error(`Could not find the channel @${handle}.`);
  }
  const xml = await get(FEED + id).catch(() => { throw new Error('That channel has no public videos.'); });
  return { id, name: tag(xml.split('<entry>')[0], 'title') || 'YouTube channel' };
}

async function addChannel(input) {
  const list = channels();
  if (list.length >= MAX_CHANNELS) throw new Error(`Up to ${MAX_CHANNELS} channels.`);
  const found = await resolveChannel(input);
  const existing = list.find((c) => c.id === found.id);
  if (existing) existing.on = true;
  else list.push({ ...found, on: true, custom: true });
  store.save();
  return list;
}

function setChannel(id, on) {
  const c = channels().find((x) => x.id === id);
  if (!c) throw new Error('That channel is not in the list.');
  c.on = !!on;
  store.save();
  return channels();
}

function removeChannel(id) {
  store.data.news.channels = channels().filter((c) => c.id !== id);
  feeds.delete(id);
  store.save();
  return channels();
}

/** Puts the channel list back to the built-in one. */
function resetChannels() {
  store.data.news = { channels: structuredClone(DEFAULT_CHANNELS) };
  store.save();
  return channels();
}

module.exports = { list, addChannel, setChannel, removeChannel, resetChannels, parseFeed, resolveChannel, DEFAULT_CHANNELS };
