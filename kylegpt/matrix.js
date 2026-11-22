/*
 * Green falling-glyph rain, drawn to an offscreen canvas. glass.js shows it
 * only through the hole in the screen.
 */
(function () {
  'use strict';

  const GLYPHS = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789KYLE:=*+<>';
  const STEP_MS = 50;

  function pick() { return GLYPHS[(Math.random() * GLYPHS.length) | 0]; }

  function Matrix(reduced) {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.reduced = reduced;
    this.last = 0;
    this.acc = 0;
  }

  Matrix.prototype.resize = function (w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.size = w < 600 ? 14 : 16;
    const cols = Math.ceil(w / this.size);
    const rows = Math.ceil(h / this.size);
    this.cols = [];
    for (let i = 0; i < cols; i++) {
      this.cols.push({ y: -Math.random() * rows, speed: 0.45 + Math.random() * 0.75, row: -1, ch: '' });
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    // Run it for a while so the rain is already in full flow when first seen.
    for (let i = 0; i < 160; i++) this.step();
  };

  Matrix.prototype.step = function () {
    const ctx = this.ctx, s = this.size, rows = this.h / s;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.font = s + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    for (let i = 0; i < this.cols.length; i++) {
      const c = this.cols[i];
      c.y += c.speed;
      const row = Math.floor(c.y);
      if (row === c.row) continue;
      const x = i * s;
      if (c.row >= 0) {
        // The old head settles into the trail.
        ctx.fillStyle = '#000';
        ctx.fillRect(x, c.row * s, s, s);
        ctx.fillStyle = '#1fd16a';
        ctx.fillText(c.ch, x, c.row * s);
      }
      c.row = row;
      c.ch = pick();
      if (row >= 0) {
        ctx.fillStyle = '#dcffe6';
        ctx.fillText(c.ch, x, row * s);
      }
      if (row > rows && Math.random() > 0.96) {
        c.y = -Math.random() * 8; c.row = -1; c.speed = 0.45 + Math.random() * 0.75;
      }
    }
  };

  Matrix.prototype.update = function (now) {
    if (this.reduced) return; // Reduced motion: a still frame of the rain.
    if (!this.last) this.last = now;
    this.acc += Math.min(now - this.last, 200);
    this.last = now;
    let n = 0;
    while (this.acc >= STEP_MS && n < 3) { this.step(); this.acc -= STEP_MS; n++; }
    if (n === 3) this.acc = 0;
  };

  window.Matrix = Matrix;
})();
