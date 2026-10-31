// The changelog: every version of Onyx and what came with it, newest first. It is shown in Settings →
// Changelog (src/renderer/changelog.js) and kept as CHANGELOG.md. Built from the release tags' notes, and for
// the early versions, whose tags have none, from their commits' own notes.
//
//   node scripts/changelog.js                                          rebuild it from the git tags
//   node scripts/changelog.js --next 1.77.0 notes.txt --title "..."    and the release about to be tagged
//
// Every release adds its entry (test/changelog.test.js fails until the newest one is package.json's version).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** The bullet points in some notes: "- one thing", wrapped lines joined back on. */
function bullets(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (/^Co-Authored-By:/i.test(line.trim())) continue;
    const m = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (m) out.push(m[1].trim());
    else if (out.length && /^\s{2,}\S/.test(line)) out[out.length - 1] += ` ${line.trim()}`; // a wrapped line
  }
  return out.map(clean).filter(Boolean);
}

/** A point as a person reads it: no file names or code in brackets, no markdown marks. */
function clean(s) {
  return s
    .replace(/\s*\((?=[^()]*(?:\.(?:js|java|json|css|html|xml|md)\b|[a-z]+\.[a-z][A-Za-z]+|[a-z][a-z]+[A-Z][a-z]|\(\)|=|_[a-z]))[^()]*\)/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])(?=\s|$)/g, '$1') // a space left before a full stop (not ".ics")
    .trim();
}

/** "1.76.1: the phone app builds again" → "The phone app builds again". */
function titleOf(subject, version) {
  const t = String(subject || '').replace(/^(Onyx( Calendar)? )?v?\d+\.\d+\.\d+\s*:?\s*/i, '').replace(/^Onyx( Calendar)?$/i, '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

const cmp = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
};

function fromTags() {
  const tags = git('tag', '-l').split(/\r?\n/).map((t) => t.trim()).filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
    .sort((a, b) => cmp(a.slice(1), b.slice(1)));
  const out = [];
  tags.forEach((tag, i) => {
    const version = tag.slice(1);
    const notes = git('for-each-ref', `refs/tags/${tag}`, '--format=%(contents)');
    let items = bullets(notes.split(/\r?\n/).slice(1).join('\n'));
    if (!items.length) {
      // No notes on the tag: what its commits said, every commit since the last version.
      const range = i ? `${tags[i - 1]}..${tag}` : tag;
      items = bullets(git('log', '--reverse', '--format=%B', range));
    }
    // A tag that ended up on another version's commit (v1.84.1 sits on 1.84.0's) keeps its own title and day.
    const own = new RegExp(`^(Onyx( Calendar)? )?v?${version.replace(/\./g, '\\.')}(?![\\d.])`, 'i');
    const tagSubject = git('for-each-ref', `refs/tags/${tag}`, '--format=%(contents:subject)').trim();
    const commitSubject = git('log', '-1', '--format=%s', tag).trim();
    const stray = own.test(tagSubject) && /^(Onyx( Calendar)? )?v?\d+\.\d+\.\d+/i.test(commitSubject) && !own.test(commitSubject);
    const subject = stray ? tagSubject : commitSubject;
    const date = stray ? git('for-each-ref', `refs/tags/${tag}`, '--format=%(taggerdate:short)').trim() : git('log', '-1', '--format=%cs', tag).trim();
    if (!items.length) items = [titleOf(subject) || 'Small fixes'];
    out.push({ version, date, title: titleOf(subject) || (i === 0 ? 'The first release' : ''), items });
  });
  return out.reverse(); // newest first
}

function write(list) {
  const js = `// Every version of Onyx and what came with it, newest first (Settings → Changelog).\n// Made by scripts/changelog.js from the release notes: rebuild it there rather than editing it here.\nwindow.OnyxChangelog = ${JSON.stringify(list, null, 1)};\n`;
  fs.writeFileSync(path.join(root, 'src/renderer/changelog.js'), js);
  const md = ['# Onyx changelog', '', 'Every version of Onyx, newest first. Also in the app: Settings → Changelog.', ''];
  for (const v of list) {
    md.push(`## ${v.version}${v.title ? ` · ${v.title}` : ''}`, '', `_${v.date}_`, '', ...v.items.map((it) => `- ${it}`), '');
  }
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), md.join('\n'));
}

function main(argv) {
  let list = fromTags();
  const at = argv.indexOf('--next');
  if (at >= 0) {
    const version = argv[at + 1], file = argv[at + 2];
    const ti = argv.indexOf('--title');
    const title = ti >= 0 ? argv[ti + 1] : '';
    if (!/^\d+\.\d+\.\d+$/.test(version || '') || !file) throw new Error('Use: --next 1.2.3 notes.txt [--title "..."]');
    const notes = fs.readFileSync(file, 'utf8');
    const items = bullets(notes.split(/\r?\n/).slice(1).join('\n'));
    list = [{ version, date: new Date().toISOString().slice(0, 10), title: title ? title[0].toUpperCase() + title.slice(1) : '', items: items.length ? items : ['Small fixes'] },
      ...list.filter((v) => v.version !== version)];
  }
  write(list);
  return list;
}

if (require.main === module) {
  const list = main(process.argv.slice(2));
  console.log(`changelog: ${list.length} versions, newest ${list[0]?.version}`);
}

module.exports = { bullets, clean, titleOf };
