/*
 * Green falling-glyph rain, drawn to an offscreen canvas. glass.js shows it
 * only through the hole in the screen.
 *
 * The rain also forms the small kyle/ label above the menu (menu.js). Give
 * it the label's cells with setTargets(): each letter appears when a stream
 * runs through its cell (onLock), and the rain isn't drawn on the label's
 * line, so it reads cleanly. summon() sends a stream down a column so the
 * letters form quickly. The big menu words (codeword.js) stand in front of
 * the rain, which simply falls behind them.
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
    this.cells = null;    // label letter cells, by key
    this.quiet = null;    // cells the rain isn't drawn on
    this.onLock = null;
  }

  function key(col, row) { return row * 4096 + col; }

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
    this.cells = null; this.quiet = null;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    // Run it for a while so the rain is already in full flow when first seen.
    for (let i = 0; i < 160; i++) this.step();
  };

  // targets: [{ col, row, left, right, locked }]. left and right are the
  // columns of the first and last letter of the line it belongs to.
  Matrix.prototype.setTargets = function (targets) {
    const cells = new Map(), quiet = new Set(), span = new Map();
    const ctx = this.ctx, s = this.size;
    ctx.fillStyle = '#000';
    targets.forEach(function (t) {
      cells.set(key(t.col, t.row), t);
      const q = span.get(t.row) || { a: Infinity, b: -Infinity };
      q.a = Math.min(q.a, t.left); q.b = Math.max(q.b, t.right);
      span.set(t.row, q);
    });
    // The rain still falls through, but isn't drawn on the label's line.
    span.forEach(function (q, row) {
      for (let c = q.a - 1; c <= q.b + 1; c++) {
        quiet.add(key(c, row));
        ctx.fillRect(c * s, row * s, s, s);
      }
    });
    this.cells = cells;
    this.quiet = quiet;
  };

  Matrix.prototype.hushed = function (col, row) {
    return this.quiet ? this.quiet.has(key(col, row)) : false;
  };

  // Send a stream down this column so it reaches `row` soon.
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
    if (c.row < 0 || this.hushed(i, c.row)) return;
    const ctx = this.ctx, s = this.size, x = i * s;
    ctx.fillStyle = '#000';
    ctx.fillRect(x, c.row * s, s, s);
    ctx.fillStyle = '#1fd16a';
    ctx.fillText(c.ch, x, c.row * s);
  };

  // A stream moves down, forming any label letters it runs through.
  Matrix.prototype.fall = function (i, c) {
    const prev = c.row;
    c.y += c.speed;
    const row = Math.floor(c.y);
    if (row === c.row) return;
    this.settle(i, c);
    if (this.cells) {
      for (let r = Math.max(prev + 1, 0); r <= row; r++) {
        const t = this.cells.get(key(i, r));
        if (t && !t.locked) { t.locked = true; if (this.onLock) this.onLock(t); }
      }
    }
    c.row = row;
    c.ch = pick();
    if (row >= 0 && !this.hushed(i, row)) {
      const ctx = this.ctx, s = this.size;
      ctx.fillStyle = '#dcffe6';
      ctx.fillText(c.ch, i * s, row * s);
    }
  };

  Matrix.prototype.step = function () {
    const ctx = this.ctx, s = this.size, rows = this.h / s;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.font = s + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    for (let i = 0; i < this.cols.length; i++) {
      const c = this.cols[i];
      this.fall(i, c);
      if (c.row > rows && Math.random() > 0.96) {
        c.y = -Math.random() * 8; c.row = -1; c.speed = 0.45 + Math.random() * 0.75;
      }
    }
    this.fillLane();
  };

  // A clear column for a section's content: the rain parts around it. The
  // streams along its edges run heavier, as if pushed aside. Pass null to
  // let the rain back in.
  Matrix.prototype.setLane = function (x0, x1) {
    if (x0 == null) { this.lane = null; return; }
    const first = !this.lane;
    this.lane = { x0: x0, x1: x1 };
    if (first && this.cols) {
      const s = this.size, a = Math.floor(x0 / s) - 1, b = Math.ceil(x1 / s);
      [a, a - 1, b, b + 1].forEach(function (i) {
        const c = this.cols[i];
        if (c) c.speed = 1.2 + Math.random() * 0.3;
      }, this);
    }
    this.fillLane();
  };

  Matrix.prototype.fillLane = function () {
    if (!this.lane) return;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(this.lane.x0, 0, this.lane.x1 - this.lane.x0, this.h);
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
