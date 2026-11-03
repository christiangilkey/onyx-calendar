// Builds Onyx on the web into web/ (a folder of plain files any static host can serve):  npm run web
// The phone app's files with Onyx's engine, set to run with no PC: it signs in through a setup link
// from a PC (Settings → Desktops) and the sync code, and keeps in step with the PCs through Google Drive.
const path = require('path');
const fs = require('fs');
const { buildWww } = require('./build-mobile');

const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'web'));
const { engine } = buildWww(out, { web: true });
const { version } = require('../package.json');
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ version }));
fs.writeFileSync(path.join(out, '.nojekyll'), ''); // served as they are
console.log(`web/ ready: Onyx ${version} (engine.js: ${engine.modules.length} modules)`);
