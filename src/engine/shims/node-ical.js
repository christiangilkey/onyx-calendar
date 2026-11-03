// node-ical for the engine: its parser only (node-ical.js itself also reads files and the network,
// with fs and axios, which the engine does not need: ics.js fetches the link and hands over the text).
'use strict';
const ical = require('node-ical/ical.js');

const parse = (data) => new Promise((resolve, reject) => ical.parseICS(data, (err, ics) => (err ? reject(err) : resolve(ics))));
module.exports = { async: { parseICS: parse }, sync: { parseICS: (data) => ical.parseICS(data) }, parseICS: (data) => ical.parseICS(data) };
