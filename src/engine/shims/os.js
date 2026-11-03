// Node's os for the engine: the device's name is what the PCs list it as (Settings → Desktops).
'use strict';
const name = () => globalThis.ONYX_DEVICE_NAME || (globalThis.ONYX_WEB ? 'Onyx on the web' : 'Phone');
module.exports = { hostname: name, platform: () => 'android', networkInterfaces: () => ({}), EOL: '\n', tmpdir: () => '/tmp', homedir: () => '/' };
