// The inbox for Magic add: tasks that arrive from outside Onyx (added in Google Tasks or
// Outlook, by another app, or through the MCP server) wait here until they are planned into
// a day. Onyx notices them when it reads a task list: a task it has not seen before, that it
// did not add itself and that has no time yet. The first read of a list only learns what is
// already there, so an old backlog never floods the inbox.
//
// store.data.inboxItems: task id -> { at, state: 'seen' | 'new' | 'dismissed' | 'planned', from? }
// store.data.inboxLists: list id -> true once the list has been read

const store = require('./store');

const mine = () => {
  store.data.inboxItems ??= {};
  store.data.inboxLists ??= {};
  return store.data;
};

/** Looks at one list's open tasks (unified, as hub.listTasks makes them) for ones not seen before. */
function scanList(listId, tasks, now = Date.now()) {
  const d = mine();
  const baseline = !d.inboxLists[listId];
  let changed = baseline;
  const live = new Set();
  for (const t of tasks) {
    live.add(t.id);
    if (d.inboxItems[t.id]) continue;
    changed = true;
    // Already scheduled (a time in its name), made by Onyx, or only the Pi's copy of an entry: not for the inbox.
    d.inboxItems[t.id] = { at: now, state: baseline || t.mirror || t.start || t.madeHere ? 'seen' : 'new' };
  }
  // Done or deleted tasks are let go of, so the list does not grow for ever.
  const prefix = `${listId}/`;
  for (const id of Object.keys(d.inboxItems)) {
    if (id.startsWith(prefix) && !live.has(id)) { delete d.inboxItems[id]; changed = true; }
  }
  d.inboxLists[listId] = true;
  if (changed) store.save();
}

/** A task another app made through Onyx (the MCP server): it counts as arriving from outside. */
function add(id, from = 'mcp') {
  mine().inboxItems[id] = { at: Date.now(), state: 'new', from };
  store.save();
}

function mark(id, state) {
  const item = mine().inboxItems[id] || { at: Date.now() };
  mine().inboxItems[id] = { ...item, state };
  store.save();
}

/** The ids waiting to be planned, oldest first: open, untimed, not on the backburner, not made by Onyx. */
function pendingIds(tasks) {
  const items = mine().inboxItems;
  const out = [];
  for (const t of tasks) {
    const item = items[t.id];
    if (item?.state !== 'new') continue;
    if (t.done || t.mirror || t.start || t.backburner) continue;
    if (t.madeHere && !item.from) { item.state = 'seen'; continue; } // Onyx's own, caught before it was marked
    out.push(t.id);
  }
  return out.sort((a, b) => items[a].at - items[b].at);
}

const forget = (id) => { delete mine().inboxItems[id]; };

module.exports = { scanList, add, mark, pendingIds, forget };
