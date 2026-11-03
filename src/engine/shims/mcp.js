// The PC's server (mcp.js: the phone's link, Claude's tools, linked desktops) for the engine: there is
// none on the phone or in a browser, so it reports itself off, with no addresses to give out.
'use strict';
module.exports = {
  info: () => ({ running: false, lan: false, addresses: [], port: 0, enabled: false }),
  start: async () => {}, stop: async () => {}, setAppApi: () => {},
};
