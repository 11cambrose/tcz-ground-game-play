/* MapProvider: the swappable world layer. Anything that implements this interface can drive the game
   (OSM tiles today; the voxel GIS world later). Interface:
     id, name, attribution, width, height, tileMeters
     tile(x,y) -> code            codeName(code) -> string
     walkable(x,y) -> bool        block(x,y,code)  (runtime overlays such as fences)
     pois() -> [{id,name,kind,x,y}]   labels() -> [{name,x,y}]
     toTile(lon,lat) -> {x,y}     reachable(x,y) -> Uint8Array mask of tiles reachable on foot */
(function (g) {
  'use strict';
  function decodeB64(s) {
    if (typeof Buffer !== 'undefined' && typeof atob === 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
    var bin = atob(s), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a;
  }
  function OsmTileProvider(world) {
    this.world = world; this.id = world.id; this.name = world.name; this.attribution = world.attribution;
    this.width = world.w; this.height = world.h; this.tileMeters = world.tileMeters;
    this.tiles = decodeB64(world.tiles_b64);
    this._blocked = {}; var self = this; world.blocked.forEach(function (c) { self._blocked[c] = true; });
    var lat0 = (world.bbox[1] + world.bbox[3]) / 2; this._mx = 111320 * Math.cos(lat0 * Math.PI / 180); this._my = 110574;
  }
  OsmTileProvider.prototype = {
    inBounds: function (x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; },
    tile: function (x, y) { return this.inBounds(x, y) ? this.tiles[y * this.width + x] : 11; },
    codeName: function (c) { return this.world.codes[c]; },
    walkable: function (x, y) { return this.inBounds(x, y) && !this._blocked[this.tiles[y * this.width + x]]; },
    block: function (x, y, code) { if (this.inBounds(x, y)) this.tiles[y * this.width + x] = code; },
    pois: function () { return this.world.pois; },
    labels: function () { return this.world.labels; },
    toTile: function (lon, lat) { var b = this.world.bbox; return { x: Math.floor((lon - b[0]) * this._mx / this.tileMeters), y: Math.floor((b[3] - lat) * this._my / this.tileMeters) }; },
    reachable: function (sx, sy, extraBlocked) {
      var W = this.width, H = this.height, m = new Uint8Array(W * H), q = new Int32Array(W * H), h = 0, t = 0;
      if (!this.walkable(sx, sy)) return m;
      m[sy * W + sx] = 1; q[t++] = sy * W + sx;
      while (h < t) {
        var i = q[h++], x = i % W, y = (i / W) | 0, n = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (var k = 0; k < 4; k++) {
          var nx = x + n[k][0], ny = y + n[k][1], j = ny * W + nx;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || m[j] || !this.walkable(nx, ny)) continue;
          if (extraBlocked && extraBlocked(nx, ny)) continue;
          m[j] = 1; q[t++] = j;
        }
      }
      return m;
    }
  };
  var api = { OsmTileProvider: OsmTileProvider, decodeB64: decodeB64 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { g.TCZ = g.TCZ || {}; g.TCZ.map = api; }
})(this);
