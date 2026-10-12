/* Cinematic hook: a tiny event bus. Events: onChallengeStart, onSwing, onEnd, onMate.
   Payload always carries { seed, character } where character is the keyed registry row (see characters.js). */
(function (g) {
  'use strict';
  function Bus() { this.h = {}; this.history = []; }
  Bus.prototype.on = function (ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); return fn; };
  Bus.prototype.off = function (ev, fn) { this.h[ev] = (this.h[ev] || []).filter(function (f) { return f !== fn; }); };
  Bus.prototype.emit = function (ev, payload) {
    this.history.push({ ev: ev, seed: payload && payload.seed && payload.seed.seed_id }); if (this.history.length > 200) this.history.shift();
    (this.h[ev] || []).slice().forEach(function (f) { try { f(payload); } catch (e) { if (typeof console !== 'undefined') console.warn('event handler failed', ev, e); } });
  };
  var api = { Bus: Bus, EVENTS: ['onChallengeStart', 'onSwing', 'onEnd', 'onMate'] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { g.TCZ.events = api; g.TCZ.bus = new Bus(); }
})(this);
