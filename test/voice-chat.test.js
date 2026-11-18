// Talking with Hey Claude (1.134.0): what is said goes to Claude as a conversation. Claude answers, looks
// at the day, searches the web, and adds a task only when asked; the phone speaks the answer and listens
// a few seconds for a reply.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const store = require('../src/main/store');
const hub = require('../src/main/hub');
const chat = require('../src/main/voice-chat');

store.save = () => {};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const java = (f) => read(`mobile/android/app/src/main/java/com/onyxcalendar/app/${f}`);

/** Claude, scripted: each call takes the next answer; the requests are kept. */
function claude(t, answers) {
  const sent = [];
  const realFetch = global.fetch, realKey = store.data.secrets.anthropicKey, realQueue = hub.queueTask;
  t.after(() => { global.fetch = realFetch; store.data.secrets.anthropicKey = realKey; hub.queueTask = realQueue; chat._talks.clear(); });
  store.data.secrets.anthropicKey = 'sk-ant-test-0000000000000000000000';
  const made = [];
  hub.queueTask = async (task) => { made.push(task); return { taskId: `t${made.length}` }; };
  global.fetch = async (url, o) => {
    const body = JSON.parse(o.body);
    sent.push({ body: structuredClone(body), headers: o.headers });
    const a = answers.shift();
    if (a.status) return { ok: false, status: a.status, json: async () => ({ error: { message: a.message } }) };
    return { ok: true, json: async () => a };
  };
  return { sent, made };
}
const say = (text) => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text }] });

test('a question is answered, not made a task', async (t) => {
  const { sent, made } = claude(t, [say('Paris is the capital of France.')]);
  const r = await chat.ask('what is the capital of france', { convo: 'c1' });
  assert.deepEqual(r, { reply: 'Paris is the capital of France.', tasks: [], by: 'claude' });
  assert.equal(made.length, 0);
  const b = sent[0].body;
  assert.equal(b.model, 'claude-opus-5-5');
  assert.deepEqual(b.output_config, { effort: 'low' }, 'quick: a spoken answer');
  assert.deepEqual(b.tools.map((x) => x.name), ['add_task', 'get_schedule', 'web_search']);
  assert.equal(b.tools[2].type, 'web_search_20260209');
  assert.equal(b.fallbacks, 'default');
  assert.equal(sent[0].headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.match(b.messages[0].content, /^\[\w+day, .+, \d{2}:\d{2}, \d{4}-\d{2}-\d{2}\] what is the capital of france$/, 'the day and time with what was said');
  assert.match(chat.SYSTEM, /Use add_task only when they ask/);
  assert.match(chat.SYSTEM, /read out loud/);
});

test('asked for a task: Claude adds it with the tool, and says so', async (t) => {
  const { sent, made } = claude(t, [
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u1', name: 'add_task', input: { title: 'Call the dentist', date: '2030-01-02', time: '15:00', minutes: null } }] },
    say('Done, call the dentist on January second at three.'),
  ]);
  const r = await chat.ask('remind me to call the dentist on the second at three', { convo: 'c2' });
  assert.equal(r.reply, 'Done, call the dentist on January second at three.');
  assert.deepEqual(r.tasks, [{ taskId: 't1', title: 'Call the dentist', date: '2030-01-02', time: '15:00', minutes: null }]);
  assert.deepEqual([made[0].from, made[0].due, made[0].limits], ['voice', '2030-01-02', { preferred: '15:00' }]);
  assert.equal(made[0].notes, 'Said to Hey Claude: "remind me to call the dentist on the second at three"');
  const second = sent[1].body.messages;
  assert.equal(second[1].role, 'assistant', 'its own turn passed back as it came');
  assert.deepEqual(second[2].content[0], { type: 'tool_result', tool_use_id: 'u1', content: JSON.stringify(r.tasks[0]) });
});

test('what is on: the schedule tool reads the calendar', async (t) => {
  const { sent } = claude(t, [
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u1', name: 'get_schedule', input: { date: '2030-01-02', days: null } }] },
    say('You have lunch with Sam at noon.'),
  ]);
  const realEvents = hub.getEvents, realTasks = hub.getTasks;
  t.after(() => { hub.getEvents = realEvents; hub.getTasks = realTasks; });
  let range;
  hub.getEvents = async (s, e) => { range = [s, e]; return { events: [{ id: 'e', title: 'Lunch with Sam', start: '2030-01-02T12:00:00', end: '2030-01-02T13:00:00', tags: [] }], errors: [] }; };
  hub.getTasks = async () => ({ tasks: [{ id: 'k', title: 'Buy milk', tags: [] }], errors: [] });
  const r = await chat.ask('what have I got on the second', { convo: 'c3' });
  assert.equal(r.reply, 'You have lunch with Sam at noon.');
  assert.equal(new Date(range[0]).getDate(), 2);
  const out = JSON.parse(sent[1].body.messages[2].content[0].content);
  assert.equal(out.events[0].title, 'Lunch with Sam');
  assert.deepEqual(out.tasks_with_no_day, ['Buy milk']);
});

test('a conversation is remembered while it goes on, and a web search may pause the turn', async (t) => {
  const { sent } = claude(t, [
    say('It is sunny in Austin today.'),
    { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'austin weather tomorrow' } }] },
    say('Tomorrow looks rainy.'),
    say('Hi there.'),
  ]);
  await chat.ask('what is the weather in austin', { convo: 'c4' });
  const r = await chat.ask('and tomorrow', { convo: 'c4' });
  assert.equal(r.reply, 'Tomorrow looks rainy.');
  const m = sent[1].body.messages;
  assert.equal(m.length, 3, 'the last question and answer, then this one');
  assert.match(m[0].content, /what is the weather in austin$/);
  assert.equal(sent[2].body.messages.length, 4, 'a paused turn is sent back to go on');
  await chat.ask('hello', { convo: 'other' });
  assert.equal(sent[3].body.messages.length, 1, 'another conversation starts fresh');
});

