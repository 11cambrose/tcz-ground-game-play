/* Save / load / export / reset (localStorage in the browser; pure helpers testable in node). */
(function (g) {
  'use strict';
  var node = typeof module !== 'undefined' && module.exports;
  var R = node ? require('./rules.js') : g.TCZ.rules;
  var KEY = 'tcz-ground-game-v1';
  function serialize(save) { return JSON.stringify(save); }
  function deserialize(text) {
    var o = JSON.parse(text);
    if (o && o.version === 1 && o.wallets && o.levels) {   // V1 -> V2 migration: add exploration fields
      Object.keys(o.levels).forEach(function (k) { o.levels[k].discovered = o.levels[k].discovered || []; });
      o.pos = null; o.version = 2;
    }
    if (o && o.version === 2 && o.wallets && o.levels) {   // V2 -> V3: inventory + per-level position + current level
      o.inventory = o.inventory || []; o.currentLevel = 1; o.posByLevel = { '1': o.pos || null };
      o.version = 3;
      var b = o.levels['1'] && o.levels['1'].boards['L01-M07'];
      if (b && b.result === 'pass') o.inventory.push({ id: 'ticket-bus-kane-bradford', kind: 'travel', name: 'Bus ticket: Kane \u2192 Bradford', mode: 'bus', unlocks_level: 2, acquired: 'migrated' });
    }
    if (!o || typeof o !== 'object' || o.version !== R.SAVE_VERSION || !o.wallets || !o.levels || !o.days) throw new Error('not a TCZ Ground Game save');
    return o;
  }
  function load(storage, desk, now) {
    try { var t = storage.getItem(KEY); if (t) return deserialize(t); } catch (e) { /* corrupted -> fresh */ }
    return R.newSave(desk, now);
  }
  function store(storage, save) { storage.setItem(KEY, serialize(save)); }
  function reset(storage, desk, now) { storage.removeItem(KEY); return R.newSave(desk, now); }
  var api = { KEY: KEY, serialize: serialize, deserialize: deserialize, load: load, store: store, reset: reset };
  if (node) module.exports = api; else { g.TCZ.save = api; }
})(this);
