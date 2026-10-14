// Draws the Android launcher icons and splash screens into mobile/android:
//   npx electron scripts/make-android-icons.js
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const RES = path.join(__dirname, '../mobile/android/app/src/main/res');
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// The calendar glyph from the desktop icon, on a 512 grid.
const GLYPH = `
  <rect x="136" y="150" width="240" height="226" rx="44" fill="none" stroke="#f1f1f4" stroke-width="30"/>
  <path d="M196 118v64M316 118v64" stroke="#f1f1f4" stroke-width="30" stroke-linecap="round"/>
  <rect x="196" y="238" width="120" height="78" rx="18" fill="#8b7cff"/>`;

const TILE = `
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b1b20"/><stop offset="1" stop-color="#000"/></linearGradient></defs>
  <rect x="0" y="0" width="512" height="512" rx="__R__" fill="url(#g)"/>`;

/** The glyph, scaled so its 512 grid fills `box` pixels, centred in a w×h picture. */
function svg(w, h, box, { background = 'none', tile = '' } = {}) {
  const s = box / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${background}"/>
    <g transform="translate(${(w - box) / 2} ${(h - box) / 2}) scale(${s})">${tile}${GLYPH}</g></svg>`;
}

let win;
async function render(file, w, h, markup) {
  win.setContentSize(w, h);
  await win.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:transparent;overflow:hidden">${markup}</body>`));
  await new Promise((r) => setTimeout(r, 120));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
  fs.writeFileSync(file, image.resize({ width: w, height: h }).toPNG());
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 600, height: 600, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } });
  for (const [density, k] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, `mipmap-${density}`);
    const legacy = Math.round(48 * k);
    // Older launchers: the full dark tile.
    await render(path.join(dir, 'ic_launcher.png'), legacy, legacy, svg(legacy, legacy, legacy, { tile: TILE.replace('__R__', '112') }));
    await render(path.join(dir, 'ic_launcher_round.png'), legacy, legacy, svg(legacy, legacy, legacy, { tile: TILE.replace('__R__', '256') }));
    // Adaptive icons: the glyph inside the 72dp safe zone of a 108dp layer, on a black background.
    const fg = Math.round(108 * k);
    await render(path.join(dir, 'ic_launcher_foreground.png'), fg, fg, svg(fg, fg, Math.round(fg * 0.86)));
  }
  // Splash screens: black, with the glyph small in the middle.
  for (const dir of fs.readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
    const file = path.join(RES, dir, 'splash.png');
    if (!fs.existsSync(file)) continue;
    const { width, height } = nativeImage.createFromPath(file).getSize();
    await render(file, width, height, svg(width, height, Math.round(Math.min(width, height) * 0.34), { background: '#000000' }));
  }
  fs.writeFileSync(path.join(RES, 'values/ic_launcher_background.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#000000</color>\n</resources>\n');
  console.log('android icons and splash screens written');
  app.quit();
});
