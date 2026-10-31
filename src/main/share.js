// Sending a block to someone: an email from one of the connected accounts (Gmail or Outlook) with its
// details and an invite to add it to their calendar, or a to-do with its time at the end of a Notion page.

const crypto = require('crypto');
const store = require('./store');
const accounts = require('./accounts');
const notion = require('./providers/notion');

const GMAIL_SEND = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GRAPH_SEND = 'https://graph.microsoft.com/v1.0/me/sendMail';
const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
const MAX_TO = 10;

/** The accounts a block can be sent from. */
const senders = () => store.data.accounts
  .filter((a) => a.provider === 'google' || a.provider === 'microsoft')
  .map((a) => ({ id: a.id, label: a.label, provider: a.provider }));

/** Addresses sent to before, most recent first: offered as the receiver is typed. */
const recents = () => (Array.isArray(store.data.sendTo) ? store.data.sendTo : []);

/** "a@b.com, c@d.com" (or one per line): the addresses, checked. */
function recipients(to) {
  const list = [...new Set(String(to || '').split(/[\s,;]+/).map((s) => s.trim().replace(/^<|>$/g, '')).filter(Boolean))];
  if (!list.length) throw new Error('Enter who to send it to.');
  const bad = list.find((a) => !EMAIL_RE.test(a));
  if (bad) throw new Error(`"${bad}" is not an email address.`);
  if (list.length > MAX_TO) throw new Error(`Send it to at most ${MAX_TO} people at once.`);
  return list;
}

// ---- the block as words, and as an invite