test('a key that turns down the fallback beta is asked again without it', async (t) => {
  const { sent } = claude(t, [{ status: 400, message: 'Unexpected value for anthropic-beta' }, say('Hi.'), say('Hello again.')]);
  assert.equal((await chat.ask('hi')).reply, 'Hi.');
  assert.equal(sent[1].body.fallbacks, undefined);
  await chat.ask('hi again');
  assert.equal(sent.length, 3, 'not tried again with it');
});

test('no Claude: a plain task is still added, and anything else gets a hint', async (t) => {
  const { sent, made } = claude(t, []);
  store.data.secrets.anthropicKey = '';
  const q = await chat.ask('what is the capital of france');
  assert.match(q.reply, /add your Claude key/);
  assert.equal(made.length, 0);
  const a = await chat.ask('remind me to buy milk');
  assert.deepEqual([a.reply, a.tasks[0].title, made[0].title], ['Added Buy milk.', 'Buy milk', 'Buy milk']);
  await chat.ask('call mom tomorrow at five');
  assert.equal(made.length, 2, 'a day and time make it a task');
  store.data.secrets.anthropicKey = 'sk-ant-test-0000000000000000000000';
  assert.match((await chat.ask('tell me a joke', { claude: false })).reply, /switched off/);
  assert.equal(sent.length, 0, 'Claude never asked');
  await assert.rejects(chat.ask('  '), /Nothing was heard/);
  assert.match(read('src/main/api.js'), /'voice:ask': \(text, o\) => require\('\.\/voice-chat'\)\.ask\(text, o\),/);
});

test('the phone asks Claude, speaks the answer, and listens for a reply without the phrase', () => {
  const data = java('WidgetData.java');
  assert.match(data, /rpc\(ctx, "voice:ask", new JSONArray\(\)\.put\(text\)\.put\(new JSONObject\(\)\.put\("convo", convo\)\.put\("claude", claude\)\), op\)/);
  assert.match(data, /READ_MS\.set\(45000\)/, 'waits long enough for Claude');
  assert.match(data, /catch \(Unknown older\) \{[\s\S]{0,700}JSONObject r = voiceTask\(ctx, text, claude\);/, 'an older PC: a plain task, as before');
  assert.match(data, /if \(away && VoiceWake\.asksForTask\(text\)\)/, 'out of reach: only a plain task waits');
  const svc = java('VoiceService.java');
  assert.match(svc, /JSONObject r = WidgetData\.voiceAsk\(c, cmd, id, useClaude\);/);
  assert.match(svc, /if \(speaking\) continue; \/\/ its own voice: not heard/);
  assert.match(svc, /waitUntil = System\.currentTimeMillis\(\) \+ FOLLOW_MS;/);
  assert.match(svc, /AudioAttributes\.USAGE_ASSISTANT/);
  assert.match(svc, /static boolean talk\(Context c\) \{ return prefs\(c\)\.getBoolean\("talk", true\); \}/);
  assert.match(java('OnyxWidgetPlugin.java'), /if \(call\.hasOption\("talk"\)\) VoiceService\.setTalk\(c, call\.getBoolean\("talk", true\)\);/);
  assert.match(java('VoiceWake.java'), /static boolean asksForTask\(String said\)/);
  assert.match(read('mobile/android/app/src/main/AndroidManifest.xml'), /<action android:name="android\.intent\.action\.TTS_SERVICE" \/>/);
  const app = read('src/renderer/app.js');
  assert.match(app, /field\('Speak answers', /);
  assert.match(app, /toggle\(v\.talk !== false, \(talk\) => set\(\{ talk \}\)\)/);
});

test('1.134.1: a PC too old to talk never makes a question a task, and answers are spoken in English', () => {
  const data = java('WidgetData.java');
  assert.match(data, /catch \(Unknown older\) \{[\s\S]{0,300}if \(!VoiceWake\.asksForTask\(text\)\) \{[\s\S]{0,200}out\.put\("state", "old"\)/);
  const svc = java('VoiceService.java');
  assert.match(svc, /english\(\);/);
  assert.match(svc, /tts\.setLanguage\(want\)/);
  assert.match(svc, /\("old"\.equals\(state\)\) \{\s*b\.setContentTitle\("Update Onyx on your PC"\)/);
});
