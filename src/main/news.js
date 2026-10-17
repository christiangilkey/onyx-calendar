// The News panel: the latest videos from news channels on YouTube, newest first, read
// from each channel's Videos page (no API key; YouTube's per-channel RSS feeds stopped
// answering in October 2026, so they are only a fallback). Channels can be switched on and
// off, and any YouTube channel can be added by its link or @handle.
//
// With Tamkeen (the Arabic study app) on this PC and its switch on in the panel, the news
// comes instead from channels in the language being learned there (its "I am learning").

const fs = require('fs');
const path = require('path');
const store = require('./store');

const PAGE = (id) => `https://www.youtube.com/channel/${id}/videos`;
const FEED = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const HEADERS = {
  'Accept-Language': 'en',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Cookie: 'CONSENT=YES+1; SOCS=CAI', // keeps the EU cookie wall out of the way
};
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

// News in each language Tamkeen teaches (its language codes). Every id was checked against
// its channel's Videos page in October 2026.
const LANGUAGES = {
  ar: { name: 'Arabic', channels: [
    { id: 'UCfiwzLy-8yKzIbsmZTzxDgw', name: 'Al Jazeera Arabic', live: true },
    { id: 'UCelk6aHijZq-GJBBB9YpReA', name: 'BBC News Arabic' },
    { id: 'UCIJXOvggjKtCagMfxvcCzAA', name: 'Sky News Arabia', live: true },
    { id: 'UCahpxixMCwoANAftn6IxkTg', name: 'Al Arabiya' },
    { id: 'UCRJUVYt9gjg8MnlGacySUdg', name: 'Asharq News' },
    { id: 'UC30ditU5JI16o5NbFsHde_Q', name: 'DW Arabic' },
  ] },
  es: { name: 'Spanish', channels: [
    { id: 'UC_lEiu6917IJz03TnntWUaQ', name: 'CNN en Español' },
    { id: 'UCUBIrDsIVzRpKsClMlSlTpQ', name: 'BBC News Mundo' },
    { id: 'UCUdOoVWuWmgo1wByzcsyKDQ', name: 'FRANCE 24 Español', live: true },
    { id: 'UCT4Jg8h03dD0iN3Pb5L0PMA', name: 'DW Español' },
    { id: 'UC7QZIf0dta-XPXsp9Hv4dTw', name: 'RTVE Noticias' },
    { id: 'UCEJs1fTF3KszRJGxJY14VrA', name: 'NTN24' },
  ] },
  fr: { name: 'French', channels: [
    { id: 'UCCCPCZNChQdGa9EkATeye4g', name: 'FRANCE 24', live: true },
    { id: 'UCO6K_kkdP-lnSCiO3tPx7WA', name: 'franceinfo' },
    { id: 'UCzKH70qfN_yuXq3s91fdwmg', name: 'TV5MONDE Info' },
    { id: 'UCXwDLMDV86ldKoFVc_g8P0g', name: 'BFMTV' },
    { id: 'UCW2QcKZiU8aUGg4yxCIditg', name: 'euronews (français)' },
    { id: 'UCYpRDnhk5H8h16jpS84uqsA', name: 'Le Monde' },
  ] },
  ja: { name: 'Japanese', channels: [
    { id: 'UCGCZAYq5Xxojl_tSXcVJhiQ', name: 'ANNnewsCH' },
    { id: 'UC6AG81pAkf6Lbi_1VC5NmPA', name: 'TBS NEWS DIG' },
    { id: 'UCoQBJMzcwmXrRSHBFAlTsIw', name: 'FNN' },
    { id: 'UCuTAXTexrhetbOe3zgskJBQ', name: '日テレNEWS' },
    { id: 'UCip8ve30-AoX2y2OtAAmqFA', name: 'NHK' },
  ] },
  zh: { name: 'Chinese', channels: [
    { id: 'UCb3TZ4SD_Ys3j4z0-8o6auA', name: 'BBC News 中文' },
    { id: 'UCt5zpwa264A0B-gaYtv1IpA', name: 'VOA 中文' },
    { id: 'UC99XkAM3Y82ONvdpwUYmOZg', name: 'DW Chinese' },
    { id: 'UC06ZfP4ru4C8uV6nkq58IuQ', name: 'RFA 中文' },
  ] },
  ru: { name: 'Russian', channels: [
    { id: 'UC8zQiuT0m1TELequJ5sp5zw', name: 'BBC News Russian' },
    { id: 'UCXoAjrdHFa2hEL3Ug8REC1w', name: 'DW на русском' },
    { id: 'UCBG57608Hukev3d0d-gvLhQ', name: 'Current Time', live: true },
    { id: 'UCdubelOloxR3wzwJG9x8YqQ', name: 'TV Rain' },
    { id: 'UCFzJjgVicCtFxJ5B0P_ei8A', name: 'Euronews по-русски' },
  ] },
  it: { name: 'Italian', channels: [
    { id: 'UCxqR9g_1XlnfrqwHK9viwCw', name: 'RaiNews' },
    { id: 'UCxrPzaf2B_l6NvnmIRp5EKg', name: 'La7' },
    { id: 'UC1mX9vuLOYf8fhaXS_KcDRg', name: 'euronews (italiano)' },
    { id: 'UCWJhBqnyVdHAuxexgjghNFw', name: 'Fanpage.it' },
  ] },
  tl: { name: 'Tagalog', channels: [
    { id: 'UCqYw-CTd1dU2yGI71sEyqNw', name: 'GMA News' },
    { id: 'UCE2606prvXQc_noEqKxVJXA', name: 'ABS-CBN News' },
  ] },
};

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

