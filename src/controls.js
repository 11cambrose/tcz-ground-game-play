/* V2.2 on-screen controls, fullscreen toggle and iframe auto-height. Replicates WASD/E by dispatching the same
   keyboard events the game already handles, so there is one input path. Pointer events: press-and-hold, released on
   pointerup/leave/cancel/lostpointercapture and window blur (no stuck keys). */
(function () {
  var doc = document, root = doc.documentElement;
  function key(type, code) { doc.dispatchEvent(new KeyboardEvent(type, { code: code, key: code, bubbles: true, cancelable: true })); }
  var active = {};
  function release(id) { var c = active[id]; if (c) { delete active[id]; key('keyup', c); } }
  function releaseAll() { Object.keys(active).forEach(release); }
  function bind(btn) {
    var code = btn.getAttribute('data-key');
    // iOS Safari: drive touch through touchstart/touchend (preventDefault stops selection, callout and page gestures);
    // pointer events then handle mouse and pen only, so a touch never double-fires.
    function tdown(e) {
      e.preventDefault();
      if (code === 'KeyE') { key('keydown', code); key('keyup', code); return; }
      Array.prototype.forEach.call(e.changedTouches, function (t) { var id = 't' + t.identifier; release(id); active[id] = code; });
      btn.classList.add('on'); key('keydown', code);
    }
    function tup(e) {
      e.preventDefault();
      Array.prototype.forEach.call(e.changedTouches, function (t) { var id = 't' + t.identifier; if (active[id] === code) release(id); });
      btn.classList.remove('on');
    }
    btn.addEventListener('touchstart', tdown, { passive: false });
    btn.addEventListener('touchend', tup, { passive: false }); btn.addEventListener('touchcancel', tup, { passive: false });
    btn.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch (x) {}
      if (code === 'KeyE') { key('keydown', code); key('keyup', code); return; }
      release(e.pointerId); active[e.pointerId] = code; btn.classList.add('on'); key('keydown', code);
    });
    ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'].forEach(function (t) {
      btn.addEventListener(t, function (e) { if (active[e.pointerId] === code) { btn.classList.remove('on'); release(e.pointerId); } });
    });
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  var pad = doc.getElementById('pad'); Array.prototype.forEach.call(pad.querySelectorAll('[data-key]'), bind);
  window.addEventListener('blur', releaseAll); doc.addEventListener('visibilitychange', releaseAll);
  // show automatically on touch devices; toggle persists (UI pref only, separate from the game save)
  var touch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  var pref = null; try { pref = localStorage.getItem('tcz-ui-pad'); } catch (x) {}
  function setPad(on) { pad.hidden = !on; root.classList.toggle('pad-on', on); try { localStorage.setItem('tcz-ui-pad', on ? '1' : '0'); } catch (x) {} if (!on) releaseAll(); post(); }
  pad.hidden = !(pref === null ? touch : pref === '1'); root.classList.toggle('pad-on', !pad.hidden);
  doc.getElementById('padToggle').addEventListener('click', function () { setPad(pad.hidden); });
  // fullscreen (standard + webkit fallback; hidden if unsupported, e.g. iframe without allowfullscreen)
  var fsBtn = doc.getElementById('fsToggle');
  var can = doc.fullscreenEnabled || doc.webkitFullscreenEnabled;
  if (!can) fsBtn.hidden = true;
  fsBtn.addEventListener('click', function () {
    var cur = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (cur) (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
    else (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
  });
  // auto-height for an embedding page
  var last = 0;
  function post() {
    if (window.parent === window) return;
    var m = doc.getElementById('modal'), n = Math.ceil(Math.max(doc.getElementById('app').scrollHeight, m && !m.hidden ? doc.getElementById('duel').scrollHeight + 24 : 0));
    if (n !== last) { last = n; window.parent.postMessage({ tczHeight: n }, '*'); }
  }
  window.TCZpostHeight = post;
  window.addEventListener('load', post); window.addEventListener('resize', post);
  if (window.ResizeObserver) { var ro = new ResizeObserver(post); ro.observe(doc.getElementById('app')); ro.observe(doc.getElementById('duel')); }
  new MutationObserver(post).observe(doc.getElementById('modal'), { attributes: true, attributeFilter: ['hidden'] });
  window.__tczControls = { releaseAll: releaseAll, active: active, post: post, isTouch: touch };
})();
/* V2.2.2: keep the zoom buttons in the map's bottom-left corner (clear of the journal HUD and minimap) */
(function () {
  var z = document.getElementById('zoomBtns'), m = document.getElementById('map'); if (!z || !m) return;
  function place() { z.style.top = Math.max(0, m.offsetTop + m.offsetHeight - 32) + 'px'; z.style.left = (m.offsetLeft + 6) + 'px'; }
  place(); window.addEventListener('resize', place); window.addEventListener('load', place);
  if (window.ResizeObserver) new ResizeObserver(place).observe(m);
})();
