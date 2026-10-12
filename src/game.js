/* TCZ Ground Game V2.2 — level-aware town worlds (MapProvider + level manifests), follow camera, minimap,
   registry-keyed challengers, journal HUD, travel elements, CinematicDirector beat slots. */
(function () {
  'use strict';
  /* ---------- level loader: pick the level from the save, then load its world file through a script tag (file:// safe) ---------- */
  var T0 = window.TCZ;
  function boot() {
    var save0 = T0.save.load(probeStorage(), T0.DESK, new Date());
    var n = save0.currentLevel || 1, L = T0.LEVELS.levels[n - 1];
    if (!L || !L.playable || !T0.rules.levelUnlocked(save0, T0.LEVELS, n)) { n = 1; L = T0.LEVELS.levels[0]; }
    if (T0.WORLDS && T0.WORLDS[L.world_id]) return start(n);
    var sc = document.createElement('script'); sc.src = L.data_file;
    sc.onload = function () { start(n); };
    sc.onerror = function () { document.getElementById('hint').textContent = 'Could not load ' + L.data_file; };
    document.head.appendChild(sc);
  }
  function probeStorage() {
    try { localStorage.setItem('tcz-probe', '1'); localStorage.removeItem('tcz-probe'); return localStorage; }
    catch (e) { var mem = window.__tczMem = window.__tczMem || {}; return { getItem: function (k) { return mem[k] || null; }, setItem: function (k, v) { mem[k] = v; }, removeItem: function (k) { delete mem[k]; } }; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  function start(LEVEL) {
  var T = window.TCZ, R = T.rules, DESK = T.DESK, LEVELS = T.LEVELS, S = T.save, SP = T.sprite, ENG = T.engine, CH = T.chars, BUS = T.bus;
  var VIEW_W = 56, VIEW_H = 32, PX = 12;            // 672 x 384 canvas, 12 px per 4 m tile
  var storage = probeStorage(), CINE = T.cinema;
  var save = null;
  function now() { var d = new Date(); d.setDate(d.getDate() + ((save && save.debug.dayOffset) || 0)); return d; }
  save = S.load(storage, DESK, new Date());
  function persist() { S.store(storage, save); }
  var BOUND = T.published.loadPublished(typeof TCZ_PUBLISHED !== 'undefined' ? TCZ_PUBLISHED : null);

  // ---------- world ----------
  var L1 = LEVELS.levels[LEVEL - 1], LK = String(LEVEL), shrineBy = {};
  var MAP = new T.map.OsmTileProvider(T.WORLDS[L1.world_id]);   // swap here for another MapProvider
  save.currentLevel = LEVEL; save.posByLevel = save.posByLevel || {};
  R.day(save, now()); if (!save.levels[LK]) { save.levels[LK] = { boards: {}, shrines: { void: false, chronos: false }, passOrder: [], discovered: [] }; }
  L1.shrines.forEach(function (s) { shrineBy[s.seed_id] = s; });
  var LAYOUT = T.placement.place(MAP, DESK, L1);
  var GATE = LAYOUT.gate;
  var seats = LAYOUT.seats.map(function (s) {
    var seed = R.seedById(DESK, s.seed_id);
    return { seed: seed, x: s.x, y: s.y, kind: s.kind, poi: s.poi, shrine: shrineBy[s.seed_id] || null, ch: CH.characterFor(T.CHARACTERS, s.seed_id) };
  });
  var seatAt = {}; seats.forEach(function (o) { seatAt[o.x + ',' + o.y] = o; });
  var P0 = save.posByLevel[LK];
  var player = (P0 && MAP.walkable(P0.x, P0.y)) ? { x: P0.x, y: P0.y } : { x: LAYOUT.spawn.x, y: LAYOUT.spawn.y };
  var cam = new T.camera.Camera(VIEW_W, VIEW_H, MAP.width, MAP.height);
  var sprites = {}, portraits = {};
  seats.forEach(function (o) {
    sprites[o.seed.seed_id] = SP.spriteFor(o.seed);
    if (o.ch && o.ch.hasPortrait) { var im = new Image(); im.onerror = function () { o.ch.hasPortrait = false; }; im.src = o.ch.portraitPath; portraits[o.seed.seed_id] = im; }
  });
  function gateOpen() { return R.gateOpen(save, LEVELS, LEVEL); }
  function walk(x, y) { if (GATE && x === GATE.x && y === GATE.y && !gateOpen()) return false; return MAP.walkable(x, y); }

  var COLORS = ['#1a2a1d', '#3b3d3c', '#7d776a', '#8a5a3c', '#2e6b3b', '#2f5f93', '#5b4632', '#4b4d55', '#a08f68', '#6b2a27', '#3f7d46', '#050a07', '#6f6a5c'];
  var cv = document.getElementById('map'), ctx = cv.getContext('2d');
  // minimap: pre-rendered once (1 px per 3 tiles) — cheap per frame
  var MM_SCALE = 3, mm = document.createElement('canvas'); mm.width = Math.ceil(MAP.width / MM_SCALE); mm.height = Math.ceil(MAP.height / MM_SCALE);
  (function () { var c = mm.getContext('2d'), img = c.createImageData(mm.width, mm.height);
    for (var y = 0; y < mm.height; y++) for (var x = 0; x < mm.width; x++) {
      var code = MAP.tile(x * MM_SCALE + 1, y * MM_SCALE + 1), hex = COLORS[code] || '#000', i = (y * mm.width + x) * 4;
      img.data[i] = parseInt(hex.substr(1, 2), 16); img.data[i + 1] = parseInt(hex.substr(3, 2), 16); img.data[i + 2] = parseInt(hex.substr(5, 2), 16); img.data[i + 3] = 255;
    } c.putImageData(img, 0, 0); })();

  function st(id) { var b = save.levels[LK].boards[id]; return b ? b.result : null; }
  function discovered(id) { return (save.levels[LK].discovered || []).indexOf(id) >= 0; }
  function isQuest(o) { return o.kind === 'shrine' || o.kind === 'closer'; }
  function objective() {
    var s = save.levels[LK].shrines;
    var target = null, text = '';
    for (var i = 0; i < L1.shrines.length && !target; i++) { var sh = L1.shrines[i]; if (!s[sh.key]) { target = seatById(sh.seed_id); text = 'Clear the ' + sh.name + (target ? ' (' + target.poi.name + ')' : ''); } }
    if (!target && st(L1.closer_seed_id) !== 'pass') { target = seatById(L1.closer_seed_id); text = 'Gate open: beat the closer'; }
    if (!target && !text) { var nx = nextLevel(); text = nx ? 'Closer beaten. Travel to ' + nx.town + ' (Travel panel or T)' : 'Closer beaten. Keep sitting seeds to fill 28.'; }
    return { target: target, text: text };
  }
  function seatById(id) { for (var i = 0; i < seats.length; i++) if (seats[i].seed.seed_id === id) return seats[i]; return null; }
  function nextLevel() { var nx = LEVELS.levels[LEVEL]; return nx && nx.playable && R.levelUnlocked(save, LEVELS, LEVEL + 1) ? nx : null; }
  function compass(dx, dy) { var a = Math.atan2(dy, dx) * 180 / Math.PI; var dirs = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']; return dirs[(Math.round(a / 45) + 8) % 8]; }

  function draw() {
    cam.follow(player.x, player.y);
    var x0 = cam.x, y0 = cam.y;
    for (var y = 0; y < VIEW_H; y++) for (var x = 0; x < VIEW_W; x++) {
      var code = MAP.tile(x0 + x, y0 + y); ctx.fillStyle = COLORS[code] || '#000'; ctx.fillRect(x * PX, y * PX, PX, PX);
      if (code === 3) { ctx.fillStyle = '#a06c48'; ctx.fillRect(x * PX, y * PX, PX, 3); }
      else if (code === 0 && ((x0 + x) * 31 + (y0 + y) * 17) % 11 === 0) { ctx.fillStyle = '#22382a'; ctx.fillRect(x * PX + 3, y * PX + 3, 6, 6); }
      else if (code === 1 && ((x0 + x + y0 + y) % 6 === 0)) { ctx.fillStyle = '#4a4c4a'; ctx.fillRect(x * PX + 5, y * PX + 5, 2, 2); }
    }
    if (GATE && cam.visible(GATE.x, GATE.y)) { ctx.fillStyle = gateOpen() ? '#3d6b2e' : '#b0302a'; ctx.fillRect((GATE.x - x0) * PX, (GATE.y - y0) * PX, PX, PX); }
    // POI + street labels (only near the camera)
    ctx.font = '10px monospace'; ctx.fillStyle = '#e9e3d1aa';
    MAP.labels().forEach(function (l) { if (cam.visible(l.x, l.y)) ctx.fillText(l.name, (l.x - x0) * PX, (l.y - y0) * PX); });
    // seats + markers
    var t = Date.now() / 300;
    seats.forEach(function (o) {
      if (!cam.visible(o.x, o.y)) return;
      var px = (o.x - x0) * PX, py = (o.y - y0) * PX, id = o.seed.seed_id;
      var near = Math.max(Math.abs(o.x - player.x), Math.abs(o.y - player.y)) <= 10;
      if (!discovered(id) && !isQuest(o) && !near) { ctx.fillStyle = '#ffffff22'; ctx.fillRect(px + 4, py + 4, 4, 4); return; }
      ctx.fillStyle = o.kind === 'shrine' ? (o.seed.family === 'Chronos' ? '#4d3c17' : '#3b2f52') : o.kind === 'closer' ? '#4a1f1d' : '#0f1d15';
      ctx.fillRect(px - 6, py - 6, 24, 24);
      var im = portraits[id]; if (im && im.complete && im.naturalWidth && o.ch.hasPortrait) ctx.drawImage(im, px - 6, py - 6, 24, 24); else SP.drawSprite(ctx, sprites[id], px - 6, py - 6, 3);
      var s = st(id), col = s === 'pass' ? '#7fdc8f' : s === 'fail' ? '#e0403a' : s === 'draw' ? '#ffd27a' : '#e9e3d1';
      var bob = Math.round(Math.sin(t + o.x) * 1.5);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px + 6, py - 16 + bob); ctx.lineTo(px + 10, py - 11 + bob); ctx.lineTo(px + 6, py - 6 + bob); ctx.lineTo(px + 2, py - 11 + bob); ctx.fill();
      if (isQuest(o) && s !== 'pass') { ctx.fillStyle = '#ffd27a'; ctx.font = 'bold 12px monospace'; ctx.fillText('!', px + 3, py - 18 + bob); }
    });
    // player
    var p = { x: (player.x - x0) * PX, y: (player.y - y0) * PX };
    ctx.fillStyle = '#e9e3d1'; ctx.fillRect(p.x + 3, p.y - 2, 6, 5); ctx.fillStyle = '#e0403a'; ctx.fillRect(p.x + 2, p.y + 3, 8, 7); ctx.fillStyle = '#111'; ctx.fillRect(p.x + 2, p.y + 10, 3, 2); ctx.fillRect(p.x + 7, p.y + 10, 3, 2);
    // objective arrow when the target is off-screen
    var ob = objective();
    if (ob.target && !cam.visible(ob.target.x, ob.target.y)) {
      var dx = ob.target.x - player.x, dy = ob.target.y - player.y, a = Math.atan2(dy, dx), cx = cv.width / 2, cy = cv.height / 2;
      var ex = cx + Math.cos(a) * (cx - 22), ey = cy + Math.sin(a) * (cy - 22);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.fill(); ctx.restore();
    }
    // journal HUD
    var sum = R.levelSummary(save, DESK, LEVEL), sh = save.levels[LK].shrines, disc = (save.levels[LK].discovered || []).length;
    ctx.fillStyle = '#000000b0'; ctx.fillRect(6, 6, 300, 58);
    ctx.fillStyle = '#ffd27a'; ctx.font = 'bold 11px monospace'; ctx.fillText('JOURNAL · ' + L1.town + ' · ' + L1.level_id, 12, 20);
    ctx.fillStyle = '#e9e3d1'; ctx.font = '11px monospace';
    ctx.fillText('Progress ' + sum.units + '/28  Found ' + disc + '/28  Void ' + (sh.void ? '✔' : '·') + ' Chronos ' + (sh.chronos ? '✔' : '·') + ' Gate ' + (gateOpen() ? 'open' : 'shut'), 12, 36);
    var dist = ob.target ? Math.round(Math.hypot(ob.target.x - player.x, ob.target.y - player.y) * MAP.tileMeters) + ' m ' + compass(ob.target.x - player.x, ob.target.y - player.y) : '';
    ctx.fillText('▶ ' + ob.text + (dist ? '  (' + dist + ')' : ''), 12, 52);
    // minimap
    var mw = mm.width / 2, mh = mm.height / 2, mx = cv.width - mw - 6, my = 6;
    ctx.fillStyle = '#000'; ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4); ctx.drawImage(mm, mx, my, mw, mh);
    var k = 1 / (MM_SCALE * 2);
    ctx.strokeStyle = '#ffd27a88'; ctx.strokeRect(mx + cam.x * k, my + cam.y * k, VIEW_W * k, VIEW_H * k);
    seats.forEach(function (o) { if (!discovered(o.seed.seed_id) && !isQuest(o)) return; var s = st(o.seed.seed_id); ctx.fillStyle = isQuest(o) ? '#ffd27a' : s === 'pass' ? '#7fdc8f' : '#e9e3d1'; ctx.fillRect(mx + o.x * k - 1, my + o.y * k - 1, 3, 3); });
    ctx.fillStyle = '#e0403a'; ctx.fillRect(mx + player.x * k - 2, my + player.y * k - 2, 4, 4);
    // ODbL attribution (required)
    ctx.font = '10px sans-serif'; var attr = MAP.attribution, aw = ctx.measureText(attr).width;
    ctx.fillStyle = '#000000b0'; ctx.fillRect(cv.width - aw - 10, cv.height - 15, aw + 8, 14); ctx.fillStyle = '#e9e3d1'; ctx.fillText(attr, cv.width - aw - 6, cv.height - 4);
  }
  function nearby() {
    var best = null, bd = 9;
    seats.forEach(function (o) { var d = Math.max(Math.abs(o.x - player.x), Math.abs(o.y - player.y)); if (d <= 1 && d < bd) { bd = d; best = o; } });
    return best;
  }
  function discoverAround() {
    var changed = false;
    seats.forEach(function (o) { if (Math.max(Math.abs(o.x - player.x), Math.abs(o.y - player.y)) <= 8 && R.discover(save, o.seed.seed_id, LEVEL)) { changed = true; CINE.play('seatDiscover', { seed: o.seed, character: o.ch, poi: o.poi, level: LEVEL }); toast('Discovered: <b>' + esc(o.ch ? o.ch.displayName : o.seed.seed_id) + '</b> at ' + esc(o.poi.name)); } });
    return changed;
  }
  function toast(msg, ms) { var t = document.getElementById('toast'); t.innerHTML = msg; t.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(function () { t.style.display = 'none'; }, ms || 3500); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function portraitHTML(o, size) {
    if (o.ch && o.ch.hasPortrait) return '<img src="' + esc(o.ch.portraitPath) + '" width="' + size + '" height="' + size + '" style="float:right;object-fit:cover;image-rendering:auto" alt="">';
    var c = document.createElement('canvas'); c.width = c.height = 48; SP.drawSprite(c.getContext('2d'), sprites[o.seed.seed_id], 0, 0, 6);
    return '<img src="' + c.toDataURL() + '" width="' + size + '" height="' + size + '" style="float:right;image-rendering:pixelated" alt="placeholder">';
  }
  function badge(ch) { return ch ? (ch.locked ? '<span class="badge lock">LOCKED</span>' : '<span class="badge draft">' + ch.status.toUpperCase() + '</span>') : ''; }

  // ---------- side panel ----------
  function renderSide() {
    var n = now(), sl = R.slots(save, DESK, n), sum = R.levelSummary(save, DESK, LEVEL), stt = save.levels[LK], d = R.day(save, n);
    document.getElementById('wallets').innerHTML = '<div class="kv">' +
      '<span>Local date</span><b>' + sl.date + (save.debug.dayOffset ? ' (debug +' + save.debug.dayOffset + 'd)' : '') + '</b>' +
      '<span>Cash (per diem) <a class="tip" tabindex="0" id="cashTip">ⓘ</a></span><b>$' + save.wallets.cash + '</b>' +
      '<span>Progress</span><b>' + sum.units + ' / ' + sum.toClose + ' seeds</b>' +
      '<span>Boards</span><b><span class="pass">' + sum.passes + ' pass</span> · <span class="fail">' + sum.fails + ' fail</span> · <span class="draw">' + sum.draws + ' draw</span></b>' +
      '<span>Trophy ' + L1.level_id + '</span><b>' + (sum.trophy === null ? 'null (incomplete)' : sum.trophy) + '</b>' +
      '<span>Seeds today</span><b>' + (sl.ignoreDaily ? 'unlimited (debug)' : (sl.daily ? 'daily ready' : 'daily used') + ' · extras ' + sl.extras + ' left (' + sl.extrasGranted + '/' + sl.cap + ')') + '</b>' +
      '<span>Travel today</span><b>' + (d.travel || 'not declared') + '</b>' +
      (BOUND && !BOUND.error ? '<span>Published hook</span><b>' + esc(BOUND.item.title) + ' → ' + esc(BOUND.bind_to) + '</b>' : '') + '</div>' +
      '<div id="cashTipBox" class="tipbox"><b>What per diem buys</b><br>+$' + DESK.inputs.per_diem_login + ' the first time you play each local day (automatic).<br>' +
      '<b>Travel</b> (one fare per day): ' + DESK.travel.map(function (t) { return t.class_id + ' $' + t.fare; }).join(', ') + '.<br>' +
      'High-risk travel (parachute, helicopter, tank, jet) is what gold needs.<br>Seats are free. Cash never buys progress.<br><span class="dim">Shops, closet and swag unlocks: planned, not in V2.</span></div>';
    syncTip();
    // quest log
    var ob = objective(), qs = '<b>Quest log</b><ol class="quests">' +
      L1.shrines.map(function (sh) { var o2 = seatById(sh.seed_id); return '<li class="' + (stt.shrines[sh.key] ? 'done' : '') + '">' + esc(sh.name) + ' (' + esc(o2 ? o2.poi.name : '?') + ')</li>'; }).join('') +
      '<li class="' + (st(L1.closer_seed_id) === 'pass' ? 'done' : '') + '">Closer behind the gate (' + esc(seatById(L1.closer_seed_id) ? seatById(L1.closer_seed_id).poi.name : '?') + ')</li>' +
      '<li class="' + (sum.units >= 28 ? 'done' : '') + '">Sit 28 seeds: ' + sum.units + '/28</li></ol>' +
      '<b>Found seats</b> <span class="dim">(' + (stt.discovered || []).length + '/28)</span><ul class="found">' +
      seats.filter(function (o) { return discovered(o.seed.seed_id); }).map(function (o) { var s = st(o.seed.seed_id); return '<li><span class="' + (s || '') + '">●</span> ' + esc(o.ch ? o.ch.displayName : o.seed.seed_id) + ' <span class="dim">· ' + esc(o.poi.name) + '</span></li>'; }).join('') + '</ul>';
    document.getElementById('quests').innerHTML = qs;
    // inventory + travel
    var inv = save.inventory || [], tv = '<b>Inventory</b> <span class="dim">(travel elements)</span><ul class="found">' + (inv.length ? inv.map(function (it) { return '<li>🎟 ' + esc(it.name) + '</li>'; }).join('') : '<li class="dim">Nothing yet. Beat the closer to earn a travel element.</li>') + '</ul><b>Travel</b><ul class="found">';
    LEVELS.levels.slice(0, 8).forEach(function (lv2) {
      var unlocked = R.levelUnlocked(save, LEVELS, lv2.world_level), here = lv2.world_level === LEVEL;
      tv += '<li>' + lv2.level_id + ' · ' + esc(lv2.town || 'planned') + (here ? ' <b>(here)</b>' : lv2.playable && unlocked ? ' <button class="travelBtn" data-level="' + lv2.world_level + '">Travel</button>' : lv2.playable ? ' <span class="dim">needs ' + esc(lv2.unlock.requires_item) + '</span>' : ' <span class="dim">' + lv2.status + '</span>') + '</li>';
    });
    document.getElementById('inventory').innerHTML = tv + '</ul>';
    var o = nearby(), h = '<b>Inspector</b><br>';
    if (o) {
      var s2 = o.seed, b = stt.boards[s2.seed_id], ch = o.ch;
      h += portraitHTML(o, 56) + '<b>' + esc(ch ? ch.displayName : s2.seed_id) + '</b> ' + badge(ch) + '<br>' +
        '<span class="dim">' + s2.seed_id + ' · registry day ' + (ch ? ch.day + ' ' + ch.side : '?') + ' · at ' + esc(o.poi.name) + (o.kind === 'shrine' ? ' · ' + esc(o.shrine.name) : o.kind === 'closer' ? ' · CLOSER' : '') + '</span><br>' +
        (ch && ch.line ? '<i>' + esc(ch.line) + '</i><br>' : '') +
        '<span class="dim">' + (s2.family || 'no family') + ' · ' + s2.skill_band + ' · bot ' + s2.bot_training + '</span><br>“' + esc(s2.miss_line) + '”<br>' +
        (o.shrine && o.shrine.ability ? '<i>Ability: ' + esc(o.shrine.ability.sentence) + '</i><br>' : '') +
        'Status: <b>' + (b ? b.result + ' (' + b.attempts.length + ')' : 'open') + '</b> · <span class="dim">E to sit</span>';
    } else h += '<span class="dim">Explore ' + esc(L1.town) + '. Seats appear near landmarks; walk next to one and press E.</span>';
    document.getElementById('inspector').innerHTML = h;
    document.getElementById('dbgIgnore').checked = !!save.debug.ignoreDaily;
    document.getElementById('r2Sponsor').checked = d.sponsor; document.getElementById('r2Hotspot').checked = d.hotspot;
  }
  function render() { draw(); renderSide(); }
  var tipOpen = false;   // per diem tooltip (hover or click/tap on the ⓘ); no CSS :has() so older Safari works
  function syncTip() { var b = document.getElementById('cashTipBox'); if (b) b.className = 'tipbox' + (tipOpen ? ' show' : ''); }
  var W_ = document.getElementById('wallets');
  W_.addEventListener('mouseover', function (e) { if (e.target.id === 'cashTip') { tipOpen = true; syncTip(); } });
  W_.addEventListener('mouseout', function (e) { if (e.target.id === 'cashTip') { tipOpen = false; syncTip(); } });
  W_.addEventListener('click', function (e) { if (e.target.id === 'cashTip') { tipOpen = !tipOpen; syncTip(); } });

  // ---------- duel ----------
  var duel = null, PIECE = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
  function payload(extra) { var p = { seed: duel.seed, character: duel.o.ch, kind: duel.o.kind, poi: duel.o.poi }; for (var k in extra) p[k] = extra[k]; return p; }
  function openDuel(o) {
    var n = now(), chk = R.canStart(save, DESK, LEVELS, o.seed.seed_id, n);
    if (!chk.ok) { toast(esc(chk.reason)); return; }
    var fen = o.seed.fen, bound = false;
    if (BOUND && !BOUND.error && BOUND.bind_to === o.seed.seed_id && BOUND.startFen) { fen = BOUND.startFen; bound = true; }
    var chess = new Chess(fen);
    duel = { o: o, seed: o.seed, chess: chess, pc: R.playerColor(chess.fen()), sel: null, last: null, whiteMoves: 0, done: false, dropped: null, bound: bound };
    duel.lastEval = evalForPlayer();
    document.getElementById('modal').hidden = false; document.getElementById('closeBtn').hidden = true; document.getElementById('resignBtn').hidden = false;
    var ch = o.ch;
    document.getElementById('duelHead').innerHTML = portraitHTML(o, 64) + '<b>' + esc(ch ? ch.displayName : o.seed.seed_id) + '</b> ' + badge(ch) + '<br><span class="dim">' + o.seed.seed_id + ' · ' + (o.shrine ? esc(o.shrine.name) : o.kind === 'closer' ? 'Closer' : o.seed.seat_type) + ' · ' + esc(o.poi.name) +
      ' · you play <b>' + (duel.pc === 'w' ? 'White' : 'Black') + '</b></span><br><span class="dim">' + (ch && ch.line ? esc(ch.line) + '<br>' : '') + '“' + esc(o.seed.miss_line) + '”' + (o.shrine && o.shrine.ability ? '<br>Ability: ' + esc(o.shrine.ability.sentence) : '') + (bound ? '<br>Bound to published item: ' + esc(BOUND.item.title) : '') + '</span>';
    BUS.emit('onChallengeStart', payload({ fen: chess.fen(), playerColor: duel.pc }));
    CINE.play(o.kind === 'closer' ? 'closer' : 'challengeStart', payload({ phase: 'start', level: LEVEL }));
    status('Your move.'); drawBoard();
    if (chess.turn() !== duel.pc) setTimeout(botMove, 250);
  }
  function evalForPlayer() { var e = ENG.evaluate(duel.chess); return duel.chess.turn() === duel.pc ? e : -e; }
  function status(m) { document.getElementById('duelStatus').innerHTML = m; }
  function drawBoard() {
    var el = document.getElementById('board'), c = duel.chess, html = '', flip = duel.pc === 'b', moves = [];
    if (duel.sel) moves = c.moves({ square: duel.sel, verbose: true }).map(function (m) { return m.to; });
    var kingSq = null; if (c.in_check()) { var bd = c.board(); for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) { var q = bd[r][f]; if (q && q.type === 'k' && q.color === c.turn()) kingSq = 'abcdefgh'[f] + (8 - r); } }
    for (var i = 0; i < 64; i++) {
      var r2 = flip ? 7 - Math.floor(i / 8) : Math.floor(i / 8), f2 = flip ? 7 - (i % 8) : i % 8, sq = 'abcdefgh'[f2] + (8 - r2), p = c.get(sq);
      var cls = 'sq ' + ((r2 + f2) % 2 ? 'd' : 'l') + (duel.sel === sq ? ' sel' : '') + (moves.indexOf(sq) >= 0 ? ' tgt' : '') + (duel.last && (duel.last.from === sq || duel.last.to === sq) ? ' last' : '') + (kingSq === sq ? ' chk' : '') + (duel.dropped === sq ? ' last' : '');
      html += '<div class="' + cls + '" data-sq="' + sq + '">' + (p ? '<span class="' + (p.color === 'w' ? 'pw' : 'pb') + '">' + PIECE[p.type] + '</span>' : '') + '</div>';
    }
    el.innerHTML = html;
  }
  function afterMove(m) {
    duel.last = m; duel.dropped = null;
    if (m.color === 'w') duel.whiteMoves++;
    var sh = duel.o.shrine;
    if (sh && sh.ability && sh.ability.id === 'chronos_knight_drop' && m.color === 'w' && R.chronosShouldTrigger(duel.whiteMoves)) {
      var botColor = duel.pc === 'w' ? 'b' : 'w', dr = R.chronosDrop(duel.chess.fen(), botColor, duel.seed.seed_id);
      if (dr) { duel.chess.load(dr.fen); duel.dropped = dr.square; duel.chronosDrop = dr.square; toast('⏱ Chronos plants a knight on <b>' + dr.square + '</b>. Plan around it.', 5000); }
    }
    var ev = evalForPlayer(), delta = ev - duel.lastEval;
    if (Math.abs(delta) >= 200) { var sp2 = payload({ san: m.san, by: m.color === duel.pc ? 'player' : 'opponent', evalBefore: duel.lastEval, evalAfter: ev, delta: delta }); BUS.emit('onSwing', sp2); CINE.play('swing', sp2); }
    duel.lastEval = ev;
    var res = R.gameResult(duel.chess, duel.pc);
    if (res) { if (duel.chess.in_checkmate()) { var mp = payload({ san: m.san, winner: res === 'pass' ? 'player' : 'opponent' }); BUS.emit('onMate', mp); CINE.play('mate', mp); } finish(res, false); return true; }
    return false;
  }
  function botMove() {
    if (!duel || duel.done) return;
    status('Opponent is thinking…');
    setTimeout(function () {
      var mv = ENG.pickMove(duel.chess, duel.seed.bot_training, duel.seed.seed_id);
      var m = duel.chess.move(mv); drawBoard();
      if (!afterMove(m)) status(duel.chess.in_check() ? '<span class="fail">Check.</span> Your move.' : 'Your move.');
      drawBoard();
    }, 30);
  }
  document.getElementById('board').addEventListener('click', function (e) {
    var t = e.target.closest('.sq'); if (!t || !duel || duel.done || duel.chess.turn() !== duel.pc) return;
    var sq = t.getAttribute('data-sq'), p = duel.chess.get(sq);
    if (duel.sel) { var m = duel.chess.move({ from: duel.sel, to: sq, promotion: 'q' }); if (m) { duel.sel = null; drawBoard(); if (!afterMove(m)) botMove(); drawBoard(); return; } }
    duel.sel = (p && p.color === duel.pc) ? sq : null; drawBoard();
  });
  function finish(result, resign) {
    duel.done = true;
    var gateBefore = gateOpen();
    var out = R.recordResult(save, DESK, LEVELS, duel.seed.seed_id, result, now(), { resign: resign });
    persist();
    BUS.emit('onEnd', payload({ result: result, resign: !!resign, reopened: out.reopened, fen: duel.chess.fen(), moves: duel.chess.history().length }));
    if (result === 'pass' && duel.o.shrine) CINE.play('shrineClear', payload({ shrine: duel.o.shrine.name }));
    if (!gateBefore && gateOpen()) CINE.play('gateOpen', payload({ level: LEVEL }));
    if (result === 'pass' && duel.o.kind === 'closer') CINE.play('closer', payload({ phase: 'defeated', reward: out.reward }));
    var msg = result === 'pass' ? '<span class="pass">PASS.</span> Seed closed, +1 progress.' : result === 'draw' ? '<span class="draw">DRAW.</span> Logged as a draw. Seat stays open.' : '<span class="fail">FAIL.</span> A loss costs progress.';
    if (out.reopened) msg += ' ' + out.reopened + ' re-opened (−1).';
    if (out.reward) msg += '<br>🎟 You earned: <b>' + esc(out.reward.name) + '</b>. Open the Travel panel to go.';
    if (out.withheld) msg += ' Grimwald: resign withholds the unit.';
    if (!out.ok) msg += ' (not recorded: ' + esc(out.reason) + ')';
    if (result === 'pass' && duel.o.shrine) msg += '<br>' + esc(duel.o.shrine.name) + ' cleared.' + (gateOpen() ? ' <b>The gate is open.</b>' : '');
    msg += '<br><span class="dim">Coach: name the miss, stay on the board. Good luck next one.</span>';
    status(msg); document.getElementById('closeBtn').hidden = false; document.getElementById('resignBtn').hidden = true;
  }
  document.getElementById('resignBtn').onclick = function () { if (duel && !duel.done && confirm('Resign? This is a loss and costs progress.')) finish('fail', true); };
  document.getElementById('closeBtn').onclick = function () { document.getElementById('modal').hidden = true; duel = null; render(); cv.focus(); };

  // ---------- input (held keys walk at a steady rate) ----------
  var DIRS = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
  var held = {}, lastStep = 0, raf = 0, lastSaveMove = 0;
  function step(d) {
    var nx = player.x + d[0], ny = player.y + d[1];
    if (GATE && nx === GATE.x && ny === GATE.y && !gateOpen()) { toast('The gate is shut. Clear the Void and Chronos shrines.'); return false; }
    if (!walk(nx, ny)) return false;
    player.x = nx; player.y = ny; save.posByLevel[LK] = { x: nx, y: ny };
    discoverAround();
    if (Date.now() - lastSaveMove > 1500) { persist(); lastSaveMove = Date.now(); }
    return true;
  }
  function loop(ts) {
    var keys = Object.keys(held); if (!keys.length || duel) { raf = 0; render(); return; }
    if (ts - lastStep > 70) { lastStep = ts; step(DIRS[keys[keys.length - 1]]); draw(); }
    raf = requestAnimationFrame(loop);
  }
  document.addEventListener('keydown', function (e) {
    if (duel || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (DIRS[e.code]) { e.preventDefault(); if (!held[e.code]) { held[e.code] = 1; step(DIRS[e.code]); lastStep = performance.now(); draw(); } if (!raf) raf = requestAnimationFrame(loop); }
    else if (e.code === 'KeyE') { var o = nearby(); if (o) openDuel(o); }
    else if (e.code === 'KeyT') { var nx2 = nextLevel(); if (nx2) travel(nx2.world_level); else toast('No travel element for the next level yet.'); }
    else if (e.code === 'KeyH') { var got = R.login(save, DESK, now()); persist(); toast(got ? 'Per diem collected: +$' + got : 'Per diem already collected today.'); render(); }
  });
  document.addEventListener('keyup', function (e) { delete held[e.code]; if (!Object.keys(held).length) { persist(); renderSide(); } });
  window.addEventListener('blur', function () { held = {}; });
  cv.addEventListener('click', function () { cv.focus(); });
  setInterval(function () { if (!raf && !duel && document.visibilityState === 'visible') draw(); }, 400); // marker bob, very light

  // ---------- debug / save controls ----------
  function $(id) { return document.getElementById(id); }
  $('dbgIgnore').onchange = function () { save.debug.ignoreDaily = this.checked; persist(); render(); };
  $('dbgNextDay').onclick = function () { save.debug.dayOffset = (save.debug.dayOffset || 0) + 1; R.login(save, DESK, now()); persist(); render(); toast('Advanced to ' + R.localDate(now()) + '. Yesterday\'s unused extras expired.'); };
  $('dbgToday').onclick = function () { save.debug.dayOffset = 0; persist(); render(); };
  $('dbgSpawn').onclick = function () { player.x = LAYOUT.spawn.x; player.y = LAYOUT.spawn.y; save.posByLevel[LK] = null; persist(); render(); };
  function travel(to) {
    var item = (save.inventory || []).filter(function (i) { return i.unlocks_level === to; })[0];
    var r = R.travelTo(save, LEVELS, to); if (!r.ok) { toast(esc(r.reason)); return; }
    persist();
    CINE.play('levelTravel', { from: LEVEL, to: to, item: item, seed: null, character: null }).then(function () { setTimeout(function () { location.reload(); }, 400); });
  }
  $('inventory').addEventListener('click', function (e) { var b = e.target.closest('.travelBtn'); if (b) travel(+b.getAttribute('data-level')); });
  $('r2Grant').onclick = function () { var g = R.grantExtras(save, DESK, now(), +$('r2Claim').value, $('r2Sponsor').checked, $('r2Hotspot').checked); persist(); render(); toast('Rule 2: ' + g + ' extra seed slot(s) granted today (cap ' + R.slots(save, DESK, now()).cap + '). They expire at local midnight.'); };
  DESK.travel.forEach(function (t) { var op = document.createElement('option'); op.value = t.class_id; op.textContent = t.class_id + ' ($' + t.fare + ', ' + t.legal_gate + ')'; $('travelSel').appendChild(op); });
  $('travelGo').onclick = function () { var r = R.setTravel(save, DESK, now(), $('travelSel').value); persist(); render(); toast(r.ok ? 'Travel declared. Fare $' + r.fare + ' from cash.' : esc(r.reason)); };
  $('saveExport').onclick = function () {
    var txt = S.serialize(save); $('saveText').value = txt;
    try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = 'tcz-ground-game-save-' + R.localDate(new Date()) + '.json'; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { /* textarea fallback */ }
    toast('Save exported (also copied into the text box).');
  };
  $('saveImport').onclick = function () { try { save = S.deserialize($('saveText').value); persist(); render(); toast('Save imported.'); } catch (e) { toast('Import failed: ' + esc(e.message)); } };
  $('saveReset').onclick = function () { if (confirm('Reset all progress?')) { save = S.reset(storage, DESK, new Date()); R.login(save, DESK, now()); player.x = LAYOUT.spawn.x; player.y = LAYOUT.spawn.y; persist(); render(); toast('Save reset.'); } };
  LEVELS.levels.forEach(function (l) { var li = document.createElement('li'); li.textContent = l.level_id + ' · ' + l.tier + ' · ' + (l.town || 'planned') + ' · ×' + (l.area_factor > 1e6 ? l.area_factor.toExponential(1) : l.area_factor) + ' area' + (l.playable ? ' · playable' : ''); $('levels').appendChild(li); });

  R.login(save, DESK, now()); persist(); render(); cv.focus();
  CINE.play('levelEnter', { level: LEVEL, town: L1.town, seed: null, character: null }); discoverAround(); persist(); render();
  window.__tczDuelState = function () { return duel ? { fen: duel.chess.fen(), turn: duel.chess.turn(), pc: duel.pc, done: duel.done, dropped: duel.chronosDrop || null, whiteMoves: duel.whiteMoves } : null; };
  window.__tcz = { level: LEVEL, levelDef: L1, travel: travel, get save() { return save; }, render: render, map: MAP, layout: LAYOUT, seats: seats, camera: cam, player: player, step: function (dx, dy) { var ok = step([dx, dy]); render(); return ok; },
    teleport: function (x, y) { player.x = x; player.y = y; discoverAround(); render(); },
    openDuelById: function (id) { for (var i = 0; i < seats.length; i++) if (seats[i].seed.seed_id === id) return openDuel(seats[i]); }, finishDuel: function (r) { if (duel) finish(r, false); } };
  }
})();
