/* Registry keying: every challenger is a row of character-registry.csv, keyed by calendar day + side.
   L0n-Vk -> day 28(n-1)+k villain; L0n-Mk -> day 28(n-1)+21+k master. Status locked|draft|cut drives display. */
(function (g) {
  'use strict';
  var node = typeof module !== 'undefined' && module.exports;
  function dayForSeed(seedId) {
    var m = /^L(\d{2})-(V|M)(\d{2})$/.exec(seedId); if (!m) return null;
    var n = +m[1], k = +m[3], base = 28 * (n - 1);
    if (m[2] === 'V' && k >= 1 && k <= 21) return { day: base + k, side: 'villain' };
    if (m[2] === 'M' && k >= 1 && k <= 7) return { day: base + 21 + k, side: 'master' };
    return null;
  }
  function characterFor(C, seedId) {
    var key = dayForSeed(seedId); if (!key) return null;
    var row = C.rows[key.day - 1]; if (!row || row.day !== key.day) return null;
    var name = key.side === 'villain' ? row.villain : row.master;
    var status = row.status, isLocked = status === 'locked';
    var portraitId = 'day-' + ('00' + key.day).slice(-3) + '-' + key.side;
    return {
      id: portraitId, day: key.day, side: key.side, status: status, locked: isLocked,
      name: status === 'cut' ? null : name,                         // registry name, never invented
      displayName: status === 'cut' ? 'Unnamed (cut row)' : isLocked ? name : name + ' (draft)',
      theme: row.theme, line: key.side === 'villain' ? row.villain_line : null,
      portraitId: portraitId, portraitPath: 'assets/portraits/' + portraitId + '.png',
      hasPortrait: C.portraits.indexOf(portraitId) >= 0, row: row
    };
  }
  var api = { dayForSeed: dayForSeed, characterFor: characterFor };
  if (node) module.exports = api; else { g.TCZ.chars = api; }
})(this);