/** The videos in one channel's RSS feed (kept in case YouTube brings the feeds back). Shorts are left out. */
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

// ---------------------------------------------------------------- the Videos page

/** The page's data: YouTube puts it in a script as `var ytInitialData = {...};`. */
function pageData(html) {
  const m = String(html).match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) throw new Error('YouTube changed its page; the news cannot be read right now.');
  return JSON.parse(m[1]);
}

// YouTube says how old a video is in the page's language: "4h ago", "hace 3 h", "il y a 8 h",
// "28 分前", "18小时前", "13 ч назад", "8 h fa", "1 oras ang nakalipas", "قبل 3 ساعات".
const AGO = /ago|hace|il y a|前|назад|\bfa$|\bfa\b|nakalipas|قبل/i;
const DAY = 86400000;
const UNITS = [ // checked in this order: years before months before ... seconds
  [365.25 * DAY, /year|\byrs?\b|\d\s*y\b|años?|\bans?\b|年|лет|\bгод|\bг\.|ann[oi]\b|taon|سن[ةو]|سنتين|عام|أعوام/],
  [30.44 * DAY, /month|\d\s*mo\b|\bmes(es)?\b|mois|か月|[个個]月|мес|\bmes[ei]\b|buwan|شهر|أشهر/],
  [7 * DAY, /week|\bwks?\b|\d\s*w\b|semanas?|semaines?|週|周|нед|sett|linggo|أسبوع|أسابيع/],
  [DAY, /day|\d\s*d\b|días?|jours?|日|天|дн|giorn|\bg\b|araw|يوم|أيام/],
  [3600000, /hour|\bhrs?\b|\d\s*h\b|horas?|heures?|時間|小[时時]|(?:^|[\s\d])ч(?:[\s.]|$)|час|\bor[ae]\b|oras|ساع/],
  [60000, /minute|\bmins?\b|\d\s*m\b|minutos?|分|мин|minut|دقيق|دقائق/],
  [1000, /second|\bsecs?\b|\d\s*s\b|segundos?|秒|сек|ثاني|ثوان/],
];
const DUAL = /ساعتين|يومين|دقيقتين|أسبوعين|شهرين|سنتين/; // Arabic's "two hours" has no digit

