// Pairing the Android app: a link (and QR code of it) that carries this PC's
// network addresses and the server token. Scanning it with the phone's camera
// opens Onyx on the phone and connects it.

const QRCode = require('qrcode');
const mcp = require('./mcp');

async function info() {
  const m = mcp.info();
  const addresses = m.addresses.map((a) => `${a}:${m.port}`);
  const link = `onyx://pair?a=${encodeURIComponent(addresses.join(','))}&t=${encodeURIComponent(m.token)}`;
  const qr = addresses.length
    ? await QRCode.toDataURL(link, { margin: 1, width: 260, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
    : '';
  return { link, qr, addresses, token: m.token, running: m.running, lan: m.lan };
}

module.exports = { info };
