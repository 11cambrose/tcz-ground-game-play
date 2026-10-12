/* CinematicDirector: one registry of beat slots. Every slot has a no-op default plus a stub card, so a real scene can be
   dropped in later by file (cinematics/scenes/<slot>.js calling TCZ.cinema.register(slot, scene)) with no game changes.
   A scene is: function (payload, api) -> Promise|void.  api = { card(title, body, ms), overlay, done }.
   The game calls director.play(slot, payload); play() never throws and never blocks input unless the scene asks. */
(function (g) {
  'use strict';
  var SLOTS = {
    levelEnter:     { title: 'Level enter',      blocking: false, describe: function (p) { return 'Arriving in ' + p.town + ' (level ' + p.level + ').'; } },
    seatDiscover:   { title: 'Seat discovered',  blocking: false, describe: function (p) { return (p.character ? p.character.displayName : p.seed.seed_id) + ' at ' + (p.poi ? p.poi.name : '?') + '.'; } },
    challengeStart: { title: 'Challenge start',  blocking: false, describe: function (p) { return (p.character ? p.character.displayName : p.seed.seed_id) + ' sits down. Taunt, handshake, prep.'; } },
    swing:          { title: 'Eval swing',       blocking: false, describe: function (p) { return p.san + ' swings it by ' + Math.round(p.delta) + ' cp (' + p.by + ').'; } },
    mate:           { title: 'Mate',             blocking: false, describe: function (p) { return p.san + ': ' + p.winner + ' delivers mate.'; } },
    shrineClear:    { title: 'Shrine cleared',   blocking: false, describe: function (p) { return p.shrine + ' is cleared.'; } },
    gateOpen:       { title: 'Gate opens',       blocking: false, describe: function (p) { return 'The gate to the closer opens.'; } },
    closer:         { title: 'Closer',           blocking: false, describe: function (p) { return 'The closer ' + (p.character ? p.character.displayName : '') + ' ' + (p.phase === 'defeated' ? 'falls.' : 'steps up.'); } },
    levelTravel:    { title: 'Level travel',     blocking: false, describe: function (p) { return 'Travel by ' + (p.item ? p.item.name : 'road') + ' to level ' + p.to + '.'; } }
  };
  function Director(opts) {
    opts = opts || {};
    this.scenes = {}; this.log = []; this.stubCards = opts.stubCards !== false; this.doc = opts.document || (typeof document !== 'undefined' ? document : null);
  }
  Director.prototype.slots = function () { return Object.keys(SLOTS); };
  Director.prototype.register = function (slot, scene) { if (!SLOTS[slot]) throw new Error('unknown cinematic slot: ' + slot); this.scenes[slot] = scene; };
  Director.prototype.unregister = function (slot) { delete this.scenes[slot]; };
  Director.prototype.hasScene = function (slot) { return !!this.scenes[slot]; };
  Director.prototype.card = function (title, body, ms) {
    if (!this.doc || !this.stubCards) return;
    var host = this.doc.getElementById('cineCards'); if (!host) return;
    var el = this.doc.createElement('div'); el.className = 'cine-card';
    el.innerHTML = '<b>🎬 ' + title + '</b><br>' + String(body).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }) + '<br><span class="dim">stub card · drop a scene in cinematics/scenes/</span>';
    host.appendChild(el); while (host.children.length > 3) host.removeChild(host.firstChild);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, ms || 2200);
  };
  /** Play a beat. Returns a Promise that resolves when the scene (or the stub) is done. */
  Director.prototype.play = function (slot, payload) {
    var self = this, def = SLOTS[slot];
    if (!def) return Promise.resolve({ slot: slot, skipped: 'unknown slot' });
    var entry = { slot: slot, scene: !!this.scenes[slot], seed: payload && payload.seed ? payload.seed.seed_id : null, day: payload && payload.character ? payload.character.day : null };
    this.log.push(entry); if (this.log.length > 300) this.log.shift();
    var scene = this.scenes[slot];
    if (!scene) { var txt = ''; try { txt = def.describe(payload || {}); } catch (e) { txt = ''; } this.card(def.title, txt); return Promise.resolve({ slot: slot, stub: true }); }
    try {
      var api = { card: function (t, b, ms) { self.card(t, b, ms); }, overlay: this.doc && this.doc.getElementById('cineOverlay'), slot: slot };
      return Promise.resolve(scene(payload, api)).then(function () { return { slot: slot, scene: true }; }, function (e) { return { slot: slot, error: String(e) }; });
    } catch (e) { return Promise.resolve({ slot: slot, error: String(e) }); }
  };
  var api = { Director: Director, SLOTS: SLOTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    g.TCZ = g.TCZ || {}; g.TCZ.cinematics = api; g.TCZ.cinema = new Director();
    // Scene loader: cinematics/scenes/manifest.js lists scene files (file:// cannot list folders). Missing files keep the stub.
    var list = g.TCZ_SCENES || [];
    list.forEach(function (f) { var s = document.createElement('script'); s.src = 'cinematics/scenes/' + f; s.onerror = function () { if (g.console) console.warn('cinematic scene missing, using stub:', f); }; document.head.appendChild(s); });
  }
})(this);
