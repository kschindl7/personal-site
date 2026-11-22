/*
 * KyleGPT: a chat page that cracks after 10 typed characters, then breaks
 * open on its own until the Matrix rain fills the screen.
 *
 * Tuning lives in CONFIG. Add ?progress=0.5 (0 to 1) to the URL to jump
 * straight to a point in the break, which helps when iterating on the look.
 */
(function () {
  'use strict';

  const CONFIG = {
    crackAt: 10,        // characters typed before the first crack
    holdMs: 1100,       // the small crack sits still this long
    breakMs: 2600,      // time from the first crack until the glass gives way
    fullMs: 9000,       // time from the first crack until the screen is gone
    typeBoost: 0.006    // extra typing nudges the break along a little
  };

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = function (id) { return document.getElementById(id); };
  const app = $('app');
  const input = $('prompt');
  const send = $('send');
  const form = $('composer-wrap');
  const resetBtn = $('reset');

  const matrix = new Matrix(reduced);
  const glass = new Glass({
    crack: $('glass-crack'),
    hole: $('glass-hole'),
    matrix: matrix,
    reduced: reduced,
    onBreak: function () { jolt(); },
    onShattered: function () {
      document.body.classList.add('shattered');
      input.blur();
      setTimeout(function () { resetBtn.hidden = false; }, 1400);
    }
  });

  let typed = 0;          // characters typed in total; deleting does not undo damage
  let lastLen = 0;
  let crackedAt = 0;      // time of the first crack, 0 until then
  let extra = 0;          // characters typed after the crack
  let startProgress = 0;  // for ?progress=

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    glass.resize(window.innerWidth, window.innerHeight, dpr);
    // Impact point: horizontally centered on the chat column, just above the input box.
    const r = form.getBoundingClientRect();
    glass.setCenter(r.left + r.width / 2, r.top - 30);
  }

  function jolt() {
    if (reduced) return;
    app.classList.remove('jolt');
    void app.offsetWidth;
    app.classList.add('jolt');
  }

  function crack(now) {
    if (crackedAt) return;
    crackedAt = now;
    jolt();
  }

  // Progress follows the clock once the crack appears: a short pause, then
  // the break, then the hole widens until nothing is left.
  function progressAt(now) {
    const t = now - crackedAt;
    let p;
    if (t < CONFIG.holdMs) p = 0.05 * t / CONFIG.holdMs;
    else if (t < CONFIG.breakMs) p = 0.05 + (t - CONFIG.holdMs) / (CONFIG.breakMs - CONFIG.holdMs) * (Glass.BREAK_AT - 0.05);
    else p = Glass.BREAK_AT + (t - CONFIG.breakMs) / (CONFIG.fullMs - CONFIG.breakMs) * (1 - Glass.BREAK_AT);
    return Math.min(1, Math.max(p, startProgress) + extra * CONFIG.typeBoost);
  }

  function loop(now) {
    if (crackedAt) glass.setProgress(progressAt(now), now);
    glass.frame(now);
    requestAnimationFrame(loop);
  }

  function onInput() {
    const len = input.value.length;
    const added = Math.max(0, len - lastLen);
    lastLen = len;
    typed += added;
    if (crackedAt) extra += added;
    if (typed >= CONFIG.crackAt) crack(performance.now());
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

  // There is no answer yet: sending just makes sure the glass cracks.
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!input.value.trim()) return;
    crack(performance.now());
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

  $('new-chat').addEventListener('click', function () { input.focus(); });
  resetBtn.addEventListener('click', function () { location.href = location.pathname; });

  window.addEventListener('resize', size);
  size();

  const q = parseFloat(new URLSearchParams(location.search).get('progress'));
  if (q >= 0) { startProgress = Math.min(q, 1); crack(performance.now()); }

  requestAnimationFrame(loop);
  input.focus({ preventScroll: true });
})();
