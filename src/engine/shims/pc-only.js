// What only the PC has (its files, its windows, its server): the engine's stand-in for fs, http,
// electron and the rest. Reading whether a file is there says no (a sheet or a pin from a PC's disk
// shows nothing here); anything else says plainly that it needs the PC.
'use strict';
const NEEDS_PC = 'That needs Onyx on your PC.';
const no = () => { throw Object.assign(new Error(NEEDS_PC), { needsPc: true }); };
const handler = { get: (_, k) => (k === '__esModule' ? false : k === 'existsSync' ? () => false : k === 'NEEDS_PC' ? NEEDS_PC : no) };
module.exports = new Proxy({}, handler);
