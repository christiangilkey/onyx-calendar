// Builds engine.js, Onyx's engine for the phone and the web app (src/engine/index.js): the PC's own
// code from src/main in one file, with the parts only a PC has swapped for stand-ins.
//   node scripts/build-engine.js [out.js]   (npm run mobile and npm run web call it)
'use strict';
const fs = require('fs');
const path = require('path');
const { bundle } = require('./bundle');

const root = path.resolve(__dirname, '..');
const main = (f) => path.join(root, 'src/main', f);
const engine = (f) => path.join(root, 'src/engine', f);
const pcOnly = engine('shims/pc-only.js');

function build() {
  return bundle({
    root,
    entry: engine('index.js'),
    globals: [
      { file: engine('shims/buffer.js'), names: { Buffer: 'Buffer' } },
      { file: engine('fetch.js'), names: { fetch: 'engineFetch' } },
    ],
    // The PC's own: its file, its server, its pairing code, the News panel's local database.
    files: {
      [main('store.js')]: engine('store.js'),
      [main('mcp.js')]: engine('shims/mcp.js'),
      [main('pairing.js')]: pcOnly,
      [main('news.js')]: pcOnly,
      [main('updater.js')]: pcOnly,
    },
    builtins: {
      crypto: engine('shims/crypto.js'),
      zlib: engine('shims/zlib.js'),
      os: engine('shims/os.js'),
      path: engine('shims/path.js'),
      buffer: engine('shims/buffer.js'),
      'node-ical': engine('shims/node-ical.js'),
      fs: pcOnly, http: pcOnly, https: pcOnly, child_process: pcOnly, electron: pcOnly, sqlite: pcOnly, net: pcOnly, 'electron-updater': pcOnly, qrcode: pcOnly,
    },
  });
}

if (require.main === module) {
  const out = path.resolve(process.argv[2] || path.join(root, 'mobile/www/engine.js'));
  const { text, modules, missing } = build();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  console.log(`engine.js: ${modules.length} modules, ${(text.length / 1024).toFixed(0)} KB`);
  if (missing.length) console.log(`  not bundled (fails only if used): ${missing.join(', ')}`);
}

module.exports = { build };
