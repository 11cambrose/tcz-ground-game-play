/* Data hook for ONE real published post / position / game (schema: docs/published.schema.json). chesszone.db comes later. */
(function (g) {
  'use strict';
  var node = typeof module !== 'undefined' && module.exports;
  var ChessCtor = node ? require('../vendor/chess.js').Chess : g.Chess;
  function validate(o) {
    var e = [];
    if (!o || typeof o !== 'object') return { ok: false, errors: ['not an object'] };
    if (o.schema !== 'tcz.published.v1') e.push('schema must be tcz.published.v1');
    ['id', 'title', 'published_at', 'bind_to'].forEach(function (k) { if (typeof o[k] !== 'string' || !o[k]) e.push(k + ' required'); });
    if (['post', 'position', 'game'].indexOf(o.type) < 0) e.push('type must be post|position|game');
    if (o.published_at && !/^\d{4}-\d{2}-\d{2}/.test(o.published_at)) e.push('published_at must start YYYY-MM-DD');
    if (o.bind_to && !/^L\d{2}-(V|M)\d{2}$/.test(o.bind_to)) e.push('bind_to must look like L01-M07');
    var fen = null;
    if (o.type === 'position' || (o.type === 'post' && o.fen)) {
      var c = new ChessCtor(); if (!o.fen || !c.load(o.fen)) e.push('valid fen required'); else fen = c.fen();
    }
    if (o.type === 'game') {
      var c2 = new ChessCtor(); if (!o.pgn || !c2.load_pgn(o.pgn)) e.push('valid pgn required'); else if (c2.game_over()) e.push('game is already over; bind a playable position'); else fen = c2.fen();
    }
    return { ok: e.length === 0, errors: e, startFen: fen };
  }
  /** Returns {bind_to, startFen, item} or null. */
  function loadPublished(o) { if (o == null) return null; var v = validate(o); if (!v.ok) return { error: v.errors }; return { bind_to: o.bind_to, startFen: v.startFen, item: o }; }
  var api = { validate: validate, loadPublished: loadPublished };
  if (node) module.exports = api; else { g.TCZ.published = api; }
})(this);
