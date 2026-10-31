// Sending a block (share.js): to whom (checked), the email (Gmail's MIME and Outlook's message, each with an
// invite to add it to a calendar), what lands on a Notion page, and the accounts connected before sending was
// added, which keep their sign-in renewed with just what they agreed to.
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const accounts = require('../src/main/accounts');
const notion = require('../src/main/providers/notion');
const share = require('../src/main/share');

store.save = () => {};
const entry = { title: 'Dentist, then lunch', start: '2026-10-23T22:00:00.000Z', end: '2026-10-23T23:00:00.000Z', allDay: false, when: 'Fri, Oct 23, 3:00 – 4:00 PM', location: 'Main St; Suite 4', notes: 'Bring the form' };

test('receivers are checked: commas or spaces, no duplicates, real addresses only', () => {
  assert.deepEqual(share.recipients('sam@example.com, kim@example.org;sam@example.com'), ['sam@example.com', 'kim@example.org']);
  assert.throws(() => share.recipients(''), /who to send it to/);
  assert.throws(() => share.recipients('sam@example'), /not an email address/);
});

test('the invite: the block\'s time in UTC, its name and place escaped, the sender as organiser, each receiver invited', () => {
  const ics = share.invite(entry, 'me@gmail.com', ['sam@example.com']).replace(/\r\n /g, ''); // long lines come folded
  assert.match(ics, /METHOD:REQUEST/);
  assert.match(ics, /DTSTART:20261023T220000Z/);
  assert.match(ics, /DTEND:20261023T230000Z/);
  assert.ok(ics.includes('SUMMARY:Dentist\\, then lunch'), 'commas escaped');
  assert.ok(ics.includes('LOCATION:Main St\\; Suite 4'), 'semicolons escaped');
  assert.match(ics, /ORGANIZER:mailto:me@gmail.com/);
  assert.match(ics, /ATTENDEE;[^\r\n]*mailto:sam@example.com/);
  const day = share.invite({ title: 'Off', start: '2026-10-24', end: '2026-10-25', allDay: true }, 'me@gmail.com', ['sam@example.com']);
  assert.match(day, /DTSTART;VALUE=DATE:20261024/);
  assert.match(day, /DTEND;VALUE=DATE:20261025/);
});

test('by Gmail: one message with the words and the invite, from the account picked; the receivers are remembered', async () => {
  store.data.accounts = [{ id: 'g1', provider: 'google', label: 'me@gmail.com' }, { id: 'm1', provider: 'microsoft', label: 'me@outlook.com' }];
  store.data.sendTo = ['old@example.com'];
  const sent = [];
  const real = accounts.request;
  accounts.request = async (acct, url, opts) => { sent.push({ acct: acct.id, url, body: opts.body }); return null; };
  try {
    const r = await share.email({ accountId: 'g1', to: 'sam@example.com', note: 'See you there', entry });
    assert.deepEqual(r.to, ['sam@example.com']);
    assert.match(sent[0].url, /gmail\/v1\/users\/me\/messages\/send$/);
    const raw = Buffer.from(sent[0].body.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    assert.match(raw, /^From: me@gmail.com\r\nTo: sam@example.com\r\n/);
    assert.match(raw, /Content-Type: text\/calendar; charset=UTF-8; method=REQUEST/);
    const parts = raw.split(/\r\n\r\n/).slice(2);
    assert.match(Buffer.from(parts[0].split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString('utf8'), /See you there[\s\S]*Fri, Oct 23, 3:00 – 4:00 PM/);
    assert.deepEqual(store.data.sendTo, ['sam@example.com', 'old@example.com']);

    // Outlook: Graph's sendMail, with the invite as an attachment.
    await share.email({ accountId: 'm1', to: 'kim@example.org', entry });
    assert.match(sent[1].url, /\/me\/sendMail$/);
    assert.equal(sent[1].body.message.toRecipients[0].emailAddress.address, 'kim@example.org');
    assert.equal(sent[1].body.message.attachments[0].contentType, 'text/calendar');

    // Connected before sending was allowed: it says how to allow it.
    accounts.request = async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); };
    await assert.rejects(share.email({ accountId: 'g1', to: 'sam@example.com', entry }), /connect it again once in Settings → Calendars/);
  } finally {
    accounts.request = real;
  }
});

test('onto Notion: a to-do with its name and time, then where and its notes, at the end of the page picked', async () => {
  const blocks = share.notionBlocks(entry);
  assert.equal(blocks[0].type, 'to_do');
  assert.deepEqual(blocks[0].to_do.rich_text.map((r) => r.text.content), ['Dentist, then lunch', '  ·  Fri, Oct 23, 3:00 – 4:00 PM']);
  assert.equal(blocks[1].paragraph.rich_text[0].text.content, 'Where: Main St; Suite 4');
  const real = notion.append;
  let got = null;
  notion.append = async (pageId, children) => { got = { pageId, children }; return {}; };
  try {
    await share.toNotion({ pageId: 'abc', entry });
    assert.equal(got.pageId, 'abc');
    assert.equal(got.children.length, 3);
    await assert.rejects(share.toNotion({ entry }), /Pick a Notion page/);
  } finally {
    notion.append = real;
  }
});
