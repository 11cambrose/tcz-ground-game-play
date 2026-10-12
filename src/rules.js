/* TCZ Ground Game V1 — pure rules (no DOM). Works as a browser script (window.TCZ.rules) and in node (require). */
(function (g) {
  'use strict';
  var ChessCtor = (typeof module !== 'undefined' && module.exports) ? require('../vendor/chess.js').Chess : g.Chess;

  var SAVE_VERSION = 3;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /** Local calendar date of `now` (device local time; Rule 2 expiry = local midnight). */
  function localDate(now) { return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()); }

  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedById(desk, id) { for (var i = 0; i < desk.seeds.length; i++) if (desk.seeds[i].seed_id === id) return desk.seeds[i]; return null; }
  function levelDef(levels, n) { return levels.levels[n - 1]; }

  function newSave(desk, now) {
    var inp = desk.inputs;
    return {
      version: SAVE_VERSION,
      player_id: 'P1-LOCAL',
      created: localDate(now),
      wallets: { cash: inp.starting_cash, progress_units: 0 },   // two wallets, never mixed
      lastLoginDate: null,
      days: {},           // 'YYYY-MM-DD' -> { dailyUsed, extrasGranted, extrasUsed, sponsor, hotspot, travel }
      levels: { '1': { boards: {}, shrines: { void: false, chronos: false }, passOrder: [], discovered: [] } },
      pos: null,           // legacy V2 field (level 1 position)
      posByLevel: {},      // level -> last player tile {x,y}
      currentLevel: 1,
      inventory: [],       // travel elements and other items: {id, kind, name, unlocks_level, acquired}
      log: [],
      debug: { ignoreDaily: false, dayOffset: 0 },
      published: null
    };
  }

  function day(save, now) {
    var k = localDate(now);
    if (!save.days[k]) save.days[k] = { dailyUsed: false, extrasGranted: 0, extrasUsed: 0, sponsor: false, hotspot: false, travel: null };
    return save.days[k];
  }

  /** Collect per diem once per local date. Returns cash added. */
  function login(save, desk, now) {
    var k = localDate(now);
    day(save, now);
    if (save.lastLoginDate === k) return 0;
    save.lastLoginDate = k;
    save.wallets.cash += desk.inputs.per_diem_login;
    save.log.push({ date: k, ev: 'per_diem', cash: desk.inputs.per_diem_login });
    return desk.inputs.per_diem_login;
  }

  /** Declare today's travel class. Fare charged once per date (cash wallet only). Broke players can always walk. */
  function setTravel(save, desk, now, classId) {
    var d = day(save, now), t = null;
    for (var i = 0; i < desk.travel.length; i++) if (desk.travel[i].class_id === classId) t = desk.travel[i];
    if (!t) return { ok: false, reason: 'unknown travel class' };
    if (d.travel) return { ok: false, reason: 'travel already declared today (' + d.travel + ')' };
    if (t.fare > save.wallets.cash) return { ok: false, reason: 'not enough cash for ' + classId };
    d.travel = classId; save.wallets.cash -= t.fare;
    save.log.push({ date: localDate(now), ev: 'travel', class: classId, cash: -t.fare });
    return { ok: true, fare: t.fare };
  }

  /** Rule 2 cap for a day: hard cap only with sponsor AND hotspot, else soft. */
  function extraCap(desk, sponsor, hotspot) { return (sponsor && hotspot) ? desk.inputs.hard_extra_cap : desk.inputs.soft_extra_cap; }

  /** Rule 2 (debug stub for real-world tasks): claim extra seed slots for TODAY. Returns slots granted today in total. */
  function grantExtras(save, desk, now, claimed, sponsor, hotspot) {
    var d = day(save, now);
    d.sponsor = d.sponsor || !!sponsor; d.hotspot = d.hotspot || !!hotspot;
    var cap = extraCap(desk, d.sponsor, d.hotspot);
    var before = d.extrasGranted;
    d.extrasGranted = Math.max(0, Math.min(cap, d.extrasGranted + Math.max(0, claimed | 0)));
    save.log.push({ date: localDate(now), ev: 'rule2_extras', claimed: claimed, granted: d.extrasGranted - before, cap: cap });
    return d.extrasGranted;
  }

  /** Slots for today. Extras from other dates are ignored = they expired at local midnight. */
  function slots(save, desk, now) {
    var d = day(save, now);
    return { date: localDate(now), daily: d.dailyUsed ? 0 : 1, extras: Math.max(0, d.extrasGranted - d.extrasUsed),
             extrasGranted: d.extrasGranted, cap: extraCap(desk, d.sponsor, d.hotspot), ignoreDaily: !!save.debug.ignoreDaily };
  }

  function lv(save, n) { var k = String(n || 1); if (!save.levels[k]) save.levels[k] = { boards: {}, shrines: { void: false, chronos: false }, passOrder: [], discovered: [] }; return save.levels[k]; }
  function gateOpen(save, levels, n) {
    var L = levelDef(levels, n || 1), st = lv(save, n);
    if (!L.gate) return false;
    return L.gate.opens_when.every(function (k) { return !!st.shrines[k]; });
  }
  function shrineKey(levels, n, seedId) {
    var L = levelDef(levels, n || 1);
    for (var i = 0; i < L.shrines.length; i++) if (L.shrines[i].seed_id === seedId) return L.shrines[i].key;
    return null;
  }

  /** May the player sit this seed now? */
  function canStart(save, desk, levels, seedId, now) {
    var s = seedById(desk, seedId); if (!s) return { ok: false, reason: 'unknown seed' };
    var L = levelDef(levels, s.world_level);
    if (!L.playable) return { ok: false, reason: 'world-level not playable yet' };
    if (!levelUnlocked(save, levels, s.world_level)) return { ok: false, reason: 'level locked: you need ' + L.unlock.requires_item };
    var b = lv(save, s.world_level).boards[seedId];
    if (b && b.result === 'pass') return { ok: false, reason: 'seed already passed (no farming)' };
    if (seedId === L.closer_seed_id && !gateOpen(save, levels, s.world_level)) return { ok: false, reason: 'gate closed: clear both shrines first' };
    var sl = slots(save, desk, now);
    if (sl.ignoreDaily) return { ok: true, slot: 'debug' };
    if (sl.daily) return { ok: true, slot: 'daily' };
    if (sl.extras) return { ok: true, slot: 'extra' };
    return { ok: false, reason: 'no seed slots left today (daily used; earn Rule 2 extras or come back tomorrow)' };
  }

  /**
   * Record a finished board. result: 'pass' | 'fail' | 'draw'.
   * pass  -> seed closed, +1 progress unit, shrine cleared if it is a shrine.
   * draw  -> logged as a draw; seed stays open; no unit change; gate unaffected.
   * fail  -> a loss COSTS PROGRESS: your most recently passed seed re-opens (-1 unit) and must be re-sat.
   *          If that seed was a shrine, its shrine un-clears (gate may re-close). Grimwald resign also flags withheld.
   */
  function recordResult(save, desk, levels, seedId, result, now, opts) {
    opts = opts || {};
    var chk = canStart(save, desk, levels, seedId, now);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    var s = seedById(desk, seedId), st = lv(save, s.world_level), d = day(save, now), k = localDate(now), L = levelDef(levels, s.world_level);
    if (chk.slot === 'daily') d.dailyUsed = true; else if (chk.slot === 'extra') d.extrasUsed++;
    var b = st.boards[seedId] || (st.boards[seedId] = { result: null, attempts: [] });
    b.result = result;
    var att = { date: k, result: result, slot: chk.slot, resign: !!opts.resign, travel: d.travel };
    b.attempts.push(att);
    var out = { ok: true, slot: chk.slot, reopened: null };
    if (result === 'pass') {
      save.wallets.progress_units++; st.passOrder.push(seedId);
      var sk = shrineKey(levels, s.world_level, seedId); if (sk) st.shrines[sk] = true;
      if (seedId === L.closer_seed_id && L.reward_on_closer && L.reward_on_closer.item) out.reward = grantItem(save, levels, L.reward_on_closer.item, now);
    } else if (result === 'fail') {
      if (opts.resign && s.family === 'Grimwald') { att.withheld = true; out.withheld = true; }
      var last = st.passOrder.pop();
      if (last) {
        save.wallets.progress_units = Math.max(0, save.wallets.progress_units - 1);
        st.boards[last].result = 'reopened';
        var lk = shrineKey(levels, s.world_level, last); if (lk) st.shrines[lk] = false;
        out.reopened = last;
      }
    }
    save.log.push({ date: k, ev: 'board', seed: seedId, result: result, slot: chk.slot, reopened: out.reopened });
    return out;
  }

  /** Trophy per desk 01_Inputs thresholds. Returns null | 'none' | 'bronze' | 'silver' | 'gold'. */
  function trophy(save, desk, n) {
    var inp = desk.inputs, st = lv(save, n), passes = 0, attempts = 0, mastersAttempted = 0, villainPasses = 0;
    var units = st.passOrder.length;
    Object.keys(st.boards).forEach(function (id) {
      var s = seedById(desk, id), b = st.boards[id];
      attempts += b.attempts.length;
      b.attempts.forEach(function (a) { if (a.result === 'pass') passes++; });
      if (s.seat_type === 'master' && b.attempts.length) mastersAttempted++;
      if (s.seat_type === 'villain' && b.result === 'pass') villainPasses++;
    });
    if (units < inp.units_to_close) return null;
    var rate = attempts ? passes / attempts : 0;
    if (rate < inp.band_line) return 'none';
    var hr = String(inp.high_risk_classes).split(',');
    var highRisk = Object.keys(save.days).some(function (k) { return save.days[k].travel && hr.indexOf(save.days[k].travel) >= 0; });
    if (mastersAttempted >= inp.gold_masters_min && highRisk) return 'gold';
    if (mastersAttempted >= inp.silver_masters_min || villainPasses >= inp.silver_villain_passes_min) return 'silver';
    return 'bronze';
  }

  function levelSummary(save, desk, n) {
    var st = lv(save, n), p = 0, f = 0, dr = 0;
    Object.keys(st.boards).forEach(function (id) { st.boards[id].attempts.forEach(function (a) { if (a.result === 'pass') p++; else if (a.result === 'fail') f++; else dr++; }); });
    return { units: st.passOrder.length, toClose: desk.inputs.units_to_close, passes: p, fails: f, draws: dr, trophy: trophy(save, desk, n) };
  }

  function hasItem(save, id) { return (save.inventory || []).some(function (i) { return i.id === id; }); }
  /** Add an inventory item from levels.items (idempotent). Returns the item, or null if unknown. */
  function grantItem(save, levels, id, now) {
    save.inventory = save.inventory || [];
    var def = (levels.items || []).filter(function (i) { return i.id === id; })[0];
    if (!def) return null;
    if (hasItem(save, id)) return save.inventory.filter(function (i) { return i.id === id; })[0];
    var it = { id: def.id, kind: def.kind, name: def.name, mode: def.mode, unlocks_level: def.unlocks_level, acquired: localDate(now) };
    save.inventory.push(it); save.log.push({ date: it.acquired, ev: 'item', item: id });
    return it;
  }
  /** Level 1 is always open; level n needs its unlock item (a travel element). */
  function levelUnlocked(save, levels, n) {
    var L = levelDef(levels, n); if (!L) return false;
    if (!L.unlock || !L.unlock.requires_item) return true;
    return hasItem(save, L.unlock.requires_item);
  }
  /** Travel to a level: must be playable and unlocked. Position per level is kept. */
  function travelTo(save, levels, n) {
    var L = levelDef(levels, n);
    if (!L || !L.playable) return { ok: false, reason: 'level not built yet' };
    if (!levelUnlocked(save, levels, n)) return { ok: false, reason: 'you need ' + L.unlock.requires_item };
    save.currentLevel = n; lv(save, n); return { ok: true, level: n };
  }

  /** Mark a seat discovered (exploration). Returns true if newly discovered. */
  function discover(save, seedId, n) { var st = lv(save, n || 1); st.discovered = st.discovered || []; if (st.discovered.indexOf(seedId) >= 0) return false; st.discovered.push(seedId); return true; }

  /** Player colour = side to move in the seed FEN. */
  function playerColor(fen) { return fen.split(' ')[1]; }

  /** Chronos rule-break: fires right after White's 8th move in the game. */
  function chronosShouldTrigger(whiteMovesMade) { return whiteMovesMade === 8; }

  /**
   * Plant a knight of `color` (Chronos's side) on an empty dark square. Deterministic per seedId.
   * Square must keep the position legal (never checks the king of the side NOT to move).
   * Returns the new FEN and square, or null if no legal square exists.
   */
  function chronosDrop(fen, color, seedId) {
    var dark = [], files = 'abcdefgh';
    for (var r = 1; r <= 8; r++) for (var f = 0; f < 8; f++) if ((f + r) % 2 === 1) dark.push(files[f] + r); // a1 dark: f0+r1 odd
    var start = fnv1a(seedId || 'chronos') % dark.length;
    for (var i = 0; i < dark.length; i++) {
      var sq = dark[(start + i) % dark.length];
      var c = new ChessCtor(fen);
      if (c.get(sq)) continue;
      c.put({ type: 'n', color: color }, sq);
      var parts = c.fen().split(' '); parts[3] = '-';  // no en-passant after a drop
      var nf = parts.join(' ');
      var test = new ChessCtor();
      if (!test.load(nf)) continue;
      // The side not to move must not be in check: flip turn and test.
      var p2 = nf.split(' '); p2[1] = p2[1] === 'w' ? 'b' : 'w'; p2[3] = '-';
      var flip = new ChessCtor(); if (!flip.load(p2.join(' '))) continue;
      if (flip.in_check()) continue;
      return { fen: nf, square: sq };
    }
    return null;
  }

  function isDarkSquare(sq) { var f = 'abcdefgh'.indexOf(sq[0]); var r = +sq[1]; return (f + r) % 2 === 1; }

  /** Classify a finished chess.js game for the player colour. */
  function gameResult(chess, pc) {
    if (chess.in_checkmate()) return chess.turn() === pc ? 'fail' : 'pass';
    if (chess.in_draw() || chess.in_stalemate() || chess.in_threefold_repetition() || chess.insufficient_material()) return 'draw';
    return null;
  }

  var api = { SAVE_VERSION: SAVE_VERSION, localDate: localDate, fnv1a: fnv1a, mulberry32: mulberry32, seedById: seedById,
    newSave: newSave, day: day, login: login, setTravel: setTravel, extraCap: extraCap, grantExtras: grantExtras, slots: slots,
    gateOpen: gateOpen, shrineKey: shrineKey, canStart: canStart, recordResult: recordResult, trophy: trophy, levelSummary: levelSummary, discover: discover, hasItem: hasItem, grantItem: grantItem, levelUnlocked: levelUnlocked, travelTo: travelTo,
    playerColor: playerColor, chronosShouldTrigger: chronosShouldTrigger, chronosDrop: chronosDrop, isDarkSquare: isDarkSquare, gameResult: gameResult };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { g.TCZ = g.TCZ || {}; g.TCZ.rules = api; }
})(this);
