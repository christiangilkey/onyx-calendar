// What Magic add and Magic goal can be handed besides typing: a webpage, a Notion page or a picture
// (a screenshot or photo of instructions, a list, notes). Each is read into plain text, with its headings,
// lists and steps kept, for Claude to turn into tasks. A webpage is fetched here and its readable part
// kept; a Notion page is read through the person's own Notion connection; a picture is written out by
// Claude with the person's own key. Nothing is kept here: the text goes back to the window, which sends it
// along when planning.

const store = require('./store');
const { sturdyFetch } = require('./net');
const notion = require('./providers/notion');

const MAX_TEXT = 40000;                   // characters kept from one source
const MAX_PAGE_BYTES = 4 * 1024 * 1024;   // a webpage is read this far
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;  // Claude's limit for one picture
const MIN_PAGE_TEXT = 200;                // less than this: the page is drawn by scripts, or wants a sign-in
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MODEL = 'claude-sonnet-5-5';
const API = 'https://api.anthropic.com/v1/messages';
// Sites send their real page to a browser; some turn away anything else.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const keyOf = () => String(store.data.secrets.anthropicKey || '');
const words = (s) => (String(s).match(/\S+/g) || []).length;

// ---------------------------------------------------------------- webpages

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', deg: '°', times: '×', frac12: '½',
  frac14: '¼', frac34: '¾', laquo: '«', raquo: '»', euro: '€', pound: '£', shy: '', zwj: '', zwnj: '', ensp: ' ', emsp: ' ', thinsp: ' ',
};
function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (all, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

const tagless = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** The readable part of a page as text: { title, text }. Headings keep their #, list items their -. */
function htmlToText(html) {
  let s = String(html || '');
  const meta = (name) => {
    const tag = s.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i'));
    const content = tag && tag[0].match(/content=["']([^"']*)["']/i);
    return content ? decodeEntities(content[1]).replace(/\s+/g, ' ').trim() : '';
  };
  const title = meta('og:title') || decodeEntities((s.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas|select|button|head)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  // The page's own content, when it marks it: the longest <article>, else <main>. Menus and footers are left out.
  const longest = (name) => {
    let best = '';
    for (const m of s.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'gi'))) if (m[1].length > best.length) best = m[1];
    return best;
  };
  const main = longest('article') || longest('main');
  if (main && tagless(main).length > 500) s = main;
  // (Not <form>: some sites wrap the whole page in one.)
  s = s.replace(/<(nav|footer|aside)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<h([1-6])\b[^>]*>/gi, (all, n) => `\n\n${'#'.repeat(Number(n))} `)
    .replace(/<\/h[1-6]\s*>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]\s*>/gi, ' | ')
    .replace(/<\/?(p|div|section|article|header|main|ul|ol|table|thead|tbody|tr|blockquote|pre|figure|figcaption|dl|dd|dt)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decodeEntities(s).replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t\f\v]+/g, ' ').replace(/(\s*\|\s*)+$/, '').replace(/^(\s*\|\s*)+/, '').trim())
    .filter((l) => l && l !== '-' && !/^#+$/.test(l))
    .join('\n')
    .replace(/\n(#+ )/g, '\n\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text };
}

/** The charset a page is written in: from its header, or its own <meta>. */
function charsetOf(type, head) {
  const m = /charset=["']?([\w-]+)/i.exec(type || '') || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  return m ? m[1].toLowerCase() : 'utf-8';
}

async function readWeb(url) {
  let res;
  try {
    res = await sturdyFetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5', 'Accept-Language': 'en,*;q=0.5' },
      redirect: 'follow', signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('That page took too long to answer. Try again, or add a screenshot of it.');
    throw err;
  }
  if (res.status === 401 || res.status === 403) throw new Error('That page needs a sign-in, or doesn\'t let apps read it. Add a screenshot of it instead, or paste its text.');
  if (res.status === 404 || res.status === 410) throw new Error('That page wasn\'t found. Check the link.');
  if (!res.ok) throw new Error(`The site answered ${res.status}. Try again later, or add a screenshot of the page.`);
  const type = String(res.headers.get('content-type') || '').toLowerCase();
  if (type.includes('pdf')) throw new Error('PDF links can\'t be read yet. Add a screenshot of the part you need instead.');
  if (type && !/html|xml|text\/plain|markdown/.test(type)) throw new Error('That link isn\'t a page Onyx can read. Add a screenshot of it instead.');
  if (Number(res.headers.get('content-length')) > MAX_PAGE_BYTES * 4) throw new Error('That page is too big to read.');
  const buf = Buffer.from(await res.arrayBuffer()).subarray(0, MAX_PAGE_BYTES);
  let raw;
  try { raw = new TextDecoder(charsetOf(type, buf.subarray(0, 2048).toString('latin1'))).decode(buf); } catch { raw = buf.toString('utf8'); }
  const final = res.url || url;
  const host = new URL(final).hostname.replace(/^www\./, '');
  const page = /html|xml/.test(type) || /^\s*</.test(raw) ? htmlToText(raw) : { title: '', text: raw.trim() };
  if (page.text.length < MIN_PAGE_TEXT) throw new Error('Onyx couldn\'t find text to read on that page (it may be drawn by scripts or need a sign-in). Add a screenshot of it, or paste its text.');
  return { kind: 'web', title: page.title || host, url: final, text: page.text };
}

// ---------------------------------------------------------------- Notion pages

/** The page id in a Notion link (notion.so, notion.site), or null when it isn't one. */
function notionPageId(u) {
  if (!/(^|\.)notion\.(so|site)$/i.test(u.hostname)) return null;
  const last = u.searchParams.get('p') || u.pathname.split('/').filter(Boolean).pop() || '';
  const hex = last.replace(/-/g, '').slice(-32);
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toLowerCase();
}

async function readNotion(url, id) {
  if (!notion.info().connected) throw new Error('To read Notion pages, connect Notion in Onyx on your PC (Settings → Notion & Drive), then share the page with your integration.');
  let page;
  try {
    page = await notion.readPage(id);
  } catch (err) {
    if (/could not find|object_not_found|404|restricted/i.test(err.message)) {
      throw new Error('Onyx can\'t see that Notion page. In Notion, open the page\'s ••• menu → Connections, and add your Onyx integration.');
    }
    throw err;
  }
  if (!page.text) throw new Error('That Notion page is empty.');
  return { kind: 'notion', title: page.title, url: page.url || url, text: page.text };
}

// ---------------------------------------------------------------- pictures

const IMAGE_PROMPT = [
  'This is a picture someone wants to turn into tasks on their calendar: a screenshot or photo of instructions, a list, a page, a whiteboard or notes.',
  'Write out everything in it that matters for doing it, in order: every step, item, amount, setting, time, date, name and note, as plain text with short headings and lists. Keep their words.',
  'Do not add anything that is not in the picture, and leave out what is only decoration (menus, ads, buttons, status bars).',
  'Start with one line that is a short title for what it is (at most 60 characters), then a blank line, then the contents.',
  'If there is nothing to read in it, reply with only: NOTHING TO READ',
].join(' ');

async function readImage({ data, type }) {
  if (!keyOf()) throw new Error('Reading pictures needs your Claude key: add it in Settings → AI.');
  const media = String(type || '').toLowerCase();
  if (!IMAGE_TYPES.has(media)) throw new Error('Use a JPEG, PNG, WebP or GIF picture.');
  const b64 = String(data || '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) throw new Error('That picture could not be read.');
  if (Math.floor(b64.length * 3 / 4) > MAX_IMAGE_BYTES) throw new Error('That picture is too big (5 MB at most).');
  const res = await fetch(API, {
    method: 'POST',
    signal: AbortSignal.timeout(120000),
    headers: { 'x-api-key': keyOf(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 4000,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: media, data: b64 } }, { type: 'text', text: IMAGE_PROMPT }] }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error('Claude did not accept the API key. Check it in Settings → AI.');
    throw new Error(body?.error?.message || `Claude answered ${res.status}`);
  }
  const out = (body.content || []).map((c) => c.text || '').join('').trim();
  if (!out || /^NOTHING TO READ/i.test(out)) throw new Error('There is nothing to read in that picture.');
  const [first, ...rest] = out.split('\n');
  const title = first.replace(/^#+\s*|^title:\s*/i, '').replace(/\*\*/g, '').trim().slice(0, 80);
  const text = rest.join('\n').trim();
  return { kind: 'image', title: title || 'Picture', url: '', text: text || out };
}

// ---------------------------------------------------------------- reading one

/**
 * Reads one source: { kind: 'link', url } (a webpage or a Notion page) or { kind: 'image', data (base64), type }.
 * Returns { kind: 'web' | 'notion' | 'image', title, url, text, words, cut }.
 */
async function read(src = {}) {
  let page;
  if (src.kind === 'image') {
    page = await readImage(src);
  } else if (src.kind === 'link') {
    let raw = String(src.url || '').trim();
    if (raw && !/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
    let u;
    try { u = new URL(raw); } catch { throw new Error('That is not a link.'); }
    if (!/^https?:$/.test(u.protocol) || raw.length > 2000) throw new Error('Use a link that starts with http:// or https://.');
    const id = notionPageId(u);
    page = id ? await readNotion(u.href, id) : await readWeb(u.href);
  } else {
    throw new Error('Add a link or a picture.');
  }
  const cut = page.text.length > MAX_TEXT;
  const text = cut ? page.text.slice(0, MAX_TEXT).replace(/\s+\S*$/, '') : page.text;
  return { ...page, title: String(page.title || '').slice(0, 120), text, words: words(text), cut };
}

/** Sources sent along with a plan, as Claude is shown them: at most four, sharing `budget` characters. */
function forPrompt(list, budget = 60000) {
  const ok = (Array.isArray(list) ? list : []).filter((s) => s && typeof s.text === 'string' && s.text.trim()).slice(0, 4);
  const each = ok.length ? Math.floor(budget / ok.length) : 0;
  return ok.map((s) => ({
    title: String(s.title || 'Untitled').replace(/\s+/g, ' ').trim().slice(0, 120),
    url: /^https?:\/\//i.test(String(s.url || '')) ? String(s.url).slice(0, 2000) : '',
    kind: ['web', 'notion', 'image'].includes(s.kind) ? s.kind : 'web',
    text: s.text.trim().slice(0, each),
  }));
}

/** The sources as a block of the prompt, each numbered. */
const promptBlock = (list) => list.map((s, i) => `Material ${i + 1}: ${s.title}${s.url ? ` (${s.url})` : s.kind === 'image' ? ' (from a picture)' : ''}\n${s.text}`).join('\n\n');

module.exports = { read, htmlToText, notionPageId, decodeEntities, forPrompt, promptBlock, MAX_TEXT };
