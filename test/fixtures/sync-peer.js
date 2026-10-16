// The second desktop for test/sync.test.js: its own copy of Onyx's main process, in a
// child process, driven by messages from the test. (Run on its own, e.g. by `node --test`
// picking up every file under test/, it does nothing.)
if (!process.send) return;
const store = require('../../src/main/store');
const mcp = require('../../src/main/mcp');
const sync = require('../../src/main/sync');

store.save = () => {};
const d = store.data;
d.settings.mcp = { enabled: true, port: 48912, lan: false };
d.secrets.mcpToken = 'peer-token-peer-token-5678';
d.accounts = [{ id: 'gpeer9', provider: 'google', label: 'me@gmail.com' }];
d.secrets.tokens = { gpeer9: { access: 'b', refresh: 'peer-refresh', expires: 0 } };
d.tags = { 'gpeer9/tl~list/t1': ['peer-tag'] };

const report = () => ({
  google: d.google, secret: d.secrets.googleClientSecret, token: d.secrets.mcpToken,
  accounts: d.accounts.map((a) => a.id), refresh: d.secrets.tokens[d.accounts[0]?.id]?.refresh,
  tags: d.tags, notes: d.notes, desktops: sync.info().desktops, leads: sync.leads(),
});

(async () => {
  await mcp.start(() => {});
  sync.start(() => {});
  process.on('message', async (msg) => {
    try {
      if (msg.do === 'join') await sync.join(msg.address, msg.code);
      if (msg.do === 'sync') await sync.syncNow();
      process.send(report());
    } catch (err) {
      process.send({ error: err.message });
    }
  });
})();
