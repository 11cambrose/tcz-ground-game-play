/* EXAMPLE scene (not loaded by default; add 'example-gate-open.js' to manifest.js to try it).
   Shows how a real scene replaces the stub card for one slot. Return a Promise to make the director wait. */
TCZ.cinema.register('gateOpen', function (payload, api) {
  return new Promise(function (done) {
    var o = api.overlay; if (!o) return done();
    o.innerHTML = '<div class="cine-full">THE GATE OPENS</div>'; o.hidden = false;
    setTimeout(function () { o.hidden = true; o.innerHTML = ''; done(); }, 1500);
  });
});
