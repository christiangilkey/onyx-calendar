// Google Drive: finding files to pin to the globe, across every connected
// Google account. Only names and links are read (drive.metadata.readonly).

const store = require('../store');
const accounts = require('../accounts');

const FILES = 'https://www.googleapis.com/drive/v3/files';

const KINDS = {
  'application/vnd.google-apps.document': 'doc',
  'application/vnd.google-apps.spreadsheet': 'sheet',
  'application/vnd.google-apps.presentation': 'slides',
  'application/vnd.google-apps.folder': 'folder',
  'application/vnd.google-apps.form': 'form',
  'application/pdf': 'pdf',
};

const kindOf = (mime) => KINDS[mime] || (mime?.startsWith('image/') ? 'image' : mime?.startsWith('video/') ? 'video' : 'file');

/** Files whose names contain `query` (or the most recently changed ones when it is empty). */
async function search(query = '') {
  const google = store.data.accounts.filter((a) => a.provider === 'google');
  if (!google.length) throw new Error('Connect a Google account first: Settings → Calendars.');
  const q = ['trashed = false'];
  const text = String(query).trim();
  if (text) q.push(`name contains '${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`);
  const params = new URLSearchParams({
    q: q.join(' and '), pageSize: '25', orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,webViewLink,modifiedTime)',
    includeItemsFromAllDrives: 'true', supportsAllDrives: 'true',
  });
  const results = [];
  const problems = [];
  await Promise.all(google.map(async (acct) => {
    try {
      const res = await accounts.request(acct, `${FILES}?${params}`);
      for (const f of res.files || []) {
        if (!f.webViewLink) continue;
        results.push({ source: 'drive', ref: f.id, title: f.name, url: f.webViewLink, kind: kindOf(f.mimeType), account: acct.label, edited: f.modifiedTime || '' });
      }
    } catch (err) {
      // Accounts connected before Drive was added need to sign in once more to allow it.
      problems.push(err.status === 403
        ? `${acct.label}: sign in with Google again (Settings → Calendars) to let Onyx see Drive file names. The Google Drive API must also be enabled in your Google Cloud project.`
        : err.message);
    }
  }));
  if (!results.length && problems.length) throw new Error(problems.join('  ·  '));
  return results.sort((a, b) => (a.edited < b.edited ? 1 : -1));
}

module.exports = { search };
