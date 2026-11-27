// 1.144.0: Unstick, for when you know what to do and can't start; and a new whiteboard icon.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadUnstick() {
  const window = {};
  vm.runInNewContext(read('src/renderer/unstick.js'), { window });
  return window.OnyxUnstick;
}

test("every state leads to cards that exist, each with steps, evidence and real sources", () => {
  const U = loadUnstick();
  assert.equal(U.STATES.length, 9);
  for (const st of U.STATES) {
    assert.ok(st.cards.length >= 3, st.id);
    for (const id of st.cards) assert.ok(U.T[id], `${st.id} → ${id}`);
  }
  for (const [id, t] of Object.entries(U.T)) {
    assert.ok(t.steps.length >= 3, id);
    assert.ok(U.EVIDENCE[t.ev], id);
    for (const n of t.src) assert.ok(U.SOURCES[n - 1], `${id} source ${n}`);
    if (t.tool) assert.match(t.tool[0], /^(timer|breathe|shrink)$/, id);
  }
});

test('the button opens it on the PC and the phone, and it ships in the phone and web builds', () => {
  const app = read('src/renderer/app.js');
  assert.match(app, /\$\('#unstick-btn'\)\.onclick = \(\) => openUnstick\(\);/);
  assert.match(app, /'noise-btn', 'unstick-btn', 'aar-btn'/);
  assert.match(read('src/renderer/index.html'), /<script src="unstick\.js"><\/script>/);
  assert.match(read('scripts/build-mobile.js'), /'unstick\.js'/);
  assert.match(app, /if \(stateId === 'rescue'\) rescue\(\); else if \(st\) showState\(st\); else home\(\);/);
});

test('the whiteboard has its new icon: a board on a stand', () => {
  assert.match(read('src/renderer/app.js'), /board: '<rect x="3" y="3\.5" width="18" height="12\.5" rx="1\.8"\/>/);
});
