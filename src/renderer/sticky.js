// A sticky note's window (sticky.html). It saves as you type, keeps lists going when you press
// Enter, and turns lines into tasks (stickies.js does the work).
(async () => {
  const $ = (id) => document.getElementById(id);
  const text = $('text'), hint = $('hint');
  const note = await window.sticky.load();
  text.value = note.text || '';
  document.body.dataset.color = note.color;
  $('pin').classList.toggle('on', !!note.onTop);

  // ---- saving: a moment after you stop typing, and straight away when the note loses focus
  let timer = null;
  const save = () => { clearTimeout(timer); timer = null; return window.sticky.text(text.value); };
  text.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(save, 400); });
  window.addEventListener('blur', () => { if (timer) save(); });
  window.addEventListener('beforeunload', () => { if (timer) save(); });

  let hintTimer = null;
  const say = (msg, plain) => {
    hint.textContent = msg;
    hint.classList.toggle('say', !plain);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hint.textContent = ''; }, 3200);
  };

  // ---- lists: Enter after "- thing" starts the next "- "; Enter on an empty "- " ends the list
  const MARK = /^(\s*)([-*•–]|\d+[.)]|\[[ xX]?\])\s/;
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); makeTask(); return; }
    if ((e.key === 'n' || e.key === 'N') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.sticky.newNote(); return; }
    if (e.key !== 'Enter' || e.shiftKey || text.selectionStart !== text.selectionEnd) return;
    const at = text.selectionStart;
    const lineStart = text.value.lastIndexOf('\n', at - 1) + 1;
    const line = text.value.slice(lineStart, at);
    const m = MARK.exec(line);
    if (!m) return;
    e.preventDefault();
    if (line.trim() === m[0].trim()) { // an empty item: the list ends here
      text.setRangeText('', lineStart, at, 'end');
    } else {
      let mark = m[2];
      if (/^\d+/.test(mark)) mark = `${parseInt(mark, 10) + 1}${mark.slice(-1)}`;
      if (/^\[/.test(mark)) mark = '[ ]';
      text.setRangeText(`\n${m[1]}${mark} `, at, at, 'end');
    }
    text.dispatchEvent(new Event('input'));
  });

  // ---- make task: the selected lines, or the whole note
  async function makeTask() {
    const selected = text.value.slice(text.selectionStart, text.selectionEnd);
    if (timer) await save();
    try {
      const n = await window.sticky.task(selected);
      say(n === 1 ? '✓ Added to your tasks' : `✓ Added ${n} tasks`);
    } catch (err) {
      say(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true);
    }
  }
  $('task').addEventListener('click', makeTask);
  // The button keeps the selection: clicking it would otherwise take the focus (and the selection) away.
  $('task').addEventListener('mousedown', (e) => e.preventDefault());

  // ---- colour, pin, new, delete
  const colors = $('colors');
  for (const c of note.colors) {
    const b = document.createElement('button');
    b.className = 'c';
    b.title = c[0].toUpperCase() + c.slice(1);
    b.dataset.c = c;
    colors.append(b);
  }
  // Each dot shows its own colour; the note's own has a ring.
  const SWATCH = { yellow: '#ffe66d', pink: '#ffb1c8', blue: '#9fd3ff', green: '#b4eea0', purple: '#d2bfff', orange: '#ffc285' };
  const mark = () => { for (const b of colors.children) { b.style.background = SWATCH[b.dataset.c]; b.classList.toggle('cur', b.dataset.c === document.body.dataset.color); } };
  mark();
  const pick = (on) => { colors.classList.toggle('open', on); $('palette').classList.toggle('on', on); $('bar').classList.toggle('picking', on); };
  $('palette').addEventListener('click', () => pick(!colors.classList.contains('open')));
  colors.addEventListener('click', async (e) => {
    const c = e.target.dataset?.c;
    if (!c) return;
    document.body.dataset.color = c;
    mark();
    pick(false);
    await window.sticky.color(c);
  });
  $('pin').addEventListener('click', async () => {
    const on = await window.sticky.pin(!$('pin').classList.contains('on'));
    $('pin').classList.toggle('on', on);
    say(on ? 'Stays on top of other windows' : 'No longer on top', true);
  });
  $('new').addEventListener('click', () => window.sticky.newNote());
  const ask = $('ask');
  $('del').addEventListener('click', () => {
    if (!text.value.trim()) { window.sticky.remove(); return; }
    ask.classList.add('open');
    $('keep').focus();
  });
  $('keep').addEventListener('click', () => { ask.classList.remove('open'); text.focus(); });
  $('really').addEventListener('click', () => { clearTimeout(timer); timer = null; window.sticky.remove(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ask.classList.contains('open')) $('keep').click(); });

  if (!text.value) text.focus();
})();
