/* Viewport camera: follows a target, clamped to the world bounds (in tiles). */
(function (g) {
  'use strict';
  function Camera(viewW, viewH, worldW, worldH) { this.vw = viewW; this.vh = viewH; this.ww = worldW; this.wh = worldH; this.x = 0; this.y = 0; }
  Camera.prototype.follow = function (tx, ty) {
    this.x = Math.max(0, Math.min(this.ww - this.vw, tx - Math.floor(this.vw / 2)));
    this.y = Math.max(0, Math.min(this.wh - this.vh, ty - Math.floor(this.vh / 2)));
    if (this.ww < this.vw) this.x = 0; if (this.wh < this.vh) this.y = 0;
    return this;
  };
  Camera.prototype.visible = function (tx, ty) { return tx >= this.x && ty >= this.y && tx < this.x + this.vw && ty < this.y + this.vh; };
  var api = { Camera: Camera };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { g.TCZ.camera = api; }
})(this);
