// The calendar as a network service, so the Raspberry Pi, Hermes or any other
// agent can read and add to it:
//
//   POST /mcp          Model Context Protocol (Streamable HTTP, JSON responses)
//   GET  /api/agenda   plain JSON, for scripts and curl
//   GET  /api/tasks
//   GET  /api/calendars
//   POST /app/rpc      the Android app (same commands as the desktop window)
//   GET  /health       no token needed
//
// Everything except /health needs "Authorization: Bearer <token>".

const crypto = require('crypto');
const http = require('http');
const os = require('os');
const store = require('./store');
const hub = require('./hub');
const library = require('./library');
const { version } = require('../../package.json');

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_BODY = 1024 * 1024;

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local wall-clock time with its UTC offset, which is easier for an agent to read than "Z" time. */
function localStamp(value) {
  if (value.length === 10) return value;
  const d = new Date(value);
  const off = -d.getTimezoneOffset();
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${off < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

/** A date or time from a caller. A bare "YYYY-MM-DD" means local midnight, not UTC. */
function when(value, name) {
  const text = String(value).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00`) : new Date(text);
  if (Number.isNaN(+d)) throw new Error(`${name} is not a date or time: "${text}"`);
  return d;
}

function range(args) {
  const start = args.start ? when(args.start, 'start') : new Date(new Date().setHours(0, 0, 0, 0));
  let end;
  if (args.end) {
    end = when(args.end, 'end');
  } else {
    const days = Math.min(Math.max(Number(args.days) || 1, 1), 92);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days);
  }
  return [start.toISOString(), end.toISOString()];
}

const briefEvent = (e) => ({
  id: e.id, kind: e.kind, title: e.title, start: localStamp(e.start), end: localStamp(e.end), all_day: e.allDay,
  calendar: e.calendarName, ...(e.location ? { location: e.location } : {}), ...(e.notes ? { notes: e.notes } : {}),
  pi_call: e.piCall, read_only: !e.writable, tags: e.tags || [], ...(e.warning ? { warning: e.warning } : {}),
});

const briefTask = (t) => ({
  id: t.id, title: t.title, list: t.listName, due_date: t.date, time: t.time, tags: t.tags || [],
  ...(t.notes ? { notes: t.notes } : {}),
  pi_call: t.call ? (t.call.past ? 'already due' : t.call.quiet ? 'skipped: quiet hours' : localStamp(t.call.at)) : null,
});

const hasTag = (tag) => (item) => !tag || (item.tags || []).some((t) => t.toLowerCase() === String(tag).replace(/^#/, '').toLowerCase());

async function agenda(args) {
  const [start, end] = range(args);
  const { events, errors } = await hub.getEvents(start, end, { includeHidden: !!args.include_hidden });
  return {
    from: localStamp(start), to: localStamp(end), events: events.filter(hasTag(args.tag)).map(briefEvent),
    ...(errors.length ? { problems: errors } : {}),
  };
}

async function tasks(args = {}) {
  const { tasks: all, errors } = await hub.getTasks();
  return { tasks: all.filter((t) => !t.mirror).filter(hasTag(args.tag)).map(briefTask), ...(errors.length ? { problems: errors } : {}) };
}

const TAGS_PARAM = { type: 'array', items: { type: 'string' }, description: 'Tags, e.g. ["study", "arabic"]. Tags are private to Onyx.' };

const listCalendars = () => hub.calendars().map((c) => ({
  id: c.id, name: c.name, account: c.accountLabel, type: c.kind === 'tasklist' ? 'task list' : 'calendar',
  shown: !store.data.settings.hidden[c.id], read_only: !c.writable,
}));

const TIME = 'Local time, e.g. "2026-10-14T15:00", or with an offset.';

const TOOLS = [
  {
    name: 'get_agenda',
    description: 'Calendar events, time blocks and dated tasks from the master calendar (every calendar that is switched on), in time order. Defaults to today.',
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: `First moment to include. Default: start of today. ${TIME}` },
        end: { type: 'string', description: 'Moment to stop at. Default: `days` after start.' },
        days: { type: 'number', description: 'How many days to cover when `end` is not given (1-92). Default 1.' },
        include_hidden: { type: 'boolean', description: 'Also include calendars that are switched off in the sidebar.' },
        tag: { type: 'string', description: 'Only entries carrying this tag.' },
      },
    },
    run: agenda,
  },
  {
    name: 'list_tasks',
    description: 'Open tasks from Google Tasks and Microsoft To Do. `pi_call` says when the Raspberry Pi will phone about a task, if it will.',
    inputSchema: { type: 'object', properties: { tag: { type: 'string', description: 'Only tasks carrying this tag.' } } },
    run: tasks,
  },
  {
    name: 'list_tags',
    description: 'The user\'s tags, with how many events and tasks carry each. Tags are private to Onyx and group entries into clusters.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => ({ tags: hub.allTags().map(({ name, count }) => ({ name, count })) }),
  },
  {
    name: 'set_tags',
    description: 'Replace the tags on an event, time block or task (an empty list removes them).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Event or task id from get_agenda or list_tasks.' }, tags: TAGS_PARAM },
      required: ['id', 'tags'],
    },
    write: true,
    run: async (a) => ({ id: a.id, tags: hub.setTags(a.id, a.tags) }),
  },
  {
    name: 'list_calendars',
    description: 'The calendars and task lists that feed the master calendar, with their ids.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => ({ calendars: listCalendars() }),
  },
  {
    name: 'find_free_time',
    description: 'Free gaps on one day, after every shown calendar is taken into account.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'The day, YYYY-MM-DD. Default: today.' },
        min_minutes: { type: 'number', description: 'Shortest gap worth returning. Default 30.' },
        day_start: { type: 'string', description: 'Earliest time to consider, HH:MM. Default 08:00.' },
        day_end: { type: 'string', description: 'Latest time to consider, HH:MM. Default 18:00.' },
      },
    },
    run: async (a) => ({
      free: (await hub.freeTime(a.date || localDate(new Date()), {
        minMinutes: a.min_minutes || 30, dayStart: a.day_start || '08:00', dayEnd: a.day_end || '18:00',
      })).map((g) => ({ start: localStamp(g.start), end: localStamp(g.end), minutes: g.minutes })),
    }),
  },
  {
    name: 'create_time_block',
    description: 'Block out time on the calendar for something. Set pi_call to have the Raspberry Pi phone the user about an hour before it starts.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'What the time is for.' },
        start: { type: 'string', description: TIME },
        end: { type: 'string', description: TIME },
        calendar_id: { type: 'string', description: 'Calendar to save into (see list_calendars). Default: the user\'s default calendar for new blocks.' },
        notes: { type: 'string' },
        pi_call: { type: 'boolean', description: 'Phone reminder from the Raspberry Pi. Default false.' },
        tags: TAGS_PARAM,
      },
      required: ['title', 'start', 'end'],
    },
    write: true,
    run: async (a) => briefEvent(await hub.createEvent({
      title: a.title, start: when(a.start, 'start'), end: when(a.end, 'end'),
      calendarId: a.calendar_id, notes: a.notes || '', piCall: !!a.pi_call, ...(a.tags ? { tags: a.tags } : {}),
    })),
  },
  {
    name: 'update_event',
    description: 'Change an event or time block: rename it, move it (give both start and end), edit notes, or switch its Pi phone reminder on or off.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Event id from get_agenda.' },
        title: { type: 'string' },
        start: { type: 'string', description: TIME },
        end: { type: 'string', description: TIME },
        notes: { type: 'string' },
        pi_call: { type: 'boolean' },
      },
      required: ['id'],
    },
    write: true,
    run: async (a) => {
      const patch = {};
      for (const k of ['title', 'notes']) if (k in a) patch[k] = a[k];
      if (a.start || a.end) {
        if (!a.start || !a.end) throw new Error('Give both start and end to move an event.');
        Object.assign(patch, { start: when(a.start, 'start'), end: when(a.end, 'end'), allDay: false });
      }
      if ('pi_call' in a) patch.piCall = !!a.pi_call;
      return briefEvent(await hub.updateEvent(a.id, patch));
    },
  },
  {
    name: 'delete_event',
    description: 'Delete an event or time block (and its Pi phone reminder, if it has one).',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Event id from get_agenda.' } }, required: ['id'] },
    write: true,
    run: async (a) => { await hub.deleteEvent(a.id); return { deleted: a.id }; },
  },
  {
    name: 'create_task',
    description: 'Add a task. The Raspberry Pi phones about any Google task whose NAME contains a time, e.g. "Dentist Oct 14 3pm" or "1500 Brief the team".',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        due: { type: 'string', description: 'Due date, YYYY-MM-DD. Used when the name has a time but no date.' },
        list_id: { type: 'string', description: 'Task list id (see list_calendars). Default: the main Google list.' },
        notes: { type: 'string' },
        tags: TAGS_PARAM,
      },
      required: ['title'],
    },
    write: true,
    run: async (a) => briefTask(await hub.createTask({
      title: a.title, listId: a.list_id, ...(a.due ? { due: a.due } : {}), ...(a.notes ? { notes: a.notes } : {}),
      ...(a.tags ? { tags: a.tags } : {}),
    })),
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Task id from list_tasks.' } }, required: ['id'] },
    write: true,
    run: async (a) => { await hub.updateTask(a.id, { done: true }); return { completed: a.id }; },
  },
  {
    name: 'list_notes',
    description: 'Notes the user keeps in Onyx (shown on the globe view, grouped by tag), plus the Notion pages and Google Drive files pinned to the globe.',
    inputSchema: { type: 'object', properties: { tag: { type: 'string', description: 'Only items carrying this tag.' } } },
    run: async (a) => {
      const { notes, pins } = library.globeItems();
      return {
        notes: notes.filter(hasTag(a.tag)).map((n) => ({ id: n.id, title: n.title, body: n.body, tags: n.tags, updated: n.updated })),
        pinned: pins.filter(hasTag(a.tag)).map((p) => ({ id: p.id, source: p.source, title: p.title, url: p.url, tags: p.tags })),
      };
    },
  },
  {
    name: 'create_note',
    description: 'Write a note into Onyx. Tags place it into clusters on the globe view.',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' }, body: { type: 'string' }, tags: TAGS_PARAM },
      required: ['title'],
    },
    write: true,
    run: async (a) => {
      const n = library.createNote({ title: a.title, body: a.body || '', tags: a.tags || [] });
      return { id: n.id, title: n.title, tags: n.tags };
    },
  },
];

let server = null;
let status = { running: false, error: '' };
let onChange = () => {};

async function rpc(msg) {
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Invalid request');
  if (msg.id === undefined) return null; // a notification: nothing to answer

  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'onyx-calendar', title: 'Onyx Calendar', version },
        instructions: 'The user\'s master calendar: Google, Outlook and local time blocks merged, plus tasks. Times are in the user\'s local time zone.',
      });
    }
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return fail(-32602, `Unknown tool: ${msg.params?.name}`);
      try {
        const result = await tool.run(msg.params.arguments || {});
        if (tool.write) onChange();
        return reply({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (err) {
        return reply({ content: [{ type: 'text', text: err.message }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

function authorised(req) {
  const given = Buffer.from((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(store.data.secrets.mcpToken);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

// The Android app runs in a web view with its own origin, so cross-origin
// requests are allowed. The token is still required for everything but /health.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Protocol-Version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '600',
};

function send(res, code, body, headers = {}) {
  const text = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(code, { ...CORS, ...(text ? { 'Content-Type': 'application/json; charset=utf-8' } : {}), ...headers });
  res.end(text);
}

// Commands the Android app may run (see api.js), set by main.js.
let appApi = {};
const READS = new Set(['state', 'events', 'tasks', 'refresh']);

async function appRpc(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' }, { Allow: 'POST' });
  let msg;
  try {
    msg = JSON.parse(await readBody(req));
  } catch {
    return send(res, 400, { ok: false, error: 'Bad request.' });
  }
  const fn = Object.hasOwn(appApi, msg?.name) ? appApi[msg.name] : null;
  if (!fn) return send(res, 404, { ok: false, error: `Unknown command: ${msg?.name}` });
  try {
    const value = await fn(...(Array.isArray(msg.args) ? msg.args : []));
    if (!READS.has(msg.name)) onChange();
    return send(res, 200, { ok: true, value: value ?? null });
  } catch (err) {
    return send(res, 200, { ok: false, error: err.message || String(err) });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://onyx');
  const route = url.pathname.replace(/\/+$/, '') || '/';
  if (req.method === 'OPTIONS') return send(res, 204);
  if (route === '/health') return send(res, 200, { ok: true, name: 'onyx-calendar', version });
  if (!authorised(req)) return send(res, 401, { ok: false, error: 'Missing or wrong token. Send "Authorization: Bearer <token>" (the token is in Onyx Calendar > Settings > MCP server).' }, { 'WWW-Authenticate': 'Bearer' });
  if (route === '/app/rpc') return appRpc(req, res);

  if (route === '/mcp' || route === '/') {
    // No server-initiated stream and no sessions: every POST is answered with plain JSON.
    if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' }, { Allow: 'POST' });
    let msg;
    try {
      msg = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    const replies = (await Promise.all((Array.isArray(msg) ? msg : [msg]).map(rpc))).filter(Boolean);
    if (!replies.length) return send(res, 202);
    return send(res, 200, Array.isArray(msg) ? replies : replies[0]);
  }

  if (req.method !== 'GET') return send(res, 405, { error: 'Use GET.' }, { Allow: 'GET' });
  const args = Object.fromEntries(url.searchParams);
  try {
    if (route === '/api/agenda') return send(res, 200, await agenda(args));
    if (route === '/api/tasks') return send(res, 200, await tasks(args));
    if (route === '/api/calendars') return send(res, 200, { calendars: listCalendars() });
    if (route === '/api/tags') return send(res, 200, { tags: hub.allTags() });
  } catch (err) {
    return send(res, 400, { error: err.message });
  }
  return send(res, 404, { error: 'Not found. Try /mcp, /api/agenda, /api/tasks, /api/tags or /api/calendars.' });
}

function stop() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.closeAllConnections?.();
    server.close(() => resolve());
    server = null;
    status = { running: false, error: '' };
  });
}

/** (Re)starts the server from the current settings. Never throws; see info().error. */
async function start(changed) {
  if (changed) onChange = changed;
  await stop();
  const { enabled, port, lan } = store.data.settings.mcp;
  if (!enabled) return;
  await new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      handle(req, res).catch((err) => { if (!res.headersSent) send(res, 500, { error: err.message }); else res.end(); });
    });
    s.once('error', (err) => {
      status = { running: false, error: err.code === 'EADDRINUSE' ? `Port ${port} is already in use. Pick another port.` : err.message };
      resolve();
    });
    s.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
      server = s;
      status = { running: true, error: '' };
      resolve();
    });
  });
}

function info() {
  const { enabled, port, lan } = store.data.settings.mcp;
  // Home-network addresses first, then Tailscale (100.64.0.0/10), which reaches the PC from anywhere.
  const rank = (a) => (/^(192\.168|10)\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a) ? 0 : /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a) ? 1 : 2);
  // Virtual adapters (WSL, Hyper-V, Docker, VMs) have addresses no phone can reach.
  const virtual = /vEthernet|WSL|Hyper-V|Docker|VirtualBox|VMware|Loopback/i;
  const addresses = Object.entries(os.networkInterfaces())
    .filter(([name]) => !virtual.test(name))
    .flatMap(([, list]) => list)
    .filter((n) => n && n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.'))
    .map((n) => n.address)
    .sort((a, b) => rank(a) - rank(b));
  return { enabled, port, lan, ...status, token: store.data.secrets.mcpToken, addresses: lan ? addresses : [] };
}

module.exports = { start, stop, info, rpc, TOOLS, setAppApi: (handlers) => { appApi = handlers; } };
