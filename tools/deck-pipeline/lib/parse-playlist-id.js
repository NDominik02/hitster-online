'use strict';

function parsePlaylistId(urlOrId) {
  const m = urlOrId.match(/playlist[/:]([a-zA-Z0-9]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9]{10,30}$/.test(urlOrId)) return urlOrId;
  throw new Error(`Cannot parse playlist id from: ${urlOrId}`);
}

module.exports = { parsePlaylistId };
