// Hyperfocus's study companion (body doubling): the video and its mask are there, the mask has
// see-through parts and the video's shape, the window is allowed to play them, and the phone
// app is given them too.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'src/renderer/assets');

test('the companion video and its mask are in the window\'s files', () => {
  const video = fs.readFileSync(path.join(assets, 'bodydouble.mp4'));
  assert.equal(video.subarray(4, 8).toString('latin1'), 'ftyp', 'an MP4');
  const png = fs.readFileSync(path.join(assets, 'bodydouble-mask.png'));
  assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
  const [w, hgt, colorType] = [png.readUInt32BE(16), png.readUInt32BE(20), png[25]];
  assert.equal(w / hgt, 16 / 9, 'the mask has the video\'s shape');
  assert.equal(colorType, 6, 'the mask has an alpha channel (the see-through wall)');
});

test('the window may play it (its own files only) and the phone app gets the assets', () => {
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /default-src 'self'/);
  assert.doesNotMatch(csp, /media-src/, 'no narrower rule for video');
  assert.match(csp, /img-src 'self'/, 'the mask is an image');
  const build = fs.readFileSync(path.join(root, 'scripts/build-mobile.js'), 'utf8');
  assert.match(build, /cpSync\(path\.join\(src, 'assets'\), path\.join\(out, 'assets'\)/);
  assert.match(fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8'), /mask-image: url\(assets\/bodydouble-mask\.png\)/);
});
