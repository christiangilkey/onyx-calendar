// Draws the app icon to src/assets/icon.png:  npm run icon
// It is the same "Orbit" mark as the Android app (scripts/make-android-icon.js): the ring, its
// orbit and the moon on the dark violet background, as a rounded square like the phone's.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZE = 512;
const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" gradientUnits="userSpaceOnUse" cx="150" cy="120" r="560">
      <stop offset="0" stop-color="#2a2350"/><stop offset="0.55" stop-color="#0d0b1a"/><stop offset="1" stop-color="#050508"/>
    </radialGradient>
    <linearGradient id="ring" gradientUnits="userSpaceOnUse" x1="152" y1="152" x2="360" y2="360">
      <stop offset="0" stop-color="#b9a8ff"/><stop offset="0.5" stop-color="#7c6cff"/><stop offset="1" stop-color="#3fd0ff"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
    <clipPath id="tile"><rect x="16" y="16" width="480" height="480" rx="106"/></clipPath>
  </defs>
  <g clip-path="url(#tile)">
    <rect x="0" y="0" width="512" height="512" fill="url(#bg)"/>
    <circle cx="256" cy="256" r="104" fill="none" stroke="url(#ring)" stroke-width="44" opacity=".55" filter="url(#glow)"/>
    <circle cx="256" cy="256" r="104" fill="none" stroke="url(#ring)" stroke-width="40"/>
    <ellipse cx="256" cy="256" rx="168" ry="62" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="5" transform="rotate(-28 256 256)"/>
    <circle cx="389" cy="186" r="34" fill="#fff" opacity=".18"/>
    <circle cx="389" cy="186" r="20" fill="#fff"/>
  </g>
  <rect x="16" y="16" width="480" height="480" rx="106" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="3"/>
</svg>`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: SIZE, height: SIZE, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:transparent;overflow:hidden">${SVG}</body>`));
  await new Promise((r) => setTimeout(r, 400));
  const image = await win.webContents.capturePage();
  const out = path.join(__dirname, '../src/assets/icon.png');
  fs.writeFileSync(out, image.resize({ width: SIZE, height: SIZE }).toPNG());
  console.log('wrote', out, image.getSize());
  app.quit();
});
