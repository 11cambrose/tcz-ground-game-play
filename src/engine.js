/* Small original alpha-beta opponent on top of chess.js. Light enough for a 2015 MacBook Air. */
(function (g) {
  'use strict';
  var node = typeof module !== 'undefined' && module.exports;
  var R = node ? require('./rules.js') : g.TCZ.rules;
  var VAL = { p: 100, n: 310, b: 325, r: 500, q: 900, k: 0 };
  // Tiny centralisation bonus (centre squares) + pawn advance; mirrored for black.
  function sqBonus(type, file, rank, color) {
    var rr = color === 'w' ? rank : 7 - rank; // 0 = own back rank
    var cf = 3.5 - Math.abs(file - 3.5), cr = 3.5 - Math.abs(rr - 3.5);
    if (type === 'p') return rr * 8 + (cf > 2 ? 6 : 0);
    if (type === 'n' || type === 'b') return (cf + cr) * 4;
    if (type === 'k') return 0;
    return cf * 2;
  }
  function evaluate(chess) { // from side-to-move perspective
    var b = chess.board(), s = 0;
    for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
      var p = b[r][f]; if (!p) continue;
      var v = VAL[p.type] + sqBonus(p.type, f, 7 - r, p.color);
      s += p.color === 'w' ? v : -v;
    }
    return chess.turn() === 'w' ? s : -s;
  }
  function order(moves) {
    return moves.sort(function (a, b) {
      var sa = (a.captured ? 10 * VAL[a.captured] - VAL[a.piece] : 0) + (a.promotion ? 800 : 0);
      var sb = (b.captured ? 10 * VAL[b.captured] - VAL[b.piece] : 0) + (b.promotion ? 800 : 0);
      return sb - sa;
    });
  }
  var MATE = 100000;
  function search(chess, depth, alpha, beta, ctx, ply) {
    ctx.nodes++;
    if (chess.in_checkmate()) return -MATE + ply;
    if (chess.in_draw() || chess.in_stalemate() || chess.in_threefold_repetition()) return 0;
    if (depth === 0 || ctx.nodes > ctx.maxNodes) return evaluate(chess);
    var moves = order(chess.moves({ verbose: true }));
    for (var i = 0; i < moves.length; i++) {
      chess.move(moves[i]);
      var sc = -search(chess, depth - 1, -beta, -alpha, ctx, ply + 1);
      chess.undo();
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }
  // bot_training (seed desk) -> strength. "poor" blunders on purpose (seeded, so replays are deterministic).
  var PROFILES = { poor: { depth: 1, noise: 0.35, maxNodes: 1500 }, club: { depth: 2, noise: 0.1, maxNodes: 4000 },
                   well: { depth: 2, noise: 0, maxNodes: 6000 }, 'house-best': { depth: 3, noise: 0, maxNodes: 5000 } };
  /** Pick a move (verbose object) for the side to move. rngKey makes "poor" noise deterministic. */
  function pickMove(chess, training, rngKey) {
    var prof = PROFILES[training] || PROFILES.poor;
    var moves = order(chess.moves({ verbose: true }));
    if (!moves.length) return null;
    var rnd = R.mulberry32(R.fnv1a(String(rngKey || '') + '|' + chess.fen()));
    if (prof.noise && rnd() < prof.noise) return moves[Math.floor(rnd() * moves.length)];
    var best = moves[0], bestSc = -Infinity, ctx = { nodes: 0, maxNodes: prof.maxNodes };
    for (var i = 0; i < moves.length; i++) {
      chess.move(moves[i]);
      var sc = -search(chess, prof.depth - 1, -Infinity, Infinity, ctx, 1);
      chess.undo();
      if (sc > bestSc) { bestSc = sc; best = moves[i]; }
    }
    return best;
  }
  var api = { pickMove: pickMove, evaluate: evaluate, PROFILES: PROFILES };
  if (node) module.exports = api; else { g.TCZ.engine = api; }
})(this);
