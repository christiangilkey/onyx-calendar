// Draws the app icon to src/assets/icon.png:  npm run icon
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZE = 512;
const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1b1b20"/><stop offset="1" stop-color="#000"/>
    </linearGradient>
  </defs>
  <rect x="24" y="24" width="464" height="464" rx="112" fill="url(#g)" stroke="#2c2c33" stroke-width="6"/>
  <rect x="136" y="150" width="240" height="226" rx="44" fill="none" stroke="#f1f1f4" stroke-width="30"/>
  <path d="M196 118v64M316 118v64" stroke="#f1f1f4" stroke-width="30" stroke-linecap="round"/>
  <rect x="196" y="238" width="120" height="78" rx="18" fill="#8b7cff"/>
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
