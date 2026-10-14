// Pairing the Android app: a link (and QR code of it) that carries this PC's
// network addresses and the server token. Scanning it with the phone's camera
// (or the Onyx app's own scanner) opens Onyx on the phone and connects it.

const QRCode = require('qrcode');
const mcp = require('./mcp');

async function info() {
  const m = mcp.info();
  const addresses = m.addresses.map((a) => `${a}:${m.port}`);
  const query = `a=${encodeURIComponent(addresses.join(','))}&t=${encodeURIComponent(m.token)}`;
  const link = `onyx://pair?${query}`;
  // Camera apps only open web links (an onyx:// link becomes a Google search), so the QR
  // code holds this PC's /pair page, which hands the link to the Onyx app. The pairing
  // details ride after the #, so the browser never sends them anywhere.
  const page = addresses.length ? `http://${addresses[0]}/pair#${query}` : '';
  const qr = page
    ? await QRCode.toDataURL(page, { margin: 1, width: 260, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
    : '';
  return { link, page, qr, addresses, token: m.token, running: m.running, lan: m.lan };
}

module.exports = { info };
