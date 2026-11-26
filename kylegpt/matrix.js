/*
 * Green falling-glyph rain, drawn to an offscreen canvas. glass.js shows it
 * only through the hole in the screen.
 *
 * The rain also falls on the menu (menu.js). Give it the letters' cells with
 * setTargets() and the rain treats them as solid:
 *   - a stream that reaches a letter stops on top of it with a splash, and
 *     that first hit is what makes the letter appear (onLock);
 *   - the water pools in a thin line along the tops of the words;
 *   - some of it runs along the top to the nearer end of the word and pours
 *     down the side as a new stream;
 *   - nothing falls straight through, so the space under each word stays dry.
 * summon() sends a stream down a column so the letters form quickly.
 */
(function () {
  'use strict';

  const GLYPHS = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789KYLE:=*+<>';
  const LIQUID = '_.-~=:,_.~';    // what pooled and running water is drawn with
  const STEP_MS = 50;
  const MAX_SPILLS = 160;

  function pick(set) { set = set || GLYPHS; return set[(Math.random() * set.length) | 0]; }

  function Matrix(reduced) {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.reduced = reduced;
    this.last = 0;
    this.acc = 0;
    this.cells = null;    // letter cells, by key
    this.pool = new Map(); // wet cells on top of the words
    this.runs = [];        // water running along the top of a word
    this.spills = [];      // streams pouring off the ends of words
    this.onLock = null;
    this.onHit = null;
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
    this.pool.clear(); this.runs = []; this.spills = [];
    this.cells = null; this.byCol = null; this.quiet = null;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    // Run it for a while so the rain is already in full flow when first seen.
    for (let i = 0; i < 160; i++) this.step();
  };

  // targets: [{ col, row, left, right, locked }]. left and right are the
  // columns of the first and last letter of the word it belongs to.
  Matrix.prototype.setTargets = function (targets) {
    const cells = new Map();
    const ctx = this.ctx, s = this.size;
    ctx.fillStyle = '#000';
    const byCol = new Map();
    targets.forEach(function (t) {
      cells.set(key(t.col, t.row), t);
      if (!byCol.has(t.col)) byCol.set(t.col, []);
      byCol.get(t.col).push(t);
      ctx.fillRect(t.col * s, t.row * s, s, s);
    });
    this.cells = cells;
    this.byCol = byCol;
    // Keep each line of words clean: rain still falls through the gaps
    // between words, but isn't drawn on the line itself.
    const quiet = new Set(), span = new Map();
    targets.forEach(function (t) {
      const q = span.get(t.row) || { a: Infinity, b: -Infinity };
      q.a = Math.min(q.a, t.left); q.b = Math.max(q.b, t.right);
      span.set(t.row, q);
    });
    span.forEach(function (q, row) {
      for (let c = q.a - 1; c <= q.b + 1; c++) {
        if (cells.has(key(c, row))) continue;
        quiet.add(key(c, row));
        ctx.fillRect(c * s, row * s, s, s);
      }
    });
    this.quiet = quiet;
    this.pool.clear(); this.runs = [];
  };

  // Cells the rain shouldn't draw on: pooled water and the lines of words.
  Matrix.prototype.hushed = function (col, row) {
    const k = key(col, row);
    return this.pool.has(k) || (this.quiet ? this.quiet.has(k) : false);
  };

  Matrix.prototype.solid = function (col, row) {
    return this.cells ? this.cells.get(key(col, row)) : undefined;
  };

  Matrix.prototype.waitingBelow = function (col, row) {
    const list = this.byCol && this.byCol.get(col);
    if (!list) return false;
    for (let k = 0; k < list.length; k++) if (list[k].row > row && !list[k].locked) return true;
    return false;
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
    if (c.row < 0 || this.solid(i, c.row) || this.hushed(i, c.row)) return;
    const ctx = this.ctx, s = this.size, x = i * s;
    ctx.fillStyle = '#000';
    ctx.fillRect(x, c.row * s, s, s);
    ctx.fillStyle = '#1fd16a';
    ctx.fillText(c.ch, x, c.row * s);
  };

  // A stream moves down; returns false if it hit a letter (and splashed).
  Matrix.prototype.fall = function (i, c) {
    const prev = c.row;
    c.y += c.speed;
    const row = Math.floor(c.y);
    if (row === c.row) return true;
    this.settle(i, c);
    for (let r = Math.max(prev + 1, 0); r <= row; r++) {
      const t = this.solid(i, r);
      if (!t) continue;
      // While the menu is forming, a stream that still has letters to form
      // further down this column passes through, forming this one as it goes.
      if (!t.locked && this.waitingBelow(i, r)) {
        t.locked = true;
        if (this.onLock) this.onLock(t);
        continue;
      }
      this.impact(i, r, t); c.row = -1; return false;
    }
    c.row = row;
    c.ch = pick();
    if (row >= 0 && !this.hushed(i, row)) {
      const ctx = this.ctx, s = this.size;
      ctx.fillStyle = '#dcffe6';
      ctx.fillText(c.ch, i * s, row * s);
    }
    return true;
  };

  // Rain lands on a letter: it splashes, wets the top of the word, and some
  // of it starts running toward the nearer end.
  Matrix.prototype.impact = function (col, row, t) {
    const ctx = this.ctx, s = this.size;
    if (!t.locked) { t.locked = true; if (this.onLock) this.onLock(t); }
    else if (this.onHit) this.onHit(t);
    const top = row - 1;
    if (top < 0 || this.solid(col, top)) return;
    this.wet(col, top, 1);
    // The splash: a bright drop right on top, and a fleck thrown up beside it.
    ctx.fillStyle = '#000';
    ctx.fillRect(col * s, top * s, s, s);
    ctx.fillStyle = '#e8fff0';
    ctx.fillText(pick(LIQUID), col * s, top * s);
    if (Math.random() < 0.5 && top > 0) {
      const fx = col + (Math.random() < 0.5 ? -1 : 1);
      if (!this.solid(fx, top - 1)) {
        ctx.fillStyle = 'rgba(160, 255, 190, 0.55)';
        ctx.fillText(pick('.,\''), fx * s, (top - 1) * s);
      }
    }
    if (Math.random() < 0.65) {
      const left = col - t.left, right = t.right - col;
      const dir = left < right ? -1 : right < left ? 1 : (Math.random() < 0.5 ? -1 : 1);
      this.runs.push({ col: col, row: top, dir: dir, end: dir < 0 ? t.left - 1 : t.right + 1, speed: Math.random() < 0.3 ? 2 : 1 });
    }
  };

  Matrix.prototype.wet = function (col, row, amount) {
    const k = key(col, row);
    const p = this.pool.get(k);
    if (p) p.w = Math.max(p.w, amount);
    else this.pool.set(k, { col: col, row: row, w: amount, ch: pick(LIQUID) });
  };

  Matrix.prototype.step = function () {
    const ctx = this.ctx, s = this.size, rows = this.h / s;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.font = s + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';

    for (let i = 0; i < this.cols.length; i++) {
      const c = this.cols[i];
      if (!this.fall(i, c)) {
        // It landed on a word; a new stream starts from the top.
        c.y = -1 - Math.random() * 6; c.row = -1; c.speed = 0.45 + Math.random() * 0.75;
        continue;
      }
      if (c.row > rows && Math.random() > 0.96) {
        c.y = -Math.random() * 8; c.row = -1; c.speed = 0.45 + Math.random() * 0.75;
      }
    }

    if (!this.cells) { this.fillLane(); return; }

    // The pooled water shimmers and slowly drains away between hits.
    const self = this;
    this.pool.forEach(function (p, k) {
      p.w *= 0.9;
      ctx.fillStyle = '#000';
      ctx.fillRect(p.col * s, p.row * s, s, s);
      if (p.w < 0.05) { self.pool.delete(k); return; }
      if (Math.random() < 0.3) p.ch = pick(LIQUID);
      ctx.fillStyle = 'rgba(' + Math.round(31 + 170 * p.w) + ',' + Math.round(209 + 46 * p.w) + ',' + Math.round(106 + 120 * p.w) + ',' + (0.35 + 0.65 * p.w).toFixed(2) + ')';
      ctx.fillText(p.ch, p.col * s, p.row * s);
    });

    // Water running along the top of a word toward its end.
    const runs = [];
    for (let k = 0; k < this.runs.length; k++) {
      const r = this.runs[k];
      let done = false;
      for (let n = 0; n < r.speed && !done; n++) {
        r.col += r.dir;
        if (r.col === r.end || this.solid(r.col, r.row + 1) === undefined) {
          // Over the edge: it pours down the side.
          if (this.spills.length < MAX_SPILLS) {
            this.spills.push({ col: r.col, c: { y: r.row + 0.01, speed: 0.75 + Math.random() * 0.5, row: r.row, ch: pick(LIQUID) } });
          }
          done = true;
        } else {
          this.wet(r.col, r.row, 0.85);
        }
      }
      if (!done) {
        ctx.fillStyle = '#000';
        ctx.fillRect(r.col * s, r.row * s, s, s);
        ctx.fillStyle = '#d6ffe2';
        ctx.fillText('~', r.col * s, r.row * s);
        runs.push(r);
      }
    }
    this.runs = runs;

    // Streams pouring off the ends of words. They can land on a word below.
    const spills = [];
    for (let k = 0; k < this.spills.length; k++) {
      const p = this.spills[k];
      if (this.fall(p.col, p.c) && p.c.row <= rows + 1) spills.push(p);
    }
    this.spills = spills;
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
