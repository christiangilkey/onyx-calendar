// On the PC, Shift and a drag across the calendar picks out several blocks; dragging one of them moves them all,
// by as many days and the same change of time, with one Undo. These guard the parts that are easy to break.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/styles.css'), 'utf8');
const body = (name) => {
  const at = app.indexOf(`function ${name}(`);
  assert.ok(at > 0, `${name} exists`);
  return app.slice(at, app.indexOf('\n  }\n', at));
};

test('Shift and a press on the days is the box\'s: the calendar never sees it (no new block, no drag)', () => {
  const s = body('multiSelect');
  assert.match(s, /if \(MOBILE\) return;/, 'the PC only');
  assert.match(s, /if \(!e\.shiftKey \|\| e\.button !== 0[^\n]*\) return;\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);/);
  assert.match(s, /addEventListener\('mousedown', \(e\) => \{ if \(multi\.from\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); \} \}, true\)/, 'FullCalendar starts its drags on mousedown');
  assert.match(s, /addEventListener\('click'[\s\S]*?multi\.clickAfter/, 'the click that ends it opens nothing');
  assert.match(app, /multiSelect\(\);/);
});

test('the box picks only blocks that can move and that show (not those under "+N more")', () => {
  const s = body('bandHits');
  assert.match(s, /getComputedStyle\(el\)\.visibility !== 'visible'/);
  assert.match(s, /groupable\(src\)/);
  assert.match(app, /const groupable = \(src\) => !!src && !src\.pending && \(\(src\.kind === 'event' && !!src\.writable\) \|\| \(src\.kind === 'task' && !!src\.movable && !src\.mirror\)\)/);
});

test('dragging a picked block moves them all, a repeat once, with one Undo', () => {
  assert.match(app, /eventDrop: \(info\) => \(carriedWith\(info\.event\.id\) \? moveMany\(info\) : onMove\(info\)\)/);
  const s = body('moveMany');
  assert.match(s, /const days = Math\.round\(\(fromYmd\(ymd\(e\.start\)\) - fromYmd\(ymd\(old\.start\)\)\) \/ 86400000\);/, 'by whole days, so a change of clocks does not shift the time');
  assert.match(s, /const ms = e\.allDay \|\| old\.allDay \? 0 : e\.start - addDays\(old\.start, days\);/, 'and the same change of time');
  assert.match(s, /if \(series\.has\(src\.seriesId\)\) continue;/, 'a repeat moves once, however many of its days were picked');
  assert.equal((s.match(/recordAction\(/g) || []).length, 1, 'one Undo for all of them');
  assert.match(s, /skip: multi\.picked/, 'the carried one does not snap to one carried with it');
});

test('the picked ones are marked, ride along while carried, and have a bar to let them go', () => {
  assert.match(app, /multi\.picked\.has\(arg\.event\.id\) \? \['is-multi'\] : \[\]/, 'kept through a redraw');
  assert.match(app, /floatStart\(info\); multiCarryStart\(info\);/);
  assert.match(app, /floatStop\(\);\s*multiCarryStop\(\);/);
  for (const c of ['.fc .fc-event.is-multi', '.multi-band', '.multi-pill', '.drag-float .drag-buddy']) assert.ok(css.includes(c), c);
  assert.match(body('multiSelect'), /e\.key === 'Escape' && multi\.picked\.size/);
});
