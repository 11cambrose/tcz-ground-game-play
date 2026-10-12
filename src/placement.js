/* Deterministic seat placement on a MapProvider: seats sit at real landmarks so they are discovered while exploring.
   Same world + same desk -> same layout. Also builds the fenced closer compound with one gate tile. */
(function (g) {
  'use strict';
  var node = typeof module !== 'undefined' && module.exports;
  var R = node ? require('./rules.js') : g.TCZ.rules;
  var FENCE = 9;
  /** Data-driven landmark pick (from the level manifest's landmark_picks):
      1) an exact `prefer` name if present, 2) a `name_hint` substring match, 3) the earliest kind in `kinds`;
      ties broken by distance to the map centre, then by POI id. Never hard-coded to a town. */
  function pickPoi(pois, rule, taken, cx, cy) {
    if (!rule) return null;
    var free = pois.filter(function (p) { return !taken[p.id]; });
    var pref = (rule.prefer || []);
    for (var i = 0; i < pref.length; i++) { var hit = free.filter(function (p) { return p.name === pref[i]; })[0]; if (hit) return hit; }
    var kinds = rule.kinds || [], hints = (rule.name_hint || []).map(function (h) { return h.toLowerCase(); });
    function score(p) {
      var ki = kinds.indexOf(p.kind), hi = hints.some(function (h) { return p.name.toLowerCase().indexOf(h) >= 0; });
      if (ki < 0 && !hi) return null;
      return (hi ? 0 : 1000) + (ki < 0 ? 500 : ki * 10) + Math.hypot(p.x - cx, p.y - cy) / 10000;
    }
    var best = null, bs = Infinity;
    free.forEach(function (p) { var sc = score(p); if (sc !== null && (sc < bs || (sc === bs && p.id < best.id))) { bs = sc; best = p; } });
    return best;
  }
  function nearestIn(mask, map, x, y, maxR) {
    for (var r = 0; r <= (maxR || 40); r++) for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      var nx = x + dx, ny = y + dy; if (map.inBounds(nx, ny) && mask[ny * map.width + nx]) return { x: nx, y: ny };
    }
    return null;
  }
  function place(map, desk, level) {
    var pois = map.pois().slice(), W = map.width, picks = level.landmark_picks || {}, cx = W / 2, cy = map.height / 2;
    var taken = {};
    // spawn = picked landmark (e.g. library), else POI nearest the centre; seats use the walkable component of the spawn.
    var sp = pickPoi(pois, picks.spawn, taken, cx, cy) || pois.slice().sort(function (a, b) { return Math.hypot(a.x - W / 2, a.y - map.height / 2) - Math.hypot(b.x - W / 2, b.y - map.height / 2); })[0];
    var spawn = null, comp = null;
    for (var r = 0; r < 60 && !spawn; r++) for (var dy = -r; dy <= r && !spawn; dy++) for (var dx = -r; dx <= r && !spawn; dx++) {
      if (map.walkable(sp.x + dx, sp.y + dy)) { var m = map.reachable(sp.x + dx, sp.y + dy), cnt = 0; for (var i = 0; i < m.length; i += 97) cnt += m[i]; if (cnt > 200) { spawn = { x: sp.x + dx, y: sp.y + dy, poi: sp }; comp = m; } }
    }
    var used = [], seats = [];
    function far(p) { return used.every(function (u) { return Math.max(Math.abs(u.x - p.x), Math.abs(u.y - p.y)) >= 8; }); }
    function seatAt(poi, seedId, kind) {
      var t = nearestIn(comp, map, poi.x, poi.y, 40); if (!t) return null;
      used.push(t); var s = { seed_id: seedId, kind: kind, x: t.x, y: t.y, poi: { id: poi.id, name: poi.name, kind: poi.kind } }; seats.push(s); return s;
    }
    taken[sp.id] = 1;
    function claim(rule, seedId, kind) { var p = pickPoi(pois, rule, taken, cx, cy); if (p) { taken[p.id] = 1; return seatAt(p, seedId, kind); } return null; }
    var shrineIds = {}; level.shrines.forEach(function (s) { shrineIds[s.seed_id] = s.key; });
    var closer = claim(picks.closer, level.closer_seed_id, 'closer');
    level.shrines.forEach(function (s) { claim(picks[s.key], s.seed_id, 'shrine'); });
    // remaining seeds over remaining POIs, ordered by a stable hash
    var rest = pois.filter(function (p) { return !taken[p.id]; }).sort(function (a, b) { return R.fnv1a('poi:' + a.id) - R.fnv1a('poi:' + b.id); });
    desk.seeds.filter(function (s) { return s.world_level === level.world_level; }).forEach(function (s) {
      if (seats.some(function (q) { return q.seed_id === s.seed_id; })) return;
      var kind = shrineIds[s.seed_id] ? 'shrine' : s.seed_id === level.closer_seed_id ? 'closer' : 'seat';
      for (var i = 0; i < rest.length; i++) { var t = nearestIn(comp, map, rest[i].x, rest[i].y, 40); if (t && far(t)) { var p = rest.splice(i, 1)[0]; seatAt(p, s.seed_id, kind); return; } }
      // fallback: deterministic walkable tile along the street grid
      var h = R.fnv1a('fallback:' + s.seed_id);
      for (var k = 0; k < 5000; k++) { var x = (h + k * 7919) % W, y = ((h >>> 8) + k * 104729) % map.height; if (comp[y * W + x] && far({ x: x, y: y })) { seatAt({ id: 'grid-' + x + '-' + y, name: 'Street corner', kind: 'street', x: x, y: y }, s.seed_id, kind); return; } }
    });
    // closer compound: fence ring (radius 4) with a single gate tile facing the spawn
    var gate = null, ring = [];
    if (closer) {
      var R4 = 4;
      for (var yy = closer.y - R4; yy <= closer.y + R4; yy++) for (var xx = closer.x - R4; xx <= closer.x + R4; xx++)
        if (Math.max(Math.abs(xx - closer.x), Math.abs(yy - closer.y)) === R4 && map.walkable(xx, yy)) ring.push({ x: xx, y: yy });
      ring.sort(function (a, b) { return Math.hypot(a.x - spawn.x, a.y - spawn.y) - Math.hypot(b.x - spawn.x, b.y - spawn.y); });
      // gate = ring tile closest to spawn such that, with every other ring tile fenced, the closer is reachable through it
      var orig = ring.map(function (c) { return map.tile(c.x, c.y); });
      ring.forEach(function (c) { map.block(c.x, c.y, FENCE); });
      for (var gi = 0; gi < ring.length && !gate; gi++) {
        var c = ring[gi]; map.block(c.x, c.y, orig[gi]);
        var m2 = map.reachable(spawn.x, spawn.y);
        if (m2[closer.y * W + closer.x]) gate = c; else map.block(c.x, c.y, FENCE);
      }
      if (!gate) ring.forEach(function (c, i) { map.block(c.x, c.y, orig[i]); });   // no workable gate: leave unfenced

    }
    return { spawn: spawn, seats: seats, gate: gate, closer: closer };
  }
  var api = { place: place, pickPoi: pickPoi, FENCE: FENCE };
  if (node) module.exports = api; else { g.TCZ.placement = api; }
})(this);
