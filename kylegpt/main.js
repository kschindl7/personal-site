/*
 * KyleGPT: a chat page whose glass cracks after 5 typed characters and
 * shatters after 10, until the Matrix rain fills the screen.
 *
 * Tuning lives in CONFIG. URL options for iterating on the look:
 *   ?progress=0      the long crack, fully formed
 *   ?progress=0.4    jump that far (0 to 1) into the shatter
 *   ?seed=123        the same fracture every time
 *   ?view=menu       skip straight to the menu that forms in the rain
 */
(function () {
  'use strict';

  const CONFIG = {
    crackAt: 5,        // characters typed before the long crack
    shatterAt: 10,     // characters typed before the glass shatters
    minGapMs: 700,     // the long crack is always on screen at least this long first
    typeBoostMs: 50    // each character typed during the shatter hurries it along
  };

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);
  const $ = function (id) { return document.getElementById(id); };
  const app = $('app');
  const input = $('prompt');
  const send = $('send');
  const form = $('composer-wrap');
  const resetBtn = $('reset');

  // Falling shards are painted in the color of the page they came from.
  function rgb(v) {
    const m = v.trim().match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [33, 33, 33];
  }
  const css = getComputedStyle(document.documentElement);
  const bgColor = rgb(css.getPropertyValue('--bg'));

  const matrix = new Matrix(reduced);
  const glass = new Glass({
    crack: $('glass-crack'),
    hole: $('glass-hole'),
    shards: $('glass-shards'),
    matrix: matrix,
    reduced: reduced,
    seed: parseInt(params.get('seed'), 10) || 0,
    colorAt: function () { return bgColor; },
    onCrack: function () { jolt('small'); },
    onShatter: function () { jolt(); },
    onHalf: function () { dropBar(); },
    onShattered: function () {
      document.body.classList.add('shattered');
      input.blur();
      // Let the rain run on its own for a moment, then the menu forms out of it.
      setTimeout(function () { menu.start(); }, reduced ? 0 : 700);
      setTimeout(function () { resetBtn.hidden = false; }, 1400);
    }
  });

  const menu = new Menu({
    matrix: matrix,
    nav: $('rain-menu'),
    page: $('rain-page'),
    reduced: reduced
  });

  let typed = 0;          // characters typed in total; deleting does not undo damage
  let lastLen = 0;
  let crackedAt = 0;
  let shatterTimer = 0;

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    glass.resize(window.innerWidth, window.innerHeight, dpr);
    menu.resize();
    // The impact lands just above the input box, around the middle of it.
    const r = form.getBoundingClientRect();
    glass.setFocus(r.left + r.width / 2, r.top - 30, r.width);
  }

  function jolt(kind) {
    if (reduced) return;
    app.classList.remove('jolt', 'jolt-small');
    void app.offsetWidth;
    app.classList.add(kind === 'small' ? 'jolt-small' : 'jolt');
  }

  function crack(now) {
    if (crackedAt) return;
    crackedAt = now;
    glass.crack(now);
  }

  function shatter(now) {
    crack(now);
    if (shatterTimer) return;
    const wait = Math.max(0, crackedAt + CONFIG.minGapMs - now);
    shatterTimer = setTimeout(function () { glass.shatter(performance.now()); }, wait);
  }

  // The input bar loses its support once half the glass is going. One end is
  // heavier, so it swings down around the other end, then slips off and
  // falls. It is treated as one rigid bar throughout: when it slips it keeps
  // exactly the speed and spin it had, then gravity speeds it up.
  let barDropping = false;
  function dropBar() {
    if (barDropping) return;
    barDropping = true;
    input.blur();
    form.classList.add('falling');
    if (reduced) { setTimeout(function () { form.classList.add('gone'); }, 450); return; }

    const rect = form.getBoundingClientRect();
    const len = Math.max(200, rect.width);
    const heavyLeft = Math.random() < 0.5;
    const dir = heavyLeft ? -1 : 1;              // rotation sign that lowers the heavy end
    const arm = heavyLeft ? -len / 2 : len / 2;  // middle of the bar, measured from the pivot
    const g = 2400;                              // px/s², same as the glass shards
    const friction = 0.6 + Math.random() * 0.3;  // the pivot drags a little
    const slipAt = 0.28 + Math.random() * 0.22;  // radians of swing before it slips
    const sagMs = 180 + Math.random() * 160, sag = 0.02 + Math.random() * 0.02;

    // Everything is tracked for the middle of the bar, relative to where it started.
    form.style.transformOrigin = '50% 50%';
    let phi = 0, omega = 0;                      // swing angle and speed (rad, rad/s)
    let cx = 0, cy = 0, vx = 0, vy = 0;          // middle, once it is free
    let free = false, last = 0;
    const start = performance.now();

    function place() {
      if (free) return { x: cx, y: cy };
      // Still on the pivot: the middle moves on a circle around it.
      const a = dir * phi;
      return { x: arm * Math.cos(a) - arm, y: arm * Math.sin(a) };
    }

    (function step(now) {
      let dt = last ? Math.min(now - last, 50) / 1000 : 0;
      last = now;
      const held = now - start;
      if (held < sagMs) {
        const u = held / sagMs;
        phi = sag * u * u * (3 - 2 * u);
        omega = 0;
      } else {
        // Small fixed steps keep the motion smooth whatever the frame rate.
        while (dt > 0) {
          const h = Math.min(dt, 1 / 120);
          dt -= h;
          if (!free) {
            // Bar pivoting on one end: angular acceleration 3g cos(phi) / 2L.
            omega += friction * 1.5 * g / len * Math.cos(phi) * h;
            phi += omega * h;
            if (phi >= slipAt) {
              // Slip: the middle keeps the velocity it had on the circle.
              const p = place(), a = dir * phi, w = dir * omega;
              cx = p.x; cy = p.y;
              vx = -arm * Math.sin(a) * w;
              vy = arm * Math.cos(a) * w;
              free = true;
            }
          } else {
            cx += vx * h;
            cy += vy * h + 0.5 * g * h * h;
            vy += g * h;
            phi += omega * h;                     // no torque once it is free
          }
        }
      }
      const p = place();
      form.style.transform = 'translate(' + p.x.toFixed(2) + 'px,' + p.y.toFixed(2) + 'px) rotate(' + (dir * phi).toFixed(4) + 'rad)';
      if (rect.top + p.y - len / 2 < window.innerHeight + 40) requestAnimationFrame(step);
      else form.classList.add('gone');
    })(start);
  }

  function loop(now) {
    glass.frame(now);
    requestAnimationFrame(loop);
  }

  function onInput() {
    const len = input.value.length;
    const added = Math.max(0, len - lastLen);
    lastLen = len;
    typed += added;
    if (shatterTimer) glass.boost(added * CONFIG.typeBoostMs);
    if (typed >= CONFIG.shatterAt) shatter(performance.now());
    else if (typed >= CONFIG.crackAt) crack(performance.now());
    send.disabled = !input.value.trim();
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  }

  input.addEventListener('input', onInput);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  // There is no answer yet: sending a question breaks the glass.
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!input.value.trim()) return;
    shatter(performance.now());
  });

  // Suggestion chips type themselves into the box, one character at a time.
  let typing = false;
  document.querySelectorAll('.chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      if (typing) return;
      typing = true;
      const text = chip.textContent;
      input.value = '';
      lastLen = 0;
      onInput();
      input.focus();
      let i = 0;
      (function next() {
        if (i >= text.length) { typing = false; return; }
        input.value += text[i++];
        onInput();
        setTimeout(next, reduced ? 0 : 45);
      })();
    });
  });

  resetBtn.addEventListener('click', function () { location.href = location.pathname; });

  window.addEventListener('resize', size);
  size();

  // ?view=menu skips straight to the menu, for working on it.
  // A link straight to a section (#work) skips the intro too.
  const toSection = /^#[a-z]+$/.test(location.hash) && document.querySelector('.rain-menu a[data-section="' + location.hash.slice(1) + '"]');
  const q = params.get('view') === 'menu' || toSection ? 1 : parseFloat(params.get('progress'));
  if (q >= 0) {
    const now = performance.now();
    crackedAt = now - 5000;
    glass.crack(crackedAt);
    if (q > 0) { shatterTimer = -1; glass.shatter(now - Math.min(q, 1) * Glass.TOTAL_MS); }
  } else {
    // Work out the fracture while the visitor reads, so the first crack is instant.
    (window.requestIdleCallback || function (f) { return setTimeout(f, 300); })(function () { glass.prepare(); });
  }

  requestAnimationFrame(loop);
  input.focus({ preventScroll: true });
})();
