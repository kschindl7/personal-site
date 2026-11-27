/*
 * The breaking screen.
 *
 * Two stages, driven from main.js:
 *   crack(now)   One long stress crack runs across the glass from near the
 *                bottom-left corner to near the top-right, with a few forks.
 *   shatter(now) An impact just above the input box sends radial cracks out
 *                that fork, wander and stop where they meet other cracks.
 *                Concentric cracks join neighboring radials at staggered
 *                points. More fractures start later from points on existing
 *                cracks, so the damage cascades across the screen.
 *
 * Shards are whatever regions the cracks enclose. The crack paths are drawn
 * into a grid and the enclosed regions are flood-filled, so every shard has
 * its own shape, nothing is mirrored, and pieces can be any size. A shard
 * can fall once every crack around it has formed, and only after a neighbor
 * has fallen, so the hole grows outward from the impact (and from a couple
 * of later fracture points) until no glass is left.
 *
 * Canvases: #glass-crack (above the UI) holds the crack lines and the bright
 * broken edges. #glass-hole (below the composer) shows the Matrix rain
 * through the hole and the falling shards.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const TOTAL_MS = 7000;   // roughly how long the shatter takes, start to finish
  const GRAVITY = 2400;    // px/s² for falling shards
  const MAX_SPRITES = 240; // falling shards drawn at once

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function wrap(a) { return ((a % TAU) + TAU) % TAU; }

  // ---------------------------------------------------------------------------
  // Crack network
  // ---------------------------------------------------------------------------

  // Occupancy grid used while growing cracks, so a new crack knows when it
  // runs into an old one. Covers a margin around the screen.
  const OCC = 3, PAD = 60;

  function Builder(w, h, seed) {
    this.w = w; this.h = h;
    this.r = rng(seed);
    this.cracks = [];
    this.origins = [];
    this.ow = Math.ceil((w + PAD * 2) / OCC);
    this.oh = Math.ceil((h + PAD * 2) / OCC);
    this.occ = new Int32Array(this.ow * this.oh);
  }

  Builder.prototype.U = function (a, b) { return a + (b - a) * this.r(); };
  Builder.prototype.gauss = function () { const r = this.r; return (r() + r() + r() - 1.5) * 2; };

  Builder.prototype.cell = function (x, y) {
    const gx = Math.floor((x + PAD) / OCC), gy = Math.floor((y + PAD) / OCC);
    if (gx < 0 || gy < 0 || gx >= this.ow || gy >= this.oh) return -1;
    return gy * this.ow + gx;
  };

  Builder.prototype.mark = function (x0, y0, x1, y1, id) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 1.5));
    for (let k = 0; k <= n; k++) {
      const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n;
      // 2x2 so a crossing crack can't slip through diagonally.
      for (let d = 0; d < 4; d++) {
        const i = this.cell(x + (d & 1) * OCC, y + (d >> 1) * OCC);
        if (i >= 0 && !this.occ[i]) this.occ[i] = id + 1;
      }
    }
  };

  // First other crack on the segment, or -1.
  Builder.prototype.hit = function (x0, y0, x1, y1, id, ignore, skip) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 1.5));
    for (let k = 1; k <= n; k++) {
      const i = this.cell(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n);
      if (i < 0) continue;
      const v = this.occ[i] - 1;
      if (v >= 0 && v !== id && v !== skip && !(ignore && ignore.has(v))) return v;
    }
    return -1;
  };

  // The point on crack `id` closest to (x, y), so joins are exact.
  Builder.prototype.nearest = function (id, x, y) {
    const c = this.cracks[id];
    let best = 0, bd = Infinity;
    for (let i = 0; i < c.pts.length; i++) {
      const d = (c.pts[i].x - x) * (c.pts[i].x - x) + (c.pts[i].y - y) * (c.pts[i].y - y);
      if (d < bd) { bd = d; best = i; }
    }
    return { x: c.pts[best].x, y: c.pts[best].y, t: c.t[best] };
  };

  Builder.prototype.add = function (c) {
    c.id = this.cracks.length;
    this.cracks.push(c);
    return c;
  };

  Builder.prototype.outside = function (x, y, m) {
    return x < -m || y < -m || x > this.w + m || y > this.h + m;
  };

  // A crack that wanders forward from a point, forks now and then, and stops
  // when it meets another crack (most of the time) or leaves the screen.
  Builder.prototype.grow = function (opt) {
    const ids = [];
    const queue = [opt];
    while (queue.length && this.cracks.length < 900) {
      const o = queue.shift();
      const c = this.add({ phase: o.phase, kind: o.kind, w: o.w, alpha: o.alpha, pts: [{ x: o.x, y: o.y }], t: [o.t0], dangling: false });
      ids.push(c.id);
      if (o.family) o.family.add(c.id);
      const time = function (s) { return o.t0 + s / o.speed * (1 + s / 5000); };
      let x = o.x, y = o.y, a = o.a, base = o.a, s = 0;
      let nextFork = o.forkEvery ? o.forkEvery * this.U(0.45, 1.2) : Infinity;
      let skip = -1, skipUntil = 0;
      for (let guard = 0; guard < 2000; guard++) {
        const step = this.U(4.5, 7.5);
        a += this.gauss() * 0.05 + (base - a) * 0.1;
        base += this.gauss() * 0.012;
        const nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
        const h = this.hit(x, y, nx, ny, c.id, s < o.ignoreUntil ? o.ignore : null, s < skipUntil ? skip : -1);
        if (h >= 0) {
          if (this.r() < o.stopProb) {
            const q = this.nearest(h, nx, ny);
            s += Math.hypot(q.x - x, q.y - y);
            c.pts.push({ x: q.x, y: q.y }); c.t.push(time(s));
            this.mark(x, y, q.x, q.y, c.id);
            break;
          }
          skip = h; skipUntil = s + 16; // breaks straight through this one
        }
        this.mark(x, y, nx, ny, c.id);
        s += step; x = nx; y = ny;
        c.pts.push({ x: x, y: y }); c.t.push(time(s));
        if (this.outside(x, y, 30)) break;
        if (s >= o.maxLen) { c.dangling = true; break; }
        if (s >= nextFork && o.depth < 3) {
          // Bifurcation: both halves bend away from each other a little.
          const sg = this.r() < 0.5 ? -1 : 1, spread = this.U(0.2, 0.5);
          queue.push(Object.assign({}, o, {
            x: x, y: y, a: a + sg * spread, t0: time(s), depth: o.depth + 1,
            ignore: new Set([c.id]), ignoreUntil: 24,
            maxLen: this.r() < 0.22 ? this.U(40, 260) : o.maxLen === Infinity ? Infinity : o.maxLen * this.U(0.3, 0.8)
          }));
          a -= sg * spread * this.U(0.2, 0.6); base = a;
          nextFork = s + o.forkEvery * this.U(0.6, 1.7);
        }
      }
    }
    return ids;
  };

  // The first crack: one long, uneven line from near the bottom-left corner to
  // near the top-right, spreading both ways from a point near the middle.
  Builder.prototype.mainCrack = function () {
    const w = this.w, h = this.h, r = this.r;
    // Each end lands somewhere along the edges near its corner.
    const A = r() < 0.5 ? { x: this.U(-10, w * 0.22), y: h + 14 } : { x: -14, y: this.U(h * 0.74, h) };
    const B = r() < 0.5 ? { x: this.U(w * 0.78, w + 10), y: -14 } : { x: w + 14, y: this.U(0, h * 0.26) };
    const L = dist(A, B), dx = (B.x - A.x) / L, dy = (B.y - A.y) / L;
    const nx = -dy, ny = dx;
    const waves = [
      { amp: this.U(0.006, 0.07) * L * (r() < 0.5 ? -1 : 1), f: this.U(0.4, 1.6), ph: this.U(0, TAU) },
      { amp: this.U(0.003, 0.022) * L, f: this.U(1.8, 4), ph: this.U(0, TAU) },
      { amp: this.U(0.001, 0.006) * L, f: this.U(5, 11), ph: this.U(0, TAU) }
    ];
    const kinks = [];
    for (let k = 0, n = 1 + Math.floor(r() * 8); k < n; k++) kinks.push({ u: this.U(0.05, 0.95), amt: this.U(2, 14) * (r() < 0.5 ? -1 : 1) });
    const N = Math.ceil(L / 5);
    const pts = [];
    let jit = 0;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      let off = 0;
      waves.forEach(function (q) { off += q.amp * Math.sin(TAU * q.f * u + q.ph); });
      off *= Math.pow(Math.sin(Math.PI * u), 0.5);
      kinks.forEach(function (k) { off += k.amt / (1 + Math.exp(-(u - k.u) * 900)); });
      jit = jit * 0.8 + this.gauss() * 0.35;
      off += jit;
      pts.push({ x: A.x + dx * L * u + nx * off, y: A.y + dy * L * u + ny * off });
    }
    const s = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + dist(pts[i - 1], pts[i]));
    // It can start anywhere along its length and run at its own speed.
    const i0 = Math.floor(pts.length * this.U(0.2, 0.8));
    const v = this.U(2.4, 4.4);
    const t = s.map(function (q) { const d = Math.abs(q - s[i0]); return d / v * (1 + d / 3000); });
    const main = this.add({ phase: 0, kind: 'main', w: this.U(1.45, 2.0), alpha: this.U(0.85, 0.96), pts: pts, t: t, dangling: false });
    for (let i = 1; i < pts.length; i++) this.mark(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, main.id);

    // Forks off the long crack: a few real branches and some short spurs.
    const self = this;
    function fork(len, w, alpha, spread) {
      const i = Math.floor(self.U(0.08, 0.92) * (pts.length - 2)) + 1;
      if (self.outside(pts[i].x, pts[i].y, -10)) return;
      let a = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
      if (i < i0) a += Math.PI; // branches run the way the crack was travelling
      self.grow({
        x: pts[i].x, y: pts[i].y, a: a + (r() < 0.5 ? -1 : 1) * spread,
        phase: 0, t0: t[i] + self.U(0, 30), speed: 2.4, kind: 'branch', w: w, alpha: alpha,
        depth: 3, maxLen: len, stopProb: 1, forkEvery: 0,
        ignore: new Set([main.id]), ignoreUntil: 18
      });
    }
    const nb = 1 + Math.floor(r() * 6), long = r() < 0.35 ? 2 : r() < 0.8 ? 1 : 0;
    for (let k = 0; k < nb; k++) fork(k < long ? this.U(220, 560) : this.U(30, 240), this.U(1, 1.3), 0.8, this.U(0.25, 0.85));
    for (let k = 0, n = 3 + Math.floor(r() * 12); k < n; k++) fork(this.U(5, 20), 0.8, 0.55, this.U(0.5, 1.3));
    return main;
  };

  // Radial cracks out of a point, with uneven gaps between them.
  Builder.prototype.radials = function (O, t0, n, opt) {
    const gaps = [];
    let sum = 0;
    for (let i = 0; i < n; i++) { const g = -Math.log(1 - this.r() * 0.97) + 0.25; gaps.push(g); sum += g; }
    let a = this.U(0, TAU);
    const family = new Set(opt.onCrack >= 0 ? [opt.onCrack] : []);
    let ids = [];
    for (let i = 0; i < n; i++) {
      a += gaps[i] / sum * TAU;
      ids = ids.concat(this.grow({
        x: O.x, y: O.y, a: a, phase: 1, t0: t0 + this.U(0, 25), speed: this.U(opt.speed[0], opt.speed[1]),
        kind: 'radial', w: opt.w, alpha: 0.86, depth: 0,
        maxLen: this.r() < opt.dieP ? this.U(60, 380) : Infinity,
        stopProb: opt.stop, forkEvery: this.U(opt.fork[0], opt.fork[1]),
        family: family, ignore: family, ignoreUntil: 16
      }));
    }
    return ids;
  };

  Builder.prototype.atRadius = function (id, O, rad) {
    const c = this.cracks[id];
    for (let i = 1; i < c.pts.length; i++) {
      if (dist(c.pts[i], O) >= rad) return { x: c.pts[i].x, y: c.pts[i].y, t: c.t[i], id: id };
    }
    return null;
  };

  // Concentric cracks: short, slightly bowed joins between neighboring
  // radials. Each join picks its own radius on each side, so they never line
  // up into rings.
  Builder.prototype.rings = function (O, ids, opt) {
    const maxR = Math.hypot(this.w, this.h) * 1.1;
    let rad = opt.r0;
    while (rad < maxR) {
      const cands = [];
      for (let k = 0; k < ids.length; k++) {
        const p = this.atRadius(ids[k], O, rad);
        if (p) cands.push({ id: ids[k], ang: Math.atan2(p.y - O.y, p.x - O.x) });
      }
      cands.sort(function (p, q) { return p.ang - q.ang; });
      const n = cands.length;
      for (let i = 0; n > 1 && i < n; i++) {
        const a = cands[i], b = cands[(i + 1) % n];
        const gap = wrap(b.ang - a.ang);
        if (gap < 0.05 || gap > 2.3) continue;
        const p = (rad < 160 ? 0.97 : rad < 420 ? 0.86 : 0.66) * opt.density;
        if (this.r() > p) continue;
        const P = this.atRadius(a.id, O, rad * this.U(0.8, 1.2));
        const Q = this.atRadius(b.id, O, rad * this.U(0.8, 1.2));
        if (!P || !Q || dist(P, Q) > opt.maxChord || dist(P, Q) < 4) continue;
        this.chord(P, Q, O);
      }
      rad = rad * this.U(opt.f[0], opt.f[1]) + this.U(6, 22);
    }
  };

  Builder.prototype.chord = function (P, Q, O) {
    if (Q.t < P.t) { const tmp = P; P = Q; Q = tmp; }
    const t0 = Math.max(P.t, Q.t) + this.U(15, 110);
    const L = dist(P, Q);
    const n = Math.max(2, Math.round(L / 6));
    let nx = -(Q.y - P.y) / L, ny = (Q.x - P.x) / L;
    const mid = { x: (P.x + Q.x) / 2, y: (P.y + Q.y) / 2 };
    if (dist({ x: mid.x + nx, y: mid.y + ny }, O) < dist(mid, O)) { nx = -nx; ny = -ny; }
    const bow = L * this.U(0.02, 0.12) * (this.r() < 0.85 ? 1 : -1);
    const pts = [{ x: P.x, y: P.y }];
    let jit = 0;
    for (let i = 1; i < n; i++) {
      const u = i / n;
      jit = jit * 0.75 + this.gauss() * 0.5;
      const off = bow * Math.sin(Math.PI * u) + jit * Math.sin(Math.PI * u);
      pts.push({ x: P.x + (Q.x - P.x) * u + nx * off, y: P.y + (Q.y - P.y) * u + ny * off });
    }
    pts.push({ x: Q.x, y: Q.y });

    const c = this.add({ phase: 1, kind: 'chord', w: 1.0, alpha: 0.74, pts: [pts[0]], t: [t0], dangling: false });
    const ignore = new Set([P.id, Q.id]);
    const stopAt = this.r() < 0.1 ? Math.floor(pts.length * this.U(0.3, 0.7)) : pts.length;
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const end = i >= pts.length - 2;
      const h = end ? -1 : this.hit(a.x, a.y, b.x, b.y, c.id, ignore, -1);
      if (h >= 0) {
        const q = this.nearest(h, b.x, b.y);
        s += dist(a, q);
        c.pts.push({ x: q.x, y: q.y }); c.t.push(t0 + s / 1.4);
        this.mark(a.x, a.y, q.x, q.y, c.id);
        return;
      }
      s += dist(a, b);
      c.pts.push(b); c.t.push(t0 + s / 1.4);
      this.mark(a.x, a.y, b.x, b.y, c.id);
      if (i >= stopAt) { c.dangling = true; return; }
    }
  };

  // Crushed glass right at the impact: many tiny cracks.
  Builder.prototype.splinters = function (O) {
    for (let k = 0, n = 16 + Math.floor(this.r() * 12); k < n; k++) {
      const a = this.U(0, TAU), r0 = this.U(0, 5), len = this.U(4, 24);
      const p0 = { x: O.x + Math.cos(a) * r0, y: O.y + Math.sin(a) * r0 };
      const b = a + this.gauss() * 0.3;
      const pts = [p0, { x: p0.x + Math.cos(b) * len * 0.5, y: p0.y + Math.sin(b) * len * 0.5 }];
      const b2 = b + this.gauss() * 0.25;
      pts.push({ x: pts[1].x + Math.cos(b2) * len * 0.5, y: pts[1].y + Math.sin(b2) * len * 0.5 });
      const t0 = this.U(0, 30);
      this.add({ phase: 1, kind: 'splinter', w: 0.8, alpha: 0.55, pts: pts, t: [t0, t0 + len / 3, t0 + len / 1.5], dangling: true });
    }
  };

  // A later fracture that starts from a point on a crack that is already there.
  Builder.prototype.cascade = function (O, t0, onCrack) {
    this.origins.push({ x: O.x, y: O.y, t: t0 });
    const ids = this.radials(O, t0, 5 + Math.floor(this.r() * 3), {
      onCrack: onCrack, speed: [1.8, 2.4], w: 1.2, dieP: 0.1, stop: 0.9, fork: [160, 320]
    });
    this.rings(O, ids, { r0: this.U(18, 34), f: [1.3, 1.6], density: 0.9, maxChord: 260 });
  };

  // Pick the candidate point farthest from the fractures that already exist.
  Builder.prototype.farthest = function (cands) {
    const self = this, inset = 0.06;
    let best = null, bs = -1;
    cands.forEach(function (p) {
      if (p.x < self.w * inset || p.x > self.w * (1 - inset) || p.y < self.h * inset || p.y > self.h * (1 - inset)) return;
      let m = Infinity;
      self.origins.forEach(function (o) { m = Math.min(m, dist(o, p)); });
      const sc = m * self.U(0.7, 1);
      if (sc > bs) { bs = sc; best = p; }
    });
    return best;
  };

  Builder.prototype.samplePoints = function (n, filter) {
    const out = [];
    const pool = this.cracks.filter(filter);
    for (let k = 0; k < n && pool.length; k++) {
      const c = pool[Math.floor(this.r() * pool.length)];
      const i = Math.floor(this.r() * c.pts.length);
      out.push({ x: c.pts[i].x, y: c.pts[i].y, id: c.id });
    }
    return out;
  };

  // ---------------------------------------------------------------------------
  // Shards: draw the cracks into a grid and flood-fill what they enclose.
  // ---------------------------------------------------------------------------

  function raster(B, cs) {
    const GW = Math.ceil(B.w / cs), GH = Math.ceil(B.h / cs);
    const T = new Float32Array(GW * GH).fill(Infinity);
    B.cracks.forEach(function (c) {
      for (let i = 1; i < c.pts.length; i++) {
        const a = c.pts[i - 1], b = c.pts[i];
        const ta = c.phase ? c.t[i - 1] : 0, tb = c.phase ? c.t[i] : 0;
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / cs * 2));
        for (let k = 0; k <= n; k++) {
          const gx = Math.floor((a.x + (b.x - a.x) * k / n) / cs), gy = Math.floor((a.y + (b.y - a.y) * k / n) / cs);
          if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
          const idx = gy * GW + gx, tt = ta + (tb - ta) * k / n;
          if (tt < T[idx]) T[idx] = tt;
        }
      }
    });

    // Label the regions between cracks (4-connected).
    const lab = new Int32Array(GW * GH);
    const stack = new Int32Array(GW * GH);
    let n = 0;
    for (let i = 0; i < lab.length; i++) {
      if (lab[i] || T[i] !== Infinity) continue;
      n++;
      let sp = 0; stack[sp++] = i; lab[i] = n;
      while (sp) {
        const j = stack[--sp], x = j % GW;
        if (x > 0 && !lab[j - 1] && T[j - 1] === Infinity) { lab[j - 1] = n; stack[sp++] = j - 1; }
        if (x < GW - 1 && !lab[j + 1] && T[j + 1] === Infinity) { lab[j + 1] = n; stack[sp++] = j + 1; }
        if (j >= GW && !lab[j - GW] && T[j - GW] === Infinity) { lab[j - GW] = n; stack[sp++] = j - GW; }
        if (j < lab.length - GW && !lab[j + GW] && T[j + GW] === Infinity) { lab[j + GW] = n; stack[sp++] = j + GW; }
      }
    }

    // A shard is free once every crack touching it has formed, and it
    // borders the shards on the other side of those cracks.
    const freed = new Float32Array(n + 1);
    const pairs = new Set();
    const near = [];
    for (let i = 0; i < lab.length; i++) {
      if (T[i] === Infinity) continue;
      const x = i % GW, y = (i / GW) | 0;
      near.length = 0;
      for (let oy = -2; oy <= 2; oy++) {
        const yy = y + oy; if (yy < 0 || yy >= GH) continue;
        for (let ox = -2; ox <= 2; ox++) {
          const xx = x + ox; if (xx < 0 || xx >= GW) continue;
          const L = lab[yy * GW + xx];
          if (L && near.indexOf(L) < 0) near.push(L);
        }
      }
      for (let a = 0; a < near.length; a++) {
        if (T[i] > freed[near[a]]) freed[near[a]] = T[i];
        for (let b = a + 1; b < near.length; b++) {
          const p = near[a] < near[b] ? near[a] * 65536 + near[b] : near[b] * 65536 + near[a];
          pairs.add(p);
        }
      }
    }

    // Crack cells go to whichever shard is next to them, so the shards
    // together cover the whole screen.
    for (let pass = 0, left = true; left && pass < 8; pass++) {
      left = false;
      for (let i = 0; i < lab.length; i++) {
        if (lab[i]) continue;
        const x = i % GW;
        const L = (x > 0 && lab[i - 1] > 0) ? lab[i - 1] : (x < GW - 1 && lab[i + 1] > 0) ? lab[i + 1] :
          (i >= GW && lab[i - GW] > 0) ? lab[i - GW] : (i < lab.length - GW && lab[i + GW] > 0) ? lab[i + GW] : 0;
        if (L) lab[i] = -L; else left = true;
      }
      for (let i = 0; i < lab.length; i++) if (lab[i] < 0) lab[i] = -lab[i];
    }
    for (let i = 0; i < lab.length; i++) if (!lab[i]) lab[i] = 1;

    const S = {
      GW: GW, GH: GH, cs: cs, lab: lab, n: n, freed: freed,
      area: new Int32Array(n + 1),
      x0: new Int32Array(n + 1).fill(GW), y0: new Int32Array(n + 1).fill(GH),
      x1: new Int32Array(n + 1), y1: new Int32Array(n + 1),
      sx: new Float64Array(n + 1), sy: new Float64Array(n + 1),
      edge: new Uint8Array(n + 1),
      nb: []
    };
    for (let L = 0; L <= n; L++) S.nb.push([]);
    for (let i = 0; i < lab.length; i++) {
      const L = lab[i], x = i % GW, y = (i / GW) | 0;
      S.area[L]++; S.sx[L] += x; S.sy[L] += y;
      if (x < S.x0[L]) S.x0[L] = x; if (x > S.x1[L]) S.x1[L] = x;
      if (y < S.y0[L]) S.y0[L] = y; if (y > S.y1[L]) S.y1[L] = y;
      if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1) S.edge[L] = 1;
    }
    pairs.forEach(function (p) {
      const a = Math.floor(p / 65536), b = p % 65536;
      S.nb[a].push(b); S.nb[b].push(a);
    });
    return S;
  }

  function labelAt(S, x, y) {
    const gx = Math.min(S.GW - 1, Math.max(0, Math.floor(x / S.cs)));
    const gy = Math.min(S.GH - 1, Math.max(0, Math.floor(y / S.cs)));
    return S.lab[gy * S.GW + gx];
  }

  // When each shard falls (ms after the shatter starts).
  function fallTimes(B, S, impact) {
    const r = B.r, n = S.n, cs2 = S.cs * S.cs;
    const fall = new Float32Array(n + 1).fill(Infinity);
    const hold = new Float32Array(n + 1);
    const tempo = 0.8 + r() * 0.45;        // some breaks are quicker than others
    const pause = 200 + r() * 320;          // how long the cracked glass hangs first
    const holes = 0.3 + r() * 0.5;          // how often a later fracture opens its own hole
    for (let L = 1; L <= n; L++) {
      const size = Math.sqrt(S.area[L] * cs2);
      hold[L] = (160 + r() * 420) * (0.5 + size / 120) * (S.edge[L] ? 1.35 : 1) * tempo;
    }
    // The crushed center goes first, and some of the later fracture points
    // open holes of their own that grow and merge.
    const seeds = new Set();
    const g = Math.ceil(7 / S.cs);
    for (let oy = -g; oy <= g; oy++) for (let ox = -g; ox <= g; ox++) seeds.add(labelAt(S, impact.x + ox * S.cs, impact.y + oy * S.cs));
    seeds.forEach(function (L) { fall[L] = S.freed[L] + pause + r() * 160; });
    B.origins.forEach(function (o, k) {
      if (k === 0 || r() > holes) return;
      const L = labelAt(S, o.x, o.y);
      fall[L] = Math.min(fall[L], S.freed[L] + 500 + r() * 600);
    });

    const done = new Uint8Array(n + 1);
    for (let it = 0; it < n; it++) {
      let L = 0, best = Infinity;
      for (let k = 1; k <= n; k++) if (!done[k] && fall[k] < best) { best = fall[k]; L = k; }
      if (!L) break;
      done[L] = 1;
      const nb = S.nb[L];
      for (let k = 0; k < nb.length; k++) {
        const m = nb[k];
        if (done[m]) continue;
        const f = Math.max(S.freed[m] + 120 + r() * 200, best + hold[m]);
        if (f < fall[m]) fall[m] = f;
      }
    }
    let last = 0;
    for (let L = 1; L <= n; L++) if (fall[L] !== Infinity) last = Math.max(last, fall[L]);
    for (let L = 1; L <= n; L++) if (fall[L] === Infinity) fall[L] = last + 200 + r() * 300;
    return fall;
  }

  function build(w, h, seed, focus) {
    const B = new Builder(w, h, seed);
    const main = B.mainCrack();

    // The impact, just above the input box.
    // The impact lands anywhere along the input box, a little above it.
    const fw = focus.w || 300;
    const O = {
      x: Math.min(w - 20, Math.max(20, focus.x + B.U(-0.42, 0.42) * fw)),
      y: Math.min(h - 20, Math.max(20, focus.y + B.U(-60, 12)))
    };
    B.origins.push({ x: O.x, y: O.y, t: 0 });
    const forkA = B.U(80, 150);
    const first = B.radials(O, 0, 8 + Math.floor(B.r() * 10), {
      onCrack: -1, speed: [B.U(1.9, 2.4), B.U(2.6, 3.3)], w: B.U(1.15, 1.45), dieP: B.U(0.05, 0.22),
      stop: B.U(0.4, 0.8), fork: [forkA, forkA + B.U(80, 180)]
    });
    B.rings(O, first, { r0: B.U(6, 18), f: [B.U(1.12, 1.28), B.U(1.32, 1.6)], density: B.U(0.8, 1), maxChord: B.U(240, 340) });
    B.splinters(O);

    // The cascade: new fractures start from the long crack and from other
    // cracks, each a little later and farther from the ones before.
    // How many, and when, changes every time.
    let t0 = B.U(650, 1300);
    for (let k = 0, n = 1 + Math.floor(B.r() * 4); k < n; k++) {
      const onMain = k === 0 && B.r() < 0.7;
      const p = B.farthest(onMain ? B.samplePoints(80, function (c) { return c.id === main.id; })
        : B.samplePoints(220, function (c) { return c.kind !== 'splinter'; }));
      if (p) B.cascade(p, t0, p.id);
      t0 += B.U(550, 1300);
    }

    const cs = Math.max(1, Math.sqrt(w * h / 2.4e6));
    let S = raster(B, cs);

    // Any slab that is still large cracks again around the time it comes
    // loose, so big pieces mostly turn up near the edges of the screen.
    for (let pass = 0; pass < 3; pass++) {
      const limit = Math.max(9000, 0.022 * w * h);
      const big = [];
      for (let L = 1; L <= S.n; L++) if (S.area[L] * cs * cs > limit) big.push(L);
      if (!big.length) break;
      big.sort(function (a, b) { return S.area[b] - S.area[a]; });
      big.slice(0, 10).forEach(function (L) {
        let px = S.sx[L] / S.area[L] * cs, py = S.sy[L] / S.area[L] * cs;
        if (labelAt(S, px, py) !== L) {
          // The centroid of an odd-shaped slab can fall outside it; use any cell of it.
          for (let i = 0; i < S.lab.length; i += 7) if (S.lab[i] === L) { px = (i % S.GW) * cs; py = ((i / S.GW) | 0) * cs; break; }
        }
        const P = { x: px, y: py };
        const t0 = S.freed[L] + B.U(60, 300);
        B.origins.push({ x: P.x, y: P.y, t: t0 });
        const ids = B.radials(P, t0, 3 + Math.floor(B.r() * 3), {
          onCrack: -1, speed: [1.8, 2.4], w: 1.1, dieP: 0, stop: 1, fork: [200, 400]
        });
        B.rings(P, ids, { r0: B.U(30, 60), f: [1.5, 1.9], density: 0.75, maxChord: 240 });
      });
      S = raster(B, cs);
    }

    const fall = fallTimes(B, S, O);
    const order = [];
    for (let L = 1; L <= S.n; L++) order.push(L);
    order.sort(function (a, b) { return fall[a] - fall[b]; });

    B.cracks.forEach(finish.bind(null, B));
    return { w: w, h: h, cracks: B.cracks, impact: O, S: S, fall: fall, order: order, r: B.r };
  }

  // Per-segment width and brightness. Brightness drifts along the crack, with
  // the odd bright glint where the edge catches the light.
  function finish(B, c) {
    const n = c.pts.length - 1;
    c.segW = new Float32Array(n); c.segA = new Float32Array(n); c.done = new Float32Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) total += dist(c.pts[i], c.pts[i + 1]);
    let s = 0, v = B.gauss(), glint = 0;
    c.tMin = Infinity;
    for (let i = 0; i < n; i++) {
      c.tMin = Math.min(c.tMin, c.t[i], c.t[i + 1]);
      s += dist(c.pts[i], c.pts[i + 1]);
      v = v * 0.9 + B.gauss() * 0.3;
      if (!glint && B.r() < 0.02) glint = 2 + Math.floor(B.r() * 3);
      let a = c.alpha * (0.66 + 0.34 * Math.tanh(v)), w = c.w;
      if (glint) { glint--; a = Math.min(1, c.alpha * 1.3); w += 0.35; }
      if (c.dangling) { const k = Math.min(1, (total - s) / 30); w *= 0.35 + 0.65 * k; a *= 0.45 + 0.55 * k; }
      c.segW[i] = w; c.segA[i] = a;
    }
    c.complete = false;
  }

  // ---------------------------------------------------------------------------
  // Glass
  // ---------------------------------------------------------------------------

  function Glass(opts) {
    this.crackCanvas = opts.crack;
    this.holeCanvas = opts.hole;
    this.cctx = this.crackCanvas.getContext('2d');
    this.hctx = this.holeCanvas.getContext('2d');
    this.mask = document.createElement('canvas');
    this.mctx = this.mask.getContext('2d');
    this.matrix = opts.matrix;
    this.reduced = opts.reduced;
    this.colorAt = opts.colorAt || function () { return [33, 33, 33]; };
    this.onCrack = opts.onCrack || function () {};
    this.onShatter = opts.onShatter || function () {};
    this.onShattered = opts.onShattered || function () {};
    this.onHalf = opts.onHalf || function () {}; // half the glass has started to fall
    this.halfDone = false;
    this.seed = opts.seed || (Math.random() * 1e9) | 0;
    this.geo = null;
    this.focus = { x: 0, y: 0 };
    this.tCrack = 0; this.tShatter = 0; this.extra = 0;
    this.shattered = false;
    this.sprites = [];
  }

  Glass.prototype.resize = function (w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    [this.crackCanvas, this.holeCanvas, this.mask].forEach(function (c) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    });
    if (this.matrix) this.matrix.resize(w, h, dpr);
    // Before the first crack the layout is free to change. After it, keep
    // the same cracks unless the screen grew past them (a phone keyboard
    // closing, say, should not redraw the whole fracture).
    if (this.geo && (!this.tCrack || w > this.geo.w + 1 || h > this.geo.h + 1)) this.geo = null;
    this.dirty = true;
  };

  Glass.prototype.setFocus = function (x, y, w) {
    if (!this.tCrack && (Math.abs(x - this.focus.x) > 1 || Math.abs(y - this.focus.y) > 1)) this.geo = null;
    this.focus = { x: x, y: y, w: w || 0 };
  };

  // Builds the fracture ahead of time so the first crack doesn't stall.
  Glass.prototype.prepare = function () {
    if (!this.geo && this.w) { this.geo = build(this.w, this.h, this.seed, this.focus); this.dirty = true; }
  };

  Glass.prototype.crack = function (now) {
    if (this.tCrack) return;
    this.prepare();
    this.tCrack = now;
    this.onCrack();
  };

  Glass.prototype.shatter = function (now) {
    if (this.tShatter) return;
    if (!this.tCrack) this.crack(now);
    this.tShatter = now;
    this.onShatter();
  };

  // Typing after the shatter hurries it along.
  Glass.prototype.boost = function (ms) { if (this.tShatter) this.extra += ms; };

  Glass.prototype.reset = function () {
    const W = this.crackCanvas.width, H = this.crackCanvas.height;
    this.cctx.setTransform(1, 0, 0, 1, 0, 0); this.cctx.clearRect(0, 0, W, H);
    this.mctx.setTransform(1, 0, 0, 1, 0, 0); this.mctx.clearRect(0, 0, W, H);
    this.hctx.setTransform(1, 0, 0, 1, 0, 0); this.hctx.clearRect(0, 0, W, H);
    this.geo.cracks.forEach(function (c) { c.done.fill(0); c.complete = false; });
    this.fallen = new Uint8Array(this.geo.S.n + 1);
    this.next = 0;
    this.anyFallen = false;
    this.fallenArea = 0;
    this.bruised = false;
    this.sprites = [];
    if (this.shattered) this.fillAll();
    this.dirty = false;
  };

  Glass.prototype.frame = function (now) {
    if (!this.tCrack) return;
    if (!this.geo) this.prepare();
    if (this.dirty) this.reset();
    const tc = this.reduced ? Infinity : now - this.tCrack;
    const ts = this.tShatter ? now - this.tShatter + this.extra : -Infinity;
    const tsReveal = this.tShatter && this.reduced ? Infinity : ts;

    if (!this.shattered) {
      this.drawCracks(tc, tsReveal);
      if (this.tShatter) {
        if (!this.bruised) this.bruise();
        const g = this.geo;
        while (this.next < g.order.length && g.fall[g.order[this.next]] <= ts) {
          const L = g.order[this.next++];
          this.drop(L, ts - g.fall[L]);
        }
        if (this.next >= g.order.length) {
          this.shattered = true;
          this.fillAll();
          this.onShattered();
        }
      }
    }

    if (this.anyFallen || this.shattered) {
      if (this.matrix) this.matrix.update(now);
      this.drawHole(now);
    }
  };

  // Draws whatever part of each crack has formed since the last frame.
  Glass.prototype.drawCracks = function (tc, ts) {
    const ctx = this.cctx, d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.lineCap = 'round';
    const cracks = this.geo.cracks;
    for (let k = 0; k < cracks.length; k++) {
      const c = cracks[k];
      if (c.complete) continue;
      const T = c.phase ? ts : tc;
      if (T < c.tMin) continue;
      let all = true;
      for (let i = 0; i < c.done.length; i++) {
        if (c.done[i] >= 1) continue;
        let a = c.pts[i], b = c.pts[i + 1], ta = c.t[i], tb = c.t[i + 1];
        if (tb < ta) { const p = a; a = b; b = p; const q = ta; ta = tb; tb = q; }
        const f = T >= tb ? 1 : T <= ta ? 0 : (T - ta) / (tb - ta);
        if (f < 1) all = false;
        if (f <= c.done[i]) continue;
        const f0 = c.done[i];
        c.done[i] = f;
        const x0 = a.x + (b.x - a.x) * f0, y0 = a.y + (b.y - a.y) * f0;
        const x1 = a.x + (b.x - a.x) * f, y1 = a.y + (b.y - a.y) * f;
        const w = c.segW[i], al = c.segA[i];
        ctx.beginPath(); ctx.moveTo(x0 + 0.7, y0 + 0.9); ctx.lineTo(x1 + 0.7, y1 + 0.9);
        ctx.strokeStyle = 'rgba(0,0,0,' + (0.5 * al).toFixed(3) + ')'; ctx.lineWidth = w + 0.8; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        ctx.strokeStyle = 'rgba(226,236,242,' + al.toFixed(3) + ')'; ctx.lineWidth = w; ctx.stroke();
        if (c.kind === 'main') {
          // The far face of the crack, seen faintly through the glass.
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const ox = -(b.y - a.y) / len * 1.8, oy = (b.x - a.x) / len * 1.8;
          ctx.beginPath(); ctx.moveTo(x0 + ox, y0 + oy); ctx.lineTo(x1 + ox, y1 + oy);
          ctx.strokeStyle = 'rgba(200,222,232,' + (0.2 * al).toFixed(3) + ')'; ctx.lineWidth = 0.8; ctx.stroke();
        }
      }
      if (all) c.complete = true;
    }
  };

  // A frosted, crushed patch where the glass was hit.
  Glass.prototype.bruise = function () {
    this.bruised = true;
    const ctx = this.cctx, O = this.geo.impact, r = rng(this.seed ^ 0x5bd1);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (let k = 0; k < 7; k++) {
      const a = r() * TAU, d = r() * 5, rad = 4 + r() * 10;
      const x = O.x + Math.cos(a) * d, y = O.y + Math.sin(a) * d;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(232,240,246,' + (0.1 + r() * 0.12).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(232,240,246,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      // Ragged outline, not a circle.
      for (let i = 0; i < 9; i++) {
        const b = i / 9 * TAU, rr = rad * (0.6 + r() * 0.5);
        if (i) ctx.lineTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr); else ctx.moveTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr);
      }
      ctx.closePath(); ctx.fill();
    }
  };

  function toCanvas(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }

  // Shard L leaves the glass: cut it out of the screen, light up the broken
  // edge it leaves behind, and send a copy of it falling.
  Glass.prototype.drop = function (L, age) {
    const g = this.geo, S = g.S, lab = S.lab, GW = S.GW, GH = S.GH, cs = S.cs, d = this.dpr;
    const fallen = this.fallen;
    const bx = Math.max(0, S.x0[L] - 1), by = Math.max(0, S.y0[L] - 1);
    const bw = Math.min(GW, S.x1[L] + 2) - bx, bh = Math.min(GH, S.y1[L] + 2) - by;
    const areaPx = S.area[L] * cs * cs;
    const sprite = !this.reduced && age < 1400 && areaPx >= 25 && this.sprites.length < MAX_SPRITES;

    const dil = new ImageData(bw, bh), rim = new ImageData(bw, bh);
    const tex = sprite ? new ImageData(bw, bh) : null;
    const shade = sprite ? 0.9 + g.r() * 0.2 : 1, sheenA = g.r() * TAU;
    const sc = Math.cos(sheenA) / Math.max(1, bw), ss = Math.sin(sheenA) / Math.max(1, bh);
    let rimN = 0;
    for (let y = 0; y < bh; y++) {
      const gy = by + y;
      for (let x = 0; x < bw; x++) {
        const gx = bx + x, i = gy * GW + gx, p = (y * bw + x) * 4;
        const inL = lab[i] === L;
        let touch = inL, edge = false;
        for (let oy = -1; oy <= 1; oy++) {
          const yy = gy + oy; if (yy < 0 || yy >= GH) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const xx = gx + ox; if (xx < 0 || xx >= GW || (!ox && !oy)) continue;
            if (lab[yy * GW + xx] === L) touch = true; else if (inL) edge = true;
          }
        }
        if (!touch) continue;
        dil.data[p + 3] = 255;
        if (!inL && !fallen[lab[i]]) {
          // Light from the upper left catches edges that face it.
          const up = (gy > 0 && lab[i - GW] === L) || (gx > 0 && lab[i - 1] === L);
          rim.data[p] = 214; rim.data[p + 1] = 232; rim.data[p + 2] = 236;
          rim.data[p + 3] = up ? 215 : 120;
          rimN++;
        }
        if (tex) {
          const base = this.colorAt(gx * cs, gy * cs);
          const l = shade * (0.92 + 0.16 * (x * sc + y * ss));
          if (!inL) {
            tex.data[p] = base[0] * l + 70; tex.data[p + 1] = base[1] * l + 88; tex.data[p + 2] = base[2] * l + 86; tex.data[p + 3] = 150;
          } else if (edge) {
            tex.data[p] = base[0] * l + 26; tex.data[p + 1] = base[1] * l + 34; tex.data[p + 2] = base[2] * l + 34; tex.data[p + 3] = 245;
          } else {
            tex.data[p] = base[0] * l + 3; tex.data[p + 1] = base[1] * l + 5; tex.data[p + 2] = base[2] * l + 6; tex.data[p + 3] = 245;
          }
        }
      }
    }
    const X = bx * cs * d, Y = by * cs * d, W = bw * cs * d, H = bh * cs * d;
    const dilC = toCanvas(dil);
    this.mctx.setTransform(1, 0, 0, 1, 0, 0);
    this.mctx.drawImage(dilC, X, Y, W, H);
    // Erase the crack lines a little past the piece's outline: a line is a few
    // pixels wide, with a shadow and a faint second edge, and slivers of it
    // would otherwise hang over the hole. The bright broken edge on the glass
    // still standing is drawn back in just after.
    const cc = this.cctx, k = cs * d;
    cc.setTransform(1, 0, 0, 1, 0, 0);
    cc.globalCompositeOperation = 'destination-out';
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (o) {
      cc.drawImage(dilC, X + o[0] * k, Y + o[1] * k, W, H);
    });
    cc.globalCompositeOperation = 'source-over';
    if (rimN) cc.drawImage(toCanvas(rim), X, Y, W, H);
    fallen[L] = 1;
    this.fallenArea += S.area[L];
    if (!this.halfDone && this.fallenArea >= 0.5 * GW * GH) { this.halfDone = true; this.onHalf(); }
    this.anyFallen = true;

    if (sprite) {
      const O = g.impact, size = Math.sqrt(areaPx);
      const cx = (bx + bw / 2) * cs, cy = (by + bh / 2) * cs;
      const dd = Math.hypot(cx - O.x, cy - O.y) || 1, r = g.r;
      // Only pieces near the impact, in the first moments, get a push from the
      // blow. Everything else simply loses its support and starts from rest.
      const pop = Math.exp(-dd / 260) * Math.max(0, 1 - g.fall[L] / 900) * (40 + r() * 90) / (1 + size / 120);
      this.sprites.push({
        tex: toCanvas(tex), w: bw * cs, h: bh * cs,
        x: cx, y: cy,
        vx: (cx - O.x) / dd * pop + (r() - 0.5) * 8, vy: -pop * (0.2 + r() * 0.5),
        // Falling away from the viewer, slowly at first.
        z: 0, vz: pop / 400 + r() * 0.04, az: 0.5 + r() * 1.1 + 6 / (size + 20),
        // Tilt and spin build up as the piece tips off its last edge.
        axis: r() * Math.PI, tilt: 0, vtMax: (1.0 + r() * 3.0) / (1 + size / 140) * (r() < 0.5 ? -1 : 1),
        rot: 0, vrMax: (r() - 0.5) * 2.0 / (1 + size / 180), spin: 0.25 + r() * 0.35,
        glint: r() * TAU, age: 0
      });
      // A sprite dropped late (after a resize or a jump) starts partway through.
      if (age > 0) this.stepSprite(this.sprites[this.sprites.length - 1], age / 1000);
    }
  };

  Glass.prototype.fillAll = function () {
    this.mctx.setTransform(1, 0, 0, 1, 0, 0);
    this.mctx.fillStyle = '#000';
    this.mctx.fillRect(0, 0, this.mask.width, this.mask.height);
    this.cctx.setTransform(1, 0, 0, 1, 0, 0);
    this.cctx.clearRect(0, 0, this.crackCanvas.width, this.crackCanvas.height);
  };

  // Exact steps for constant acceleration, so the motion is the same at any
  // frame rate. Long gaps are split up so a late shard lands where it should.
  Glass.prototype.stepSprite = function (s, dt) {
    while (dt > 0) {
      const h = Math.min(dt, 1 / 60);
      dt -= h;
      s.x += s.vx * h;
      s.y += s.vy * h + 0.5 * GRAVITY * h * h;
      s.vy += GRAVITY * h;
      s.z += s.vz * h + 0.5 * s.az * h * h;
      s.vz += s.az * h;
      // Angular speed eases up from zero over the first fraction of a second.
      const u = Math.min(1, (s.age + h / 2) / s.spin), ramp = u * u * (3 - 2 * u);
      s.tilt += s.vtMax * ramp * h;
      s.rot += s.vrMax * ramp * h;
      s.age += h;
    }
  };

  Glass.prototype.drawHole = function (now) {
    const ctx = this.hctx, d = this.dpr;
    const dt = this.lastHole ? Math.min(now - this.lastHole, 100) / 1000 : 0;
    this.lastHole = now;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.holeCanvas.width, this.holeCanvas.height);
    ctx.drawImage(this.mask, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    if (this.matrix) ctx.drawImage(this.matrix.canvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    // Shards fall away from the viewer: they drop, turn over in depth, shrink,
    // and flash when a face catches the light.
    const keep = [];
    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i];
      this.stepSprite(s, dt);
      const k = 1 / (1 + s.z);
      if (k < 0.3 || s.y - s.h * k > this.h + 40) continue;
      keep.push(s);
      const ct = Math.cos(s.tilt), ca = Math.cos(s.axis), sa = Math.sin(s.axis);
      // Squash along the tilt axis: R(axis) · scale(1, cos tilt) · R(-axis).
      const t00 = ca * ca + ct * sa * sa, t01 = (1 - ct) * sa * ca, t11 = sa * sa + ct * ca * ca;
      const cr = Math.cos(s.rot), sr = Math.sin(s.rot), m = d * k;
      const a = m * (cr * t00 - sr * t01), b = m * (sr * t00 + cr * t01);
      const c = m * (cr * t01 - sr * t11), e = m * (sr * t01 + cr * t11);
      ctx.setTransform(a, b, c, e, s.x * d, s.y * d);
      const fade = Math.min(1, (k - 0.3) / 0.25);
      ctx.globalAlpha = fade * (0.55 + 0.45 * Math.abs(ct));
      ctx.drawImage(s.tex, -s.w / 2, -s.h / 2, s.w, s.h);
      const gl = Math.pow(Math.max(0, Math.sin(s.tilt + s.glint)), 8) * 0.55 * fade;
      if (gl > 0.02) {
        ctx.globalAlpha = gl;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(s.tex, -s.w / 2, -s.h / 2, s.w, s.h);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.globalAlpha = 1;
    this.sprites = keep;
  };

  Glass.TOTAL_MS = TOTAL_MS;
  window.Glass = Glass;
})();
