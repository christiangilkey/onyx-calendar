// "Hey Claude": the phone listens for the phrase (VoiceService, offline), and what is said after it becomes a
// task in the inbox. The PC reads the day, time and length out of the words (voice.js), or Claude does with a
// key (voice-task.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const V = require('../src/main/voice');
const store = require('../src/main/store');
const hub = require('../src/main/hub');
const voiceTask = require('../src/main/voice-task');

store.save = () => {};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const java = (f) => read(`mobile/android/app/src/main/java/com/onyxcalendar/app/${f}`);
const NOW = new Date(2026, 10, 6, 14, 20); // Friday 6 November 2026, 2:20 pm
const said = (s) => V.parseSpoken(s, NOW);

test('numbers as the phone hears them: words, compounds and ordinals', () => {
  assert.deepEqual(['seven', 'twenty five', 'forty-five', '15', 'oh'].map(V.num), [7, 25, 45, 15, 0]);
  assert.deepEqual(['third', 'twenty first', '12th', 'thirtieth'].map(V.ord), [3, 21, 12, 30]);
  assert.equal(V.num('banana'), null);
  assert.equal(V.normal('Call Mom at 3 P.M., please!'), 'call mom at 3 pm please');
});

test('the day: today, tomorrow, weekdays, in N days, next week, dates by name', () => {
  assert.deepEqual(said('call the dentist tomorrow at three thirty p m'), { title: 'Call the dentist', date: '2026-11-07', time: '15:30', minutes: null });
  assert.equal(said('take out the bins tonight').date, '2026-11-06');
  assert.equal(said('renew passport the day after tomorrow').date, '2026-11-08');
  assert.equal(said('email sarah next monday').date, '2026-11-09');
  assert.equal(said('pick up the kids on friday').date, '2026-11-13', 'said on a Friday: next week\'s');
  assert.equal(said('team lunch this friday').date, '2026-11-06');
  assert.equal(said('call bank in three days').date, '2026-11-09');
  assert.equal(said('book flights in a week').date, '2026-11-13');
  assert.equal(said('renew passport next week').date, '2026-11-09');
  assert.equal(said('clean the garage this weekend').date, '2026-11-07');
  assert.equal(said('pay rent on december first').date, '2026-12-01');
  assert.equal(said('dentist on the twelfth').date, '2026-11-12');
  assert.equal(said('dentist on the second').date, '2026-12-02', 'a day of the month gone by: next month');
  assert.equal(said('party on the fourth of july').date, '2027-07-04', 'a date gone by this year: next year');
  assert.equal(said('buy milk').date, null);
});

test('the time of day: words, digits, am and pm, half past and quarter to, noon', () => {
  assert.equal(said('meeting at ten a m').time, '10:00');
  assert.equal(said('study arabic at 19:30').time, '19:30');
  assert.equal(said('remind me to pick up the kids at half past four').time, '16:30', 'a bare 4 is in the afternoon');
  assert.equal(said('lunch with jake at quarter to one').time, '12:45');
  assert.equal(said('go running at six in the morning').time, '06:00');
  assert.equal(said('dinner with mom at seven').time, '19:00', 'dinner: the evening');
  assert.equal(said('call mom at noon on sunday').time, '12:00');
  assert.equal(said('call bank at nine thirty').time, '09:30');
  assert.equal(said('stand up at seven fifteen pm').time, '19:15');
  assert.equal(said('pick up 5 boxes at the store').time, null, 'a number that is not a time stays in the name');
  assert.equal(said('pick up 5 boxes at the store').title, 'Pick up 5 boxes at the store');
});

test('how long, and what is left as the name', () => {
  assert.deepEqual(said('i need to finish the report by wednesday for two hours'), { title: 'Finish the report', date: '2026-11-11', time: null, minutes: 120 });
  assert.equal(said('workout for forty five minutes').minutes, 45);
  assert.equal(said('clean the garage for an hour and a half').minutes, 90);
  assert.equal(said('read for half an hour').minutes, 30);
  assert.equal(said('add a task to email sarah').title, 'Email sarah');
  assert.equal(said('remind me to water the plants').title, 'Water the plants');
  assert.equal(said('add milk to my list').title, 'Milk');
  assert.equal(said('set a reminder to call the vet').title, 'Call the vet');
  assert.equal(said('hey claude add eggs').title, 'Eggs', 'the phrase, if it came along');
  assert.equal(said('make dinner').title, 'Make dinner', '"make" on its own is the task');
  assert.equal(said('put the bins out').title, 'Put the bins out');
  assert.equal(said('address the letters').title, 'Address the letters');
  assert.equal(said('i have a dentist appointment at 3').title, 'I have a dentist appointment');
});

