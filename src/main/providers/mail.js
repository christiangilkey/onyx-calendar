// Emails for the globe: starred Gmail and flagged Outlook messages received in a range of
// days, across every connected account. Only the subject, sender, date and preview line are
// read (gmail.readonly / Mail.Read), and a link to open the message in the browser.

const store = require('../store');
const accounts = require('../accounts');

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GRAPH = 'https://graph.microsoft.com/v1.0/me';
const MAX = 30; // per account

const ymdSlash = (d) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
const header = (msg, name) => (msg.payload?.headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
const tagsOf = (id) => store.data.tags[id] || [];
const sender = (from) => String(from).replace(/\s*<[^>]+>\s*$/, '').replace(/^"|"$/g, '') || String(from);

async function gmail(acct, from, to) {
  const q = `is:starred after:${ymdSlash(from)} before:${ymdSlash(new Date(to.getTime() + 86400000))}`;
  const list = await accounts.request(acct, `${GMAIL}/messages?${new URLSearchParams({ q, maxResults: String(MAX) })}`);
  const ids = (list.messages || []).map((m) => m.id);
  const msgs = await Promise.all(ids.map((id) => accounts.request(acct,
    `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`).catch(() => null)));
  return msgs.filter(Boolean).map((m) => {
    const id = `mail:${acct.id}:${m.id}`;
    return {
      id, provider: 'gmail', account: acct.label,
      subject: header(m, 'Subject') || '(no subject)', from: sender(header(m, 'From')),
      date: new Date(Number(m.internalDate) || Date.parse(header(m, 'Date')) || Date.now()).toISOString(),
      preview: (m.snippet || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').slice(0, 240),
      link: `https://mail.google.com/mail/?authuser=${encodeURIComponent(acct.label)}#all/${m.threadId || m.id}`,
      tags: tagsOf(id),
    };
  });
}

async function outlook(acct, from, to) {
  const filter = `flag/flagStatus eq 'flagged' and receivedDateTime ge ${from.toISOString()} and receivedDateTime lt ${to.toISOString()}`;
  const params = new URLSearchParams({ $filter: filter, $select: 'id,subject,from,receivedDateTime,webLink,bodyPreview', $top: String(MAX) });
  const res = await accounts.request(acct, `${GRAPH}/messages?${params}`);
  return (res.value || []).map((m) => {
    const id = `mail:${acct.id}:${m.id}`;
    return {
      id, provider: 'outlook', account: acct.label,
      subject: m.subject || '(no subject)', from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '',
      date: m.receivedDateTime, preview: (m.bodyPreview || '').slice(0, 240), link: m.webLink || 'https://outlook.office.com/mail/',
      tags: tagsOf(id),
    };
  });
}

/** Starred / flagged emails received from `start` to `end` (ISO), newest first; problems per account. */
async function list(start, end) {
  const from = new Date(start), to = new Date(end);
  const accts = store.data.accounts.filter((a) => a.provider === 'google' || a.provider === 'microsoft');
  const emails = [];
  const problems = [];
  await Promise.all(accts.map(async (acct) => {
    try {
      emails.push(...await (acct.provider === 'google' ? gmail(acct, from, to) : outlook(acct, from, to)));
    } catch (err) {
      // Accounts connected before emails were added sign in once more to allow reading them.
      problems.push(err.status === 403 || err.status === 401
        ? `${acct.label}: to show its emails, connect it again (Settings → Calendars)${acct.provider === 'google' ? ', and enable the Gmail API in your Google Cloud project' : ''}.`
        : `${acct.label}: ${err.message}`);
    }
  }));
  return { emails: emails.sort((a, b) => (a.date < b.date ? 1 : -1)), problems };
}

module.exports = { list };