/** How long ago, from YouTube's age text in any of its languages. null when it is not an age. */
function ageMs(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t || !AGO.test(t) || /^\d+[\d.,]*\s*$/.test(t)) return null;
  const unit = UNITS.find(([, re]) => re.test(t));
  if (!unit) return null;
  const n = (t.match(/\d+/) || [])[0];
  return (n ? Number(n) : DUAL.test(t) ? 2 : 1) * unit[0];
}

/** "2.3K", "1,3 K", "1.3万", "35 тыс.", "1.3 ألف", "15,204 views" -> a number (null when it is not one). */
function viewCount(text) {
  const t = String(text || '').trim();
  if (AGO.test(t)) return null;
  const m = /^([\d.,]+)\s*([^\d\s]*)/.exec(t);
  if (!m) return null;
  const digits = m[1];
  // "1,3" or "1.3" before a multiplier is a decimal; "15,204" on its own is thousands.
  const n = Number(/[.,]\d{3}$/.test(digits) && !/[KkMBm万萬億亿]|тыс|млн|ألف|مليون/.test(m[2]) ? digits.replace(/[.,]/g, '') : digits.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const s = m[2].toLowerCase();
  const times = /^k|тыс|ألف|^mil\b/.test(s) ? 1e3 : /^m|млн|مليون/.test(s) ? 1e6 : /^[万萬]/.test(s) ? 1e4 : /^[億亿]/.test(s) ? 1e8 : /^b/.test(s) ? 1e9 : 1;
  return Math.round(n * times);
}

/** The videos on a channel's Videos tab, newest first, with a publish time worked out from their age. */
function parsePage(html, channel, now = Date.now()) {
  const data = pageData(html);
  const out = [];
  const seen = new Set();
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (k === 'lockupViewModel' && v?.contentId) {
        const id = v.contentId;
        if (!/^[\w-]{11}$/.test(id) || seen.has(id) || (v.contentType && v.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO')) continue;
        const md = v.metadata?.lockupMetadataViewModel;
        const parts = (md?.metadata?.contentMetadataViewModel?.metadataRows || [])
          .flatMap((r) => (r.metadataParts || []).map((p) => p.text?.content || '')).filter(Boolean);
        const age = parts.map(ageMs).find((x) => x != null);
        const live = /"text":"LIVE"/.test(JSON.stringify(v.contentImage || {}));
        if (age == null && !live) continue; // upcoming ("Scheduled for ...")
        seen.add(id);
        out.push({
          id, title: md?.title?.content || 'Untitled', published: new Date(now - (age || 0)).toISOString(),
          channelId: channel.id, channel: channel.name, thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
          views: parts.map(viewCount).find((x) => x != null) || 0, ...(live ? { live: true } : {}),
        });
      } else if (k === 'videoRenderer' && v?.videoId) { // the older layout, should YouTube go back to it
        const id = v.videoId;
        if (!/^[\w-]{11}$/.test(id) || seen.has(id)) continue;
        const age = ageMs(v.publishedTimeText?.simpleText);
        if (age == null) continue;
        seen.add(id);
        out.push({
          id, title: v.title?.runs?.[0]?.text || v.title?.simpleText || 'Untitled', published: new Date(now - age).toISOString(),
          channelId: channel.id, channel: channel.name, thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
          views: viewCount(v.viewCountText?.simpleText) || 0,
        });
      } else {
        walk(v);
      }
    }
  };
  walk(data);
  return out;
}

// The page's language: the original titles (YouTube shows a channel's own translated titles
// to viewers in other languages). Tagalog is "fil" on YouTube.
const HL = { tl: 'fil' };

async function get(url, hl) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: hl ? { ...HEADERS, 'Accept-Language': hl } : HEADERS });
  if (!res.ok) throw new Error(`YouTube answered ${res.status}`);
  return res.text();
}

async function channelFeed(channel, force) {
  const hit = feeds.get(channel.id);
  if (hit && !force && Date.now() - hit.at < CACHE_MS) return hit.items;
  let items;
  try {
    items = parsePage(await get(PAGE(channel.id) + (channel.hl ? `?hl=${channel.hl}` : ''), channel.hl), channel);
  } catch (err) {
    items = await get(FEED + channel.id).then((xml) => parseFeed(xml, channel)).catch(() => { throw err; });
  }
  feeds.set(channel.id, { at: Date.now(), items });
  return items;
}