test('Claude\'s answer is checked: anything doubtful is left out, and no title means none of it is used', () => {
  assert.deepEqual(voiceTask.readAnswer('{"title":"Call Dr. Lee","date":"2026-11-07","time":"15:30","minutes":30}'), { title: 'Call Dr. Lee', date: '2026-11-07', time: '15:30', minutes: 30 });
  assert.deepEqual(voiceTask.readAnswer('Sure! {"title":"Buy milk","date":"tomorrow","time":"3pm","minutes":-4}'), { title: 'Buy milk', date: null, time: null, minutes: null });
  assert.equal(voiceTask.readAnswer('{"title":""}'), null);
  assert.equal(voiceTask.readAnswer('no json here'), null);
  assert.match(voiceTask.SYSTEM, /never add anything they did not say/);
});

test('voice:task makes the task in the inbox, from Hey Claude: read here without a key, by Claude with one', async (t) => {
  const made = [];
  const realQueue = hub.queueTask, realFetch = global.fetch, realKey = store.data.secrets.anthropicKey;
  t.after(() => { hub.queueTask = realQueue; global.fetch = realFetch; store.data.secrets.anthropicKey = realKey; });
  hub.queueTask = async (task) => { made.push(task); return { taskId: `t${made.length}`, planned: false }; };
  let asked = 0;
  global.fetch = async () => { asked++; return { ok: true, json: async () => ({ content: [{ text: '{"title":"Call Dr. Lee","date":"2030-01-02","time":"15:30","minutes":null}' }] }) }; };

  store.data.secrets.anthropicKey = '';
  const a = await voiceTask.add('call the dentist tomorrow at three');
  assert.equal(asked, 0, 'no key: Claude is not asked');
  assert.equal(a.by, 'onyx');
  assert.equal(made[0].from, 'voice');
  assert.equal(made[0].title, 'Call the dentist');
  assert.deepEqual(made[0].limits, { preferred: '15:00' }, 'the time said becomes the time Magic add aims for');
  assert.equal(made[0].notes, 'Said to Hey Claude: "call the dentist tomorrow at three"');

  store.data.secrets.anthropicKey = 'sk-ant-test-0000000000000000000000';
  const b = await voiceTask.add('call doctor lee on the second at three thirty');
  assert.equal(asked, 1);
  assert.deepEqual([b.by, b.title, b.date, b.time, b.taskId], ['claude', 'Call Dr. Lee', '2030-01-02', '15:30', 't2']);
  await voiceTask.add('buy milk', { claude: false });
  assert.equal(asked, 1, 'Claude off on the phone: not asked');

  global.fetch = async () => { throw new Error('offline'); };
  const c = await voiceTask.add('buy eggs tomorrow');
  assert.deepEqual([c.by, c.title], ['onyx', 'Buy eggs'], 'Claude out of reach: read here instead');
  await assert.rejects(voiceTask.add('   '), /Nothing was heard/);
  assert.match(read('src/main/api.js'), /'voice:task': \(text, o\) => require\('\.\/voice-task'\)\.add\(text, o\),/);
});

