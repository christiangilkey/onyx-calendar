// Copies the calendar window into mobile/www for the Android app:  npm run mobile
// The same files as the desktop window, minus the demo data, with FullCalendar
// bundled alongside, network requests to the PC allowed, and Onyx's engine
// (engine.js, scripts/build-engine.js) for when the phone works without the PC.
// buildWww() also makes Onyx on the web (scripts/build-web.js).
const fs = require('fs');
const path = require('path');
const { build: buildEngine } = require('./build-engine');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src/renderer');

function buildWww(out, { web = false } = {}) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });

  for (const file of ['app.js', 'graph.js', 'focus-plan.js', 'remote.js', 'styles.css', 'changelog.js']) {
    fs.copyFileSync(path.join(src, file), path.join(out, file));
  }
  fs.copyFileSync(path.join(root, 'node_modules/fullcalendar/index.global.min.js'), path.join(out, 'vendor/fullcalendar.js'));
  // Pictures and video the window uses (the Hyperfocus study companion).
  fs.cpSync(path.join(src, 'assets'), path.join(out, 'assets'), { recursive: true });
  const engine = buildEngine();
  fs.writeFileSync(path.join(out, 'engine.js'), engine.text);

  let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
  const swap = (from, to) => {
    if (!html.includes(from)) throw new Error(`index.html no longer contains: ${from}`);
    html = html.replace(from, to);
  };
  swap('../../node_modules/fullcalendar/index.global.min.js', 'vendor/fullcalendar.js');
  swap('  <script src="mock.js"></script>\n', '');
  if (web) {
    // On the web: no PC to reach, only Google, Microsoft and the rest over https.
    fs.writeFileSync(path.join(out, 'web.js'), '// Onyx on the web: remote.js runs everything on the engine, with no PC.\nwindow.ONYX_WEB = true;\n');
    swap("font-src 'self' data:", "font-src 'self' data:; connect-src 'self' https:");
    swap('<script src="remote.js"></script>', '<script src="web.js"></script>\n  <script src="engine.js"></script>\n  <script src="remote.js"></script>');
  } else {
    // The phone talks to Onyx on the PC over the home network (or Tailscale), and to Google itself when the PC is off.
    swap("font-src 'self' data:", "font-src 'self' data:; connect-src 'self' http: https:");
    swap('<script src="remote.js"></script>', '<script src="engine.js"></script>\n  <script src="remote.js"></script>');
  }
  fs.writeFileSync(path.join(out, 'index.html'), html);
  return { engine };
}

if (require.main === module) {
  const { engine } = buildWww(path.join(root, 'mobile/www'));
  console.log(`mobile/www ready (engine.js: ${engine.modules.length} modules)`);
}

module.exports = { buildWww };