// ---------------------------------------------------------------- Tamkeen's language

const TAMKEEN_DB = () => path.join(process.env.APPDATA || '', 'ArabicPodcastStudio', 'library.db');
let tamkeenLang = { at: 0, code: '' };

/** The language Tamkeen on this PC is set to teach ("I am learning"), e.g. 'ar'; '' when unknown. Read-only. */
function tamkeenLanguage() {
  if (Date.now() - tamkeenLang.at < 60000) return tamkeenLang.code;
  let code = '';
  try {
    const file = TAMKEEN_DB();
    if (process.env.APPDATA && fs.existsSync(file)) {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(file, { readOnly: true });
      try {
        const row = db.prepare("SELECT value FROM settings WHERE key = 'study_language'").get();
        code = String(JSON.parse(row?.value || '""') || '');
      } finally {
        db.close();
      }
    }
  } catch { /* Tamkeen busy or changed: the usual news */ }
  tamkeenLang = { at: Date.now(), code: LANGUAGES[code] ? code : '' };
  return tamkeenLang.code;
}

/**
 * The latest stories, newest first. Usually from the channels switched on; with
 * `tamkeen`, from news channels in the language Tamkeen is teaching (when it can be read).
 * Returns { stories, channels, errors, language }.
 */
async function list(force = false, { tamkeen = false } = {}) {
  const errors = [];
  const code = tamkeen ? tamkeenLanguage() : '';
  const language = code ? { code, name: LANGUAGES[code].name } : null;
  const on = language ? LANGUAGES[code].channels.map((c) => ({ ...c, on: true, hl: HL[code] || code })) : channels().filter((c) => c.on);
  const lists = await Promise.all(on.map((c) => channelFeed(c, force).catch((err) => {
    errors.push(`${c.name}: ${err.message}`);
    return feeds.get(c.id)?.items || []; // an older copy is better than nothing
  })));
  const stories = lists.flat().sort((a, b) => b.published.localeCompare(a.published)).slice(0, MAX_STORIES);
  return { stories, channels: language ? on : channels(), errors, language, ...(tamkeen && !language ? { noLanguage: true } : {}) };
}

/**
 * Finds a channel from what someone pastes: a channel link, a channel id (UC…), an
 * @handle or a link to one. Returns { id, name }.
 */
async function resolveChannel(input) {
  const text = String(input || '').trim();
  let id = (text.match(/(?:^|\/channel\/)(UC[\w-]{22})(?:[/?#]|$)/) || [])[1];
  let html = '';
  if (!id) {
    const handle = (text.match(/(?:youtube\.com\/)?@([\w.-]{3,30})/) || text.match(/^([\w.-]{3,30})$/) || [])[1];
    if (!handle) throw new Error('Paste a YouTube channel link or its @handle.');
    const res = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}/videos`, { signal: AbortSignal.timeout(15000), headers: HEADERS });
    if (res.status === 404) throw new Error(`There is no YouTube channel @${handle}.`);
    html = await res.text();
    id = (html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)
      || html.match(/"externalId":"(UC[\w-]{22})"/) || [])[1];
    if (!id) throw new Error(`Could not find the channel @${handle}.`);
  }
  if (!html) html = await get(PAGE(id)).catch(() => { throw new Error('Could not open that channel on YouTube.'); });
  let name = '';
  try { name = pageData(html).metadata?.channelMetadataRenderer?.title || ''; } catch { /* the name is optional */ }
  return { id, name: name || 'YouTube channel' };
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

module.exports = {
  list, addChannel, setChannel, removeChannel, resetChannels, parseFeed, parsePage, ageMs, viewCount,
  resolveChannel, tamkeenLanguage, DEFAULT_CHANNELS, LANGUAGES,
};