test('the phone: offline listening in a microphone service, its model fetched once, the words sent to the PC', () => {
  const manifest = read('mobile/android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /<uses-permission android:name="android\.permission\.RECORD_AUDIO" \/>/);
  assert.match(manifest, /<uses-permission android:name="android\.permission\.FOREGROUND_SERVICE_MICROPHONE" \/>/);
  assert.match(manifest, /android:name="\.VoiceService"\s+android:exported="false"\s+android:foregroundServiceType="microphone"/);
  const gradle = read('mobile/android/app/build.gradle');
  assert.match(gradle, /implementation 'com\.alphacephei:vosk-android:0\.3\.75@aar'/);
  assert.match(gradle, /ndk \{ abiFilters 'arm64-v8a', 'armeabi-v7a' \}/);
  const svc = java('VoiceService.java');
  assert.match(svc, /new AudioRecord\(MediaRecorder\.AudioSource\.VOICE_RECOGNITION, RATE/);
  assert.match(svc, /startForeground\(NOTE_LISTEN, n, ServiceInfo\.FOREGROUND_SERVICE_TYPE_MICROPHONE\)/);
  assert.match(svc, /JSONObject r = WidgetData\.voiceTask\(c, cmd, useClaude\);/);
  assert.doesNotMatch(svc, /HttpURLConnection|new URL\(/, 'the service sends no sound anywhere');
  // The buttons on its notification don't start the microphone; a start to listen shows the notification first.
  assert.ok(svc.indexOf('if (TURN_OFF.equals(action))') < svc.indexOf('if (!showListening())'));
  assert.ok(svc.indexOf('if (UNDO.equals(action))') < svc.indexOf('if (!showListening())'));
  const model = java('VoiceModel.java');
  assert.match(model, /static final String URL = "https:\/\/alphacephei\.com\/vosk\/models\/vosk-model-small-en-us-0\.15\.zip";/);
  assert.match(model, /if \(!out\.getCanonicalPath\(\)\.startsWith\(root\)\) throw/, 'nothing written outside its folder');
  assert.match(model, /if \(!part\.renameTo\(m\)\)/, 'unpacked aside, then put in place');
  const data = java('WidgetData.java');
  assert.match(data, /if \(code == 404 && text\.contains\("Unknown command"\)\) throw new Unknown\(\);/);
  assert.match(data, /rpc\(ctx, "voice:task", new JSONArray\(\)\.put\(text\)\.put\(new JSONObject\(\)\.put\("claude", claude\)\), op\)/);
  assert.match(data, /catch \(Unknown older\) \{/, 'an older PC: a plain task, from Hey Claude');
  assert.match(data, /q\.put\(new JSONObject\(\)\.put\("op", op\)\.put\("title", text\)\.put\("voice", true\)/, 'the PC out of reach: kept, sent later');
  for (const a of ['MainActivity.java', 'LockPanelActivity.java', 'LauncherActivity.java']) assert.match(java(a), /VoiceService\.ensure\(this\);/, `${a} starts it again`);
  const plugin = java('OnyxWidgetPlugin.java');
  assert.match(plugin, /@Permission\(strings = \{ android\.Manifest\.permission\.RECORD_AUDIO \}, alias = "microphone"\)/);
  assert.match(plugin, /requestPermissionForAlias\("microphone", call, "voiceMicAnswered"\);/);
});

test('the wake phrase is found by sound, at the start of what is said', () => {
  const wake = java('VoiceWake.java');
  assert.match(wake, /static final String DEFAULT = "hey claude";/);
  assert.match(wake, /private static final int MAX_START = 1;/, 'not in the middle of a conversation');
  assert.match(wake, /return \(near && soundex\(heard\)\.equals\(soundex\(want\)\)\) \|\| \(want\.length\(\) >= 5 && distance\(heard, want\) <= 1\);/);
});

test('the app: Settings → Hey Claude on the phone, tasks from it named so in the inbox', () => {
  const app = read('src/renderer/app.js');
  assert.match(app, /\.\.\.\(onyx\.voice \? \['voice'\] : \[\]\)/, 'listed under This phone, in an app that has it');
  assert.match(app, /voice: \{ name: 'Hey Claude', icon: 'mic'/);
  assert.match(app, /const FROM_NAME = \{ mcp: 'another app', tamkeen: 'Tamkeen', lock: 'your lock screen', voice: 'Hey Claude' \};/);
  const pane = app.slice(app.indexOf('    voice() {'), app.indexOf('    launcher() {'));
  assert.match(pane, /set\(\{ download: true \}\)/);
  assert.match(pane, /toggle\(!!v\.on && v\.mic !== false, \(on\) => set\(\{ on \}\), !ready\)/, 'on once the model is there');
  assert.match(pane, /onyx\.voice\.state\(\)\.then\(draw\)/);
  const remote = read('src/renderer/remote.js');
  assert.match(remote, /voice: Widget\?\.voice \? \{/);
  assert.match(remote, /await call\('voice:task', String\(it\.title \|\| ''\), \{ claude: it\.claude !== false \}\);/, 'no PC: this phone makes them');
  assert.match(remote, /if \(made\.length\) await Widget\.voice\(\{ done: made \}\);/);
});
