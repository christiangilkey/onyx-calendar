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

/** Adds blocks at the end of a page shared with the integration (share.js: a calendar block sent there). */
async function append(pageId, children) {
  return call(`/blocks/${encodeURIComponent(pageId)}/children`, { method: 'PATCH', body: { children } });
}

const MAX_BLOCKS = 800; // a long page is read this far
const MAX_DEPTH = 3;    // nested lists and toggles, this deep

/** One block as a line of text: headings with #, lists with - and 1., to-dos with [ ] or [x]. Null: nothing to read. */
function blockLine(b, depth, n) {
  const ind = '  '.repeat(depth);
  const body = b[b.type] || {};
  const t = plain(body.rich_text);
  switch (b.type) {
    case 'heading_1': return `\n# ${t}`;
    case 'heading_2': return `\n## ${t}`;
    case 'heading_3': return `\n### ${t}`;
    case 'paragraph': return t ? ind + t : '';
    case 'bulleted_list_item': case 'toggle': return `${ind}- ${t}`;
    case 'numbered_list_item': return `${ind}${n}. ${t}`;
    case 'to_do': return `${ind}- [${body.checked ? 'x' : ' '}] ${t}`;
    case 'quote': case 'callout': return `${ind}> ${t}`;
    case 'code': return t ? `${ind}${t}` : null;
    case 'divider': return '---';
    case 'child_page': return `${ind}(page) ${body.title || ''}`;
    case 'child_database': return `${ind}(database) ${body.title || ''}`;
    case 'bookmark': case 'embed': case 'link_preview': return body.url ? `${ind}${body.url}` : null;
    case 'table_row': return ind + (body.cells || []).map((c) => plain(c)).join(' | ');
    case 'equation': return body.expression ? ind + body.expression : null;
    case 'image': case 'video': case 'file': case 'pdf': { const cap = plain(body.caption); return cap ? `${ind}(${b.type}) ${cap}` : null; }
    default: return t ? ind + t : null;
  }
}

/** A page shared with the integration, as text: { title, url, text }. Nested blocks are read a few levels deep. */
async function readPage(id) {
  const page = await call(`/pages/${encodeURIComponent(id)}`);
  const lines = [];
  let count = 0;
  const walk = async (blockId, depth) => {
    let cursor = null, n = 0;
    do {
      const res = await call(`/blocks/${encodeURIComponent(blockId)}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`);
      for (const b of res.results || []) {
        if (++count > MAX_BLOCKS) return;
        n = b.type === 'numbered_list_item' ? n + 1 : 0;
        const line = blockLine(b, depth, n);
        if (line != null) lines.push(line);
        if (b.has_children && depth < MAX_DEPTH && b.type !== 'child_page' && b.type !== 'child_database') await walk(b.id, depth + 1);
      }
      cursor = res.has_more ? res.next_cursor : null;
    } while (cursor);
  };
  await walk(id, 0);
  return { title: titleOf(page), url: page.url || '', text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

module.exports = { search, connect, disconnect, info, append, readPage, blockLine };
