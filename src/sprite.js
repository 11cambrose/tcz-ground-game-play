/* Deterministic seed sprite: same seed row id -> same 8x8 pixel figure + palette, forever. */
(function (g) {
  'use strict';
  var R = (typeof module !== 'undefined' && module.exports) ? require('./rules.js') : g.TCZ.rules;
  // Look lock: deep greens/blacks, warm lamp, one check-red accent (Jester owns the red).
  var FAMILY_ACCENT = { Void: '#8b6cff', Chronos: '#d9a441', Jester: '#e0403a', Kane: '#a7b1bb', Grimwald: '#7fbf8a' };
  var MASTER_ACCENT = '#f2e2b8';
  var BODIES = ['#1f3d2b', '#24492f', '#183326', '#2c5136', '#14261c', '#33402f'];
  function spriteFor(seed) {
    var id = typeof seed === 'string' ? seed : seed.seed_id;
    var rnd = R.mulberry32(R.fnv1a('tcz-seat:' + id));
    var grid = [];
    for (var y = 0; y < 8; y++) {
      var row = [];
      for (var x = 0; x < 4; x++) {
        var v = rnd();
        var c = v < 0.38 ? 0 : v < 0.78 ? 1 : v < 0.92 ? 2 : 3; // 0 empty,1 body,2 accent,3 eye/lamp
        if (y === 0 && x < 2) c = 0;                           // shoulders silhouette
        if (x === 3 && (y === 2 || y === 3)) c = c ? c : 1;     // keep a spine
        row.push(c);
      }
      grid.push(row.concat(row.slice().reverse()));            // mirror -> 8 wide
    }
    var fam = typeof seed === 'object' ? seed.family : null, type = typeof seed === 'object' ? seed.seat_type : null;
    var palette = [null, BODIES[Math.floor(rnd() * BODIES.length)],
      type === 'master' ? MASTER_ACCENT : (FAMILY_ACCENT[fam] || MASTER_ACCENT), '#ffd27a'];
    return { id: id, grid: grid, palette: palette, hash: R.fnv1a('tcz-seat:' + id) };
  }
  function drawSprite(ctx, sp, x, y, px) {
    for (var j = 0; j < 8; j++) for (var i = 0; i < 8; i++) {
      var c = sp.grid[j][i]; if (!c) continue; ctx.fillStyle = sp.palette[c]; ctx.fillRect(x + i * px, y + j * px, px, px);
    }
  }
  var api = { spriteFor: spriteFor, drawSprite: drawSprite, FAMILY_ACCENT: FAMILY_ACCENT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { g.TCZ.sprite = api; }
})(this);
