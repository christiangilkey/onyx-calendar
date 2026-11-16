// The music card over the lock screen (NowPlaying.java): a bar to drag through the song with the time played and
// its length, and back 15 s / previous / play-pause / next / forward 15 s, without unlocking.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const java = fs.readFileSync(path.join(__dirname, '..', 'mobile/android/app/src/main/java/com/onyxcalendar/app/NowPlaying.java'), 'utf8');

test('the lock screen\'s music card seeks: a bar to drag, and 15 second jumps', () => {
  assert.match(java, /import android\.widget\.SeekBar;/);
  assert.match(java, /t\.seekTo\(sb\.getProgress\(\) \* 1000L\);/, 'let go of the bar: it plays from there');
  assert.match(java, /boolean canSeek = length > 0 && \(actions == 0 \|\| \(actions & PlaybackState\.ACTION_SEEK_TO\) != 0\);/);
  assert.match(java, /control\(android\.R\.drawable\.ic_media_rew, "Back 15 seconds"/);
  assert.match(java, /control\(android\.R\.drawable\.ic_media_ff, "Forward 15 seconds"/);
  assert.match(java, /if \(dragging\) \{ wanted = true; return; \}/, 'not redrawn under the finger');
  assert.match(java, /if \(isPlaying && canSeek\) ui\.postDelayed\(tick, 1000\);/, 'the bar moves on while it plays');
  assert.match(java, /ui\.removeCallbacks\(tick\);/);
});

test('previous and next are always there, not only when the app lists them', () => {
  assert.match(java, /keys\.addView\(control\(android\.R\.drawable\.ic_media_previous, "Previous song", t::skipToPrevious, false\)\);/);
  assert.match(java, /keys\.addView\(control\(android\.R\.drawable\.ic_media_next, "Next song", t::skipToNext, false\)\);/);
  assert.doesNotMatch(java, /ACTION_SKIP_TO_NEXT\) != 0\) card\.addView/);
  assert.match(java, /if \(go != null\) top\.setOnClickListener/, 'only the art and the name open the app');
});
