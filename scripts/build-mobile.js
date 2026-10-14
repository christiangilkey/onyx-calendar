// Copies the calendar window into mobile/www for the Android app:  npm run mobile
// The same files as the desktop window, minus the demo data, with FullCalendar
// bundled alongside and network requests to the PC allowed.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src/renderer');
const out = path.join(root, 'mobile/www');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });

for (const file of ['app.js', 'graph.js', 'remote.js', 'styles.css']) {
  fs.copyFileSync(path.join(src, file), path.join(out, file));
}
fs.copyFileSync(path.join(root, 'node_modules/fullcalendar/index.global.min.js'), path.join(out, 'vendor/fullcalendar.js'));

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`index.html no longer contains: ${from}`);
  html = html.replace(from, to);
};
swap('../../node_modules/fullcalendar/index.global.min.js', 'vendor/fullcalendar.js');
swap('  <script src="mock.js"></script>\n', '');
// The phone talks to Onyx on the PC over the home network (or Tailscale).
swap("font-src 'self' data:", "font-src 'self' data:; connect-src 'self' http: https:");
fs.writeFileSync(path.join(out, 'index.html'), html);

console.log('mobile/www ready');
