// Draws the Android app icon ("Orbit") and splash screens into mobile/android/app/src/main/res:
//
//   PLAYWRIGHT=/path/to/playwright node scripts/make-android-icon.js
//
// It renders the SVGs below with Playwright's Chromium (set CHROMIUM to use another browser
// binary). The design is drawn on a 512 square that is the visible part of Android's
// adaptive icon (72 of its 108dp); the layers are drawn on the full 108dp, so the launcher
// can mask and move them.
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const RES = path.join(__dirname, '../mobile/android/app/src/main/res');
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const DEFS = `
  <radialGradient id="bg" gradientUnits="userSpaceOnUse" cx="150" cy="120" r="560">
    <stop offset="0" stop-color="#2a2350"/><stop offset="0.55" stop-color="#0d0b1a"/><stop offset="1" stop-color="#050508"/>
  </radialGradient>
  <linearGradient id="ring" gradientUnits="userSpaceOnUse" x1="152" y1="152" x2="360" y2="360">
    <stop offset="0" stop-color="#b9a8ff"/><stop offset="0.5" stop-color="#7c6cff"/><stop offset="1" stop-color="#3fd0ff"/>
  </linearGradient>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>`;

// The ring (an "O"), a faint orbit around it and the bright moon on that orbit.
const MARK = `
  <circle cx="256" cy="256" r="104" fill="none" stroke="url(#ring)" stroke-width="44" opacity=".55" filter="url(#glow)"/>
  <circle cx="256" cy="256" r="104" fill="none" stroke="url(#ring)" stroke-width="40"/>
  <ellipse cx="256" cy="256" rx="168" ry="62" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="5" transform="rotate(-28 256 256)"/>
  <circle cx="389" cy="186" r="34" fill="#fff" opacity=".18"/>
  <circle cx="389" cy="186" r="20" fill="#fff"/>`;

// Android 13+ themed icons: one colour, which the system tints.
const MONO = `
  <circle cx="256" cy="256" r="104" fill="none" stroke="#fff" stroke-width="40"/>
  <ellipse cx="256" cy="256" rx="168" ry="62" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="8" transform="rotate(-28 256 256)"/>
  <circle cx="389" cy="186" r="22" fill="#fff"/>`;

const BACKGROUND = '<rect x="-128" y="-128" width="768" height="768" fill="url(#bg)"/>';
const svg = (body, viewBox) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><defs>${DEFS}</defs>${body}</svg>`;
const LAYER = '-128 -128 768 768'; // the full 108dp layer around the visible 72dp
const FULL = '0 0 512 512';

async function main() {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await browser.newPage();
  async function draw(markup, width, height, file, { clip = '', background = 'transparent' } = {}) {
    await page.setViewportSize({ width, height });
    await page.setContent(`<html><body style="margin:0;background:${background}">
      <div style="width:${width}px;height:${height}px;display:grid;place-items:center;overflow:hidden;${clip}">${markup}</div></body></html>`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, omitBackground: background === 'transparent' });
  }
  const sized = (markup, px) => markup.replace('<svg ', `<svg width="${px}" height="${px}" `);

  for (const [name, k] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, `mipmap-${name}`);
    const layer = Math.round(108 * k), legacy = Math.round(48 * k);
    await draw(sized(svg(BACKGROUND, LAYER), layer), layer, layer, path.join(dir, 'ic_launcher_background.png'));
    await draw(sized(svg(MARK, LAYER), layer), layer, layer, path.join(dir, 'ic_launcher_foreground.png'));
    await draw(sized(svg(MONO, LAYER), layer), layer, layer, path.join(dir, 'ic_launcher_monochrome.png'));
    // Before Android 8 there is no masking: a rounded square, and a circle for round launchers.
    const whole = sized(svg(BACKGROUND + MARK, FULL), legacy);
    await draw(whole, legacy, legacy, path.join(dir, 'ic_launcher.png'), { clip: `border-radius:${Math.round(legacy * 0.22)}px` });
    await draw(whole, legacy, legacy, path.join(dir, 'ic_launcher_round.png'), { clip: 'border-radius:50%' });
  }

  // Splash screens (Capacitor's, shown while the app loads): the mark on black.
  for (const dir of fs.readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
    const file = path.join(RES, dir, 'splash.png');
    if (!fs.existsSync(file)) continue;
    const { width, height } = await pngSize(file);
    const mark = Math.round(Math.min(width, height) * 0.3);
    await draw(sized(svg(MARK, FULL), mark), width, height, file, { background: '#000' });
  }
  await browser.close();
}

async function pngSize(file) {
  const b = fs.readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

main().catch((err) => { console.error(err); process.exit(1); });
