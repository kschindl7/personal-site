/*
 * The cracked screen. Builds a spider-web crack (radial lines plus rings),
 * splits it into cells, and drops cells out as the damage grows so the hole
 * spreads unevenly. Draws three things:
 *   - crack lines on #glass-crack (above the UI),
 *   - the Matrix rain through the hole on #glass-hole,
 *   - falling shards, also on #glass-hole.
 *
 * Everything is driven by setProgress(p), p from 0 (fresh crack) to 1
 * (screen gone). main.js decides how p moves over time.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const BREAK_AT = 0.22; // progress where the glass first gives way
  const STAGGER_MS = 30; // delay between neighboring cells falling

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lerp(p, q, t) { return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }; }
  function wrap(a) { return ((a % TAU) + TAU) % TAU; }

  // Builds the crack network in coordinates relative to the impact point.
  function build(seed, maxR) {
    const rnd = rng(seed);
    const rings = [];
    for (let r = 12; ; r = r * 1.38 + 14) { rings.push(r); if (r > maxR) break; }

    const lines = [];
    const cells = [];
    const native = function (rad, j) {
      const a = rad.a + (rnd() - 0.5) * 0.07;
      const r = rings[j] * (1 + (rnd() - 0.5) * 0.1);
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    };

    // First radial cracks out of the impact point.
    let level = [];
    const n0 = 9;
    for (let i = 0; i < n0; i++) level.push({ a: (i + (rnd() - 0.5) * 0.55) / n0 * TAU, pts: [], mid: [] });
    level.sort(function (p, q) { return p.a - q.a; });
    level.forEach(function (rad) { rad.pts[0] = native(rad, 0); });

    const O = { x: 0, y: 0 };
    for (let i = 0; i < level.length; i++) {
      const a = level[i], b = level[(i + 1) % level.length];
      let span = b.a - a.a; if (span <= 0) span += TAU;
      cells.push({ band: -1, poly: [O, a.pts[0], b.pts[0]], a0: a.a, span: span });
      lines.push({ kind: 'radial', pts: [O, a.pts[0]], r0: 0, r1: rings[0] });
    }

    const lobes = [];
    for (let k = 0; k < 3; k++) lobes.push({ dir: rnd() * TAU, w: 1.4 + rnd() * 1.8 });

    for (let j = 0; j < rings.length - 1; j++) {
      const keep = j < 2 ? 0.97 : j < 4 ? 0.7 : 0.45;
      const next = [];
      for (let i = 0; i < level.length; i++) {
        const a = level[i], b = level[(i + 1) % level.length];
        let span = b.a - a.a; if (span <= 0) span += TAU;
        lines.push({ kind: 'ring', pts: [a.pts[j], b.pts[j]], r: rings[j], keep: rnd() < keep });
        next.push(a);
        // Long stretches branch into a new radial crack.
        if (span * rings[j + 1] > 150 && span > 0.12) {
          const t = 0.35 + rnd() * 0.3;
          const rad = { a: a.a + span * t, pts: [], mid: [] };
          rad.pts[j] = lerp(a.pts[j], b.pts[j], t);
          next.push(rad);
        }
      }
      next.forEach(function (rad) {
        const p0 = rad.pts[j], p1 = rad.pts[j + 1] = native(rad, j + 1);
        const dx = p1.x - p0.x, dy = p1.y - p0.y;
        const k = (rnd() - 0.5) * 0.18;
        const m = { x: (p0.x + p1.x) / 2 - dy * k, y: (p0.y + p1.y) / 2 + dx * k };
        rad.mid[j] = m;
        lines.push({ kind: 'radial', pts: [p0, m, p1], r0: rings[j], r1: rings[j + 1] });
      });
      for (let i = 0; i < next.length; i++) {
        const a = next[i], b = next[(i + 1) % next.length];
        let span = b.a - a.a; if (span <= 0) span += TAU;
        cells.push({ band: j, poly: [a.pts[j], b.pts[j], b.mid[j], b.pts[j + 1], a.pts[j + 1], a.mid[j]], a0: a.a, span: span });
      }
      level = next;
    }

    // Neighbors, scores (lower falls sooner), and bounds.
    const byBand = {};
    cells.forEach(function (c, i) {
      c.id = i; c.nb = []; c.fallen = false; c.due = 0;
      (byBand[c.band] = byBand[c.band] || []).push(c);
      const mid = c.a0 + c.span / 2;
      let lobe = 0;
      lobes.forEach(function (l) { lobe += l.w * Math.pow(Math.max(0, Math.cos(mid - l.dir)), 6); });
      c.score = c.band + 1 + rnd() * 1.4 - lobe;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, sx = 0, sy = 0;
      c.poly.forEach(function (p) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        sx += p.x; sy += p.y;
      });
      c.box = [minX, minY, maxX, maxY];
      c.cx = sx / c.poly.length; c.cy = sy / c.poly.length;
    });
    Object.keys(byBand).forEach(function (k) {
      const band = byBand[k], inner = byBand[+k - 1];
      band.forEach(function (c, i) {
        const side = band[(i + 1) % band.length];
        c.nb.push(side); side.nb.push(c);
        if (!inner) return;
        const mid = c.a0 + c.span / 2;
        for (let q = 0; q < inner.length; q++) {
          if (wrap(mid - inner[q].a0) <= inner[q].span) { c.nb.push(inner[q]); inner[q].nb.push(c); break; }
        }
      });
    });

    return { rings: rings, lines: lines, cells: cells };
  }

  function Glass(opts) {
    this.crackCanvas = opts.crack;
    this.holeCanvas = opts.hole;
    this.cctx = this.crackCanvas.getContext('2d');
    this.hctx = this.holeCanvas.getContext('2d');
    this.mask = document.createElement('canvas');
    this.mctx = this.mask.getContext('2d');
    this.matrix = opts.matrix;
    this.reduced = opts.reduced;
    this.onBreak = opts.onBreak || function () {};
    this.onShattered = opts.onShattered || function () {};
    this.net = build(opts.seed || (Math.random() * 1e9) | 0, 3200);
    this.cx = 0; this.cy = 0;
    this.progress = -1;
    this.crackR = 0; this.crackTarget = 0;
    this.threshold = -Infinity;
    this.broken = false; this.shattered = false;
    this.shards = [];
    this.pending = [];
    this.crackDirty = this.maskDirty = true;
  }

  Glass.prototype.resize = function (w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    [this.crackCanvas, this.holeCanvas, this.mask].forEach(function (c) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    });
    if (this.matrix) this.matrix.resize(w, h, dpr);
    this.measure();
  };

  Glass.prototype.setCenter = function (x, y) {
    this.cx = x; this.cy = y;
    this.measure();
  };

  // Which cells are on screen, and the score that clears all of them.
  Glass.prototype.measure = function () {
    const self = this;
    let top = -Infinity;
    this.net.cells.forEach(function (c) {
      const b = c.box;
      c.visible = b[2] + self.cx > 0 && b[0] + self.cx < self.w && b[3] + self.cy > 0 && b[1] + self.cy < self.h;
      if (c.visible) top = Math.max(top, c.score);
    });
    this.fullScore = top + 0.01;
    this.crackDirty = this.maskDirty = true;
  };

  Glass.prototype.setProgress = function (p, now) {
    if (p <= this.progress) return;
    this.progress = p;
    this.crackTarget = 34 * Math.pow(320, Math.min(p, 1.2));
    if (this.crackR === 0) this.crackR = this.reduced ? this.crackTarget : 6;
    if (p < BREAK_AT) return;

    if (!this.broken) {
      this.broken = true;
      // The weakest piece at the center always goes first.
      let first = null;
      this.net.cells.forEach(function (c) { if (c.band === -1 && (!first || c.score < first.score)) first = c; });
      this.drop(first, now);
      this.onBreak();
    }
    const t = (p - BREAK_AT) / (1 - BREAK_AT);
    this.threshold = p >= 1 ? Infinity : 0.6 + t * (this.fullScore - 0.6);
    this.spread(now);
  };

  Glass.prototype.drop = function (c, due) {
    c.fallen = true; c.due = due; c.landed = false;
    this.pending.push(c);
  };

  // Cells under the threshold fall once a neighbor has, so the hole stays in one piece.
  Glass.prototype.spread = function (now) {
    const cells = this.net.cells, thr = this.threshold;
    let wave = 1, changed = true;
    while (changed) {
      changed = false;
      const batch = [];
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (c.fallen || c.score >= thr) continue;
        for (let k = 0; k < c.nb.length; k++) if (c.nb[k].fallen) { batch.push(c); break; }
      }
      for (let i = 0; i < batch.length; i++) {
        this.drop(batch[i], now + (this.reduced ? 0 : wave * STAGGER_MS));
        changed = true;
      }
      wave++;
    }
  };

  Glass.prototype.frame = function (now) {
    // Ease the crack outward.
    if (this.crackR < this.crackTarget) {
      const dt = this.lastFrame ? Math.min(now - this.lastFrame, 100) / 1000 : 0;
      this.crackR = Math.min(this.crackTarget, this.crackR + Math.max(30 * dt, (this.crackTarget - this.crackR) * Math.min(1, dt * 7)));
      this.crackDirty = true;
    }
    this.lastFrame = now;

    // Cells whose time has come leave the glass.
    if (this.pending.length) {
      const keep = [];
      for (let i = 0; i < this.pending.length; i++) {
        const c = this.pending[i];
        if (c.due <= now) { c.landed = true; this.addShard(c); this.maskDirty = this.crackDirty = true; }
        else keep.push(c);
      }
      this.pending = keep;
    }

    if (this.maskDirty) this.drawMask();
    if (this.crackDirty) this.drawCracks();

    if (this.broken) {
      if (this.matrix) this.matrix.update(now);
      this.drawHole(now);
    }

    if (this.broken && !this.shattered && this.progress >= 1 && !this.pending.length) {
      const left = this.net.cells.some(function (c) { return c.visible && !c.landed; });
      if (!left) { this.shattered = true; this.maskDirty = this.crackDirty = true; this.onShattered(); }
    }
  };

  Glass.prototype.path = function (ctx, c) {
    const p = c.poly;
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
    ctx.closePath();
  };

  Glass.prototype.drawMask = function () {
    const ctx = this.mctx, self = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.mask.width, this.mask.height);
    if (this.shattered) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.mask.width, this.mask.height);
    } else {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, this.cx * this.dpr, this.cy * this.dpr);
      ctx.beginPath();
      this.net.cells.forEach(function (c) { if (c.landed) self.path(ctx, c); });
      ctx.fillStyle = '#000';
      ctx.fill();
      // A thin stroke hides seams between neighboring cells.
      ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000';
      ctx.stroke();
    }
    this.maskDirty = false;
  };

  function strokePartial(ctx, pts, f) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    let left = total * f;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length && left > 0; i++) {
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len <= left) { ctx.lineTo(b.x, b.y); left -= len; }
      else { ctx.lineTo(a.x + (b.x - a.x) * left / len, a.y + (b.y - a.y) * left / len); left = 0; }
    }
  }

  Glass.prototype.drawCracks = function () {
    const ctx = this.cctx, R = this.crackR, self = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.crackCanvas.width, this.crackCanvas.height);
    this.crackDirty = false;
    if (R <= 0 || this.shattered) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, this.cx * this.dpr, this.cy * this.dpr);

    const path = new Path2D();
    this.net.lines.forEach(function (l) {
      let f;
      if (l.kind === 'radial') f = (R - l.r0) / (l.r1 - l.r0);
      else { if (!l.keep) return; f = (R - l.r * 1.08) / (l.r * 0.35); }
      if (f <= 0) return;
      const sub = new Path2D();
      strokePartial(sub, l.pts, Math.min(f, 1));
      path.addPath(sub);
    });

    // Impact point: a faint frosted bruise.
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.min(R, 40));
    g.addColorStop(0, 'rgba(230, 238, 245, 0.32)');
    g.addColorStop(1, 'rgba(230, 238, 245, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, Math.min(R, 40), 0, TAU); ctx.fill();

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.save();
    ctx.translate(0.8, 1);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'; ctx.lineWidth = 1.6;
    ctx.stroke(path);
    ctx.restore();
    ctx.strokeStyle = 'rgba(232, 238, 244, 0.82)'; ctx.lineWidth = 1;
    ctx.stroke(path);

    // Bright broken edge around the hole. Half of it is covered by the hole itself.
    if (this.broken) {
      ctx.beginPath();
      this.net.cells.forEach(function (c) { if (c.landed) self.path(ctx, c); });
      ctx.strokeStyle = 'rgba(225, 235, 245, 0.55)'; ctx.lineWidth = 4;
      ctx.stroke();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(this.mask, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  Glass.prototype.addShard = function (c) {
    if (this.reduced || this.shards.length > 260) return;
    const dist = Math.hypot(c.cx, c.cy) || 1;
    this.shards.push({
      poly: c.poly.map(function (p) { return { x: p.x - c.cx, y: p.y - c.cy }; }),
      x: c.cx + this.cx, y: c.cy + this.cy,
      vx: c.cx / dist * (20 + Math.random() * 60),
      vy: -30 - Math.random() * 60,
      rot: 0, vr: (Math.random() - 0.5) * 2.4,
      age: 0, life: 1.1 + Math.random() * 0.6
    });
  };

  Glass.prototype.drawHole = function (now) {
    const ctx = this.hctx, d = this.dpr;
    const dt = this.lastHole ? Math.min(now - this.lastHole, 100) / 1000 : 0;
    this.lastHole = now;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.holeCanvas.width, this.holeCanvas.height);
    ctx.drawImage(this.mask, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    if (this.matrix) ctx.drawImage(this.matrix.canvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    // Shards tumble away and fade.
    const keep = [];
    for (let i = 0; i < this.shards.length; i++) {
      const s = this.shards[i];
      s.age += dt; s.vy += 1500 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
      const a = 1 - s.age / s.life;
      if (a <= 0 || s.y > this.h + 400) continue;
      keep.push(s);
      const k = 1 - s.age * 0.18;
      ctx.setTransform(d * k * Math.cos(s.rot), d * k * Math.sin(s.rot), -d * k * Math.sin(s.rot), d * k * Math.cos(s.rot), s.x * d, s.y * d);
      ctx.beginPath();
      ctx.moveTo(s.poly[0].x, s.poly[0].y);
      for (let p = 1; p < s.poly.length; p++) ctx.lineTo(s.poly[p].x, s.poly[p].y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(38, 38, 40, ' + (0.92 * a) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(230, 238, 245, ' + (0.5 * a) + ')';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    this.shards = keep;
  };

  Glass.BREAK_AT = BREAK_AT;
  window.Glass = Glass;
})();
