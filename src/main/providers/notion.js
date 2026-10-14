// Notion: finding pages to pin to the globe.
// Uses an internal integration token (notion.so/my-integrations). Notion only
// shows an integration the pages that have been shared with it.

const store = require('../store');

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';

const token = () => store.data.secrets.notionToken || '';

async function call(path, { method = 'GET', body, key = token() } = {}) {
  if (!key) throw new Error('Connect Notion first, in Onyx on your PC: Settings → Notion & Drive.');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Notion-Version': VERSION, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Notion did not accept that token. Copy it again from notion.so/my-integrations.');
  if (!res.ok) throw new Error(`Notion: ${json.message || `HTTP ${res.status}`}`);
  return json;
}

const plain = (rich) => (rich || []).map((r) => r.plain_text || '').join('').trim();

function titleOf(item) {
  if (item.object === 'database') return plain(item.title) || 'Untitled database';
  const prop = Object.values(item.properties || {}).find((p) => p.type === 'title');
  return plain(prop?.title) || 'Untitled';
}

function toResult(item) {
  return {
    source: 'notion',
    ref: item.id,
    title: titleOf(item),
    url: item.url,
    kind: item.object === 'database' ? 'database' : 'page',
    icon: item.icon?.type === 'emoji' ? item.icon.emoji : '',
    edited: item.last_edited_time || '',
  };
}

/** Pages and databases shared with the integration whose titles match `query` (newest first). */
async function search(query = '') {
  const res = await call('/search', {
    method: 'POST',
    body: { query: String(query).trim(), page_size: 25, sort: { direction: 'descending', timestamp: 'last_edited_time' } },
  });
  return (res.results || []).filter((r) => r.url && !r.archived && !r.in_trash).map(toResult);
}

/** Checks a token and saves it. Returns the integration's name. */
async function connect(key) {
  const clean = String(key || '').trim();
  if (!clean) throw new Error('Paste the integration secret first.');
  const me = await call('/users/me', { key: clean });
  store.data.secrets.notionToken = clean;
  store.data.notion = { name: me.name || 'Notion', workspace: me.bot?.workspace_name || '' };
  store.save();
  return store.data.notion;
}

function disconnect() {
  store.data.secrets.notionToken = '';
  store.data.notion = null;
  store.save();
}

const info = () => ({ connected: !!token(), ...(store.data.notion || {}) });

module.exports = { search, connect, disconnect, info };
