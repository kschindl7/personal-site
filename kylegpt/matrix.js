/*
 * Green falling-glyph rain, drawn to an offscreen canvas. glass.js shows it
 * only through the hole in the screen.
 *
 * The rain can also lock letters in place for the menu (menu.js): give it
 * target cells with setTargets(), and each one locks when a rain head runs
 * through it. summon() sends a head down a column toward a target, so the
 * letters arrive within a second or two instead of whenever the rain gets
 * there. Locked cells stay clear so the menu's own letters sit on black.
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
    this.byCol = null;
    this.onLock = null;
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

  // targets: [{ col, row, locked }]. Locked ones stay clear of rain.
  Matrix.prototype.setTargets = function (targets) {
    const by = new Map();
    targets.forEach(function (t) {
      if (!by.has(t.col)) by.set(t.col, []);
      by.get(t.col).push(t);
    });
    by.forEach(function (list) { list.sort(function (a, b) { return a.row - b.row; }); });
    this.byCol = by;
    const ctx = this.ctx, s = this.size;
    ctx.fillStyle = '#000';
    targets.forEach(function (t) { if (t.locked) ctx.fillRect(t.col * s, t.row * s, s, s); });
  };

  Matrix.prototype.clear = function (col, row) {
    const list = this.byCol && this.byCol.get(col);
    if (!list) return true;
    for (let i = 0; i < list.length; i++) if (list[i].row === row && list[i].locked) return false;
    return true;
  };

  // Send a head down this column so it reaches `row` soon.
  Matrix.prototype.summon = function (col, row) {
    const c = this.cols[col];
    if (!c) return;
    if (c.y < row && c.y > row - 18) return; // one is already on its way
    this.settle(col, c);
    c.y = row - (2 + Math.random() * 16);
    c.row = Math.floor(c.y);
    c.speed = 0.8 + Math.random() * 0.45;
  };

  // The old head turns into an ordinary trail glyph.
  Matrix.prototype.settle = function (i, c) {
    if (c.row < 0 || !this.clear(i, c.row)) return;
    const ctx = this.ctx, s = this.size, x = i * s;
    ctx.fillStyle = '#000';
    ctx.fillRect(x, c.row * s, s, s);
    ctx.fillStyle = '#1fd16a';
    ctx.fillText(c.ch, x, c.row * s);
  };

  Matrix.prototype.step = function () {
    const ctx = this.ctx, s = this.size, rows = this.h / s;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.font = s + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    for (let i = 0; i < this.cols.length; i++) {
      const c = this.cols[i];
      const prev = c.row;
      c.y += c.speed;
      const row = Math.floor(c.y);
      if (row === c.row) continue;
      const x = i * s;
      this.settle(i, c);
      c.row = row;
      c.ch = pick();

      // Lock any menu letters the head just ran through.
      const list = this.byCol && this.byCol.get(i);
      if (list) {
        for (let k = 0; k < list.length; k++) {
          const t = list[k];
          if (t.locked || t.row <= prev || t.row > row) continue;
          t.locked = true;
          ctx.fillStyle = '#000';
          ctx.fillRect(x, t.row * s, s, s);
          if (this.onLock) this.onLock(t);
        }
      }

      if (row >= 0 && this.clear(i, row)) {
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
