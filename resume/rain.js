/*
 * A faint, slow rain behind the résumé, and the print button. The rain
 * stops while the tab is hidden, and is a still frame for visitors who
 * prefer reduced motion.
 */
(function () {
  'use strict';

  const btn = document.querySelector('.print');
  if (btn && window.print) { btn.hidden = false; btn.addEventListener('click', function () { window.print(); }); }

  const cv = document.querySelector('.rain');
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  const GLYPHS = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789:=*+<>';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cols = [], size = 16, w = 0, h = 0, last = 0, acc = 0;

  function pick() { return GLYPHS[(Math.random() * GLYPHS.length) | 0]; }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = window.innerWidth; h = window.innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = w < 600 ? 14 : 16;
    cols = [];
    for (let i = 0; i < Math.ceil(w / size); i++) cols.push({ y: -Math.random() * h / size, v: 0.25 + Math.random() * 0.4 });
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) step();
  }

  function step() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(0, 0, w, h);
    ctx.font = size + 'px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      c.y += c.v;
      ctx.fillStyle = Math.random() < 0.08 ? '#dcffe6' : '#1fd16a';
      ctx.fillText(pick(), i * size, Math.floor(c.y) * size);
      if (c.y * size > h && Math.random() > 0.97) { c.y = -Math.random() * 10; c.v = 0.25 + Math.random() * 0.4; }
    }
  }

  function loop(now) {
    if (!document.hidden) {
      acc += Math.min(now - (last || now), 200);
      while (acc >= 70) { step(); acc -= 70; }
    }
    last = now;
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  resize();
  if (!reduced) requestAnimationFrame(loop);
})();