const pad = (n) => String(n).padStart(2, '0');
const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "Thu, Oct 23, 3:00 – 4:00 PM" (or the day alone, for an all-day block). The window's own wording wins. */
function whenText(entry) {
  if (entry.when) return String(entry.when);
  const s = new Date(entry.start), e = new Date(entry.end || entry.start);
  const day = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (entry.allDay) return day(s);
  const time = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day(s)}, ${time(s)} – ${time(e)}`;
}

function bodyText(entry, note) {
  return [
    note ? String(note).trim() : null,
    note ? '' : null,
    entry.title || 'A block',
    whenText(entry),
    entry.location ? `Where: ${entry.location}` : null,
    entry.notes ? `\n${String(entry.notes).trim()}` : null,
    '',
    'The invite attached adds it to your calendar.',
  ].filter((l) => l != null).join('\n');
}

const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsUtc = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** Long lines folded as the calendar format asks (75 characters, the rest indented on the next line). */
const fold = (line) => {
  const out = [];
  for (let i = 0; i < line.length; i += 73) out.push((i ? ' ' : '') + line.slice(i, i + 73));
  return out.join('\r\n');
};

/** The block as an invite (iCalendar), from `from` to `to` (addresses). */
function invite(entry, from, to) {
  const day = (iso) => String(iso).slice(0, 10).replace(/-/g, '');
  const allDay = !!entry.allDay;
  const start = allDay ? `DTSTART;VALUE=DATE:${day(entry.start)}` : `DTSTART:${icsUtc(entry.start)}`;
  const endIso = entry.end || entry.start;
  const end = allDay
    ? `DTEND;VALUE=DATE:${day(endIso > entry.start ? endIso : ymdOf(new Date(new Date(`${String(entry.start).slice(0, 10)}T12:00:00`).getTime() + 86400000)))}`
    : `DTEND:${icsUtc(endIso)}`;
  const lines = [
    'BEGIN:VCALENDAR', 'PRODID:-//Onyx Calendar//EN', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@onyx-calendar`,
    `DTSTAMP:${icsUtc(new Date())}`,
    start, end,
    `SUMMARY:${icsText(entry.title || 'A block')}`,
    entry.notes ? `DESCRIPTION:${icsText(entry.notes)}` : null,
    entry.location ? `LOCATION:${icsText(entry.location)}` : null,
    /@/.test(from) ? `ORGANIZER:mailto:${from}` : null,
    ...to.map((a) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a}`),
    'STATUS:CONFIRMED', 'SEQUENCE:0',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const b64url = (s) => b64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const lines76 = (s) => s.replace(/.{1,76}/g, (m) => `${m}\r\n`).trimEnd();
/** A header value: as it is when plain ASCII, else encoded so any mail program reads it. */
const word = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

/** The whole message, as Gmail takes it: the words, and the invite as a calendar part. */
function mime({ from, to, subject, text, ics }) {
  const boundary = `onyx-${crypto.randomBytes(8).toString('hex')}`;
  return [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    `Subject: ${word(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    lines76(b64(text)),
    `--${boundary}`,
    'Content-Type: text/calendar; charset=UTF-8; method=REQUEST; name="invite.ics"',
    'Content-Disposition: attachment; filename="invite.ics"',
    'Content-Transfer-Encoding: base64',
    '',
    lines76(b64(ics)),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

/** Sends a block by email: { accountId, to, note?, entry: { title, start, end, allDay, location?, notes?, when? } }. */
async function email({ accountId, to, note = '', entry } = {}) {
  const acct = store.data.accounts.find((a) => a.id === accountId && (a.provider === 'google' || a.provider === 'microsoft'));
  if (!acct) throw new Error('Pick an account to send it from.');
  if (!entry?.start) throw new Error('That block has no time to send.');
  const list = recipients(to);
  const subject = `${entry.title || 'A block'} · ${whenText(entry)}`;
  const text = bodyText(entry, note);
  const ics = invite(entry, acct.label, list);
  try {
    if (acct.provider === 'google') {
      await accounts.request(acct, GMAIL_SEND, { method: 'POST', body: { raw: b64url(mime({ from: acct.label, to: list, subject, text, ics })) } });
    } else {
      await accounts.request(acct, GRAPH_SEND, {
        method: 'POST',
        body: {
          message: {
            subject,
            body: { contentType: 'Text', content: text },
            toRecipients: list.map((address) => ({ emailAddress: { address } })),
            attachments: [{ '@odata.type': '#microsoft.graph.fileAttachment', name: 'invite.ics', contentType: 'text/calendar', contentBytes: b64(ics) }],
          },
          saveToSentItems: true,
        },
      });
    }
  } catch (err) {
    // Accounts connected before sending was added sign in once more to allow it.
    if (err.status === 401 || err.status === 403) {
      throw Object.assign(new Error(`To send from ${acct.label}, connect it again once in Settings → Calendars: Onyx now asks to send email too${acct.provider === 'google' ? ' (and the Gmail API must be on in your Google Cloud project)' : ''}.`), { reconnect: true });
    }
    throw err;
  }
  store.data.sendTo = [...list, ...recents().filter((a) => !list.includes(a))].slice(0, 20);
  store.save();
  return { sent: list.length, to: list, from: acct.label };
}

// ---- Notion

/** Pages shared with the Notion integration whose titles match `query`; { connected, pages }. */
async function notionPages(query = '') {
  if (!notion.info().connected) return { connected: false, pages: [] };
  const found = await notion.search(query);
  return { connected: true, pages: found.filter((p) => p.kind === 'page') };
}

const rich = (content, extra = {}) => ({ type: 'text', text: { content: String(content).slice(0, 1900) }, ...extra });

/** What a block becomes on a Notion page: a to-do with its name and time, then where and its notes. */
function notionBlocks(entry) {
  const out = [{
    object: 'block', type: 'to_do',
    to_do: { checked: false, rich_text: [rich(entry.title || 'A block'), rich(`  ·  ${whenText(entry)}`, { annotations: { color: 'gray' } })] },
  }];
  if (entry.location) out.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [rich(`Where: ${entry.location}`)] } });
  if (entry.notes) out.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [rich(String(entry.notes).trim())] } });
  return out;
}

/** Adds a block at the end of a Notion page: { pageId, entry }. */
async function toNotion({ pageId, entry } = {}) {
  if (!pageId) throw new Error('Pick a Notion page to send it to.');
  if (!entry) throw new Error('Nothing to send.');
  await notion.append(pageId, notionBlocks(entry));
  return { ok: true };
}

module.exports = { senders, recents, recipients, email, notionPages, toNotion, invite, mime, whenText, notionBlocks };
