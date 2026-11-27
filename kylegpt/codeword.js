/*
 * A menu word drawn as glowing lettering made of streaming code, standing in
 * front of the rain:
 *   - dense vertical strands of code run down inside the letters, over a
 *     luminous green body and a fainter layer of glyphs;
 *   - the top and right edges of each letter burn almost white;
 *   - a wide green bloom surrounds the word, and its light falls on the
 *     "floor" beneath it;
 *   - strands drip a little past the bottoms of the letters, specks of light
 *     flicker at the edges, and the whole word shimmers slightly.
 * The word itself holds still; only its code moves. It appears by filling
 * with falling code from the top.
 *
 * Drawing: everything that doesn't move (letter shapes, rim, glow) is drawn
 * once. Each frame the moving strands are drawn as thin rectangles, the
 * result is cut to the letter shapes, and the glow goes underneath.
 */
(function () {
  'use strict';

  const GLYPHS = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789:=*+<>';
  const STEP_MS = 50;
  const FONT = function (px) { return '800 ' + px + 'px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'; };

  function CodeWord(text, reduced) {
    this.text = text;
    this.reduced = reduced;
    this.view = document.createElement('canvas');
    this.view.className = 'code-word';
    this.view.setAttribute('aria-hidden', 'true');
    this.ctx = this.view.getContext('2d');
    this.hover = 0; this.hoverTo = 0;
    this.formAt = Infinity;   // when it starts filling
    this.formed = false;
  }

  CodeWord.measure = function (text, size) {
    const c = document.createElement('canvas').getContext('2d');
    c.font = FONT(size);
    return c.measureText(text).width;
  };

  // Build everything for one size. x, y: where the text box sits (CSS px).
  CodeWord.prototype.build = function (size, x, y, dpr) {
    const text = this.text, d = this.dpr = dpr;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = FONT(size);
    const mt = probe.measureText(text);
    const asc = Math.ceil(mt.actualBoundingBoxAscent || size * 0.75);
    const desc = Math.ceil(mt.actualBoundingBoxDescent || size * 0.2);
    const pad = Math.round(size * 0.42);
    this.size = size; this.pad = pad;
    this.textW = Math.ceil(mt.width); this.textH = asc + desc;
    this.x = x; this.y = y;
    const w = this.w = this.textW + pad * 2, h = this.h = this.textH + pad * 2;
    const W = Math.round(w * d), H = Math.round(h * d);
    const make = function () { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const text0 = function (ctx) { ctx.fillText(text, pad, pad + asc); };

    const v = this.view;
    v.width = W; v.height = H;
    v.style.width = w + 'px'; v.style.height = h + 'px';
    v.style.left = -pad + 'px'; v.style.top = -pad + 'px';   // relative to the link, which sits on the text
    v.style.transformOrigin = pad + 'px ' + pad + 'px';

    // The exact letter shapes.
    this.mask = make();
    const mc = this.mask.getContext('2d');
    mc.setTransform(d, 0, 0, d, 0, 0);
    mc.font = FONT(size); mc.fillStyle = '#fff';
    text0(mc);

    // The letters' body: dark backing so the rain doesn't show through,
    // then the luminous green the code runs over.
    this.body = make();
    const bc = this.body.getContext('2d');
    bc.setTransform(d, 0, 0, d, 0, 0);
    bc.font = FONT(size);
    bc.fillStyle = 'rgb(2, 22, 9)'; text0(bc);
    const grad = bc.createLinearGradient(0, pad, 0, pad + this.textH);
    grad.addColorStop(0, 'rgba(90, 255, 150, 0.62)');
    grad.addColorStop(1, 'rgba(40, 210, 110, 0.46)');
    bc.fillStyle = grad; text0(bc);

    // The bright rim: the letters minus a copy nudged down and to the left
    // leaves their top and right edges, which burn almost white.
    this.rim = make();
    const rc = this.rim.getContext('2d');
    rc.setTransform(d, 0, 0, d, 0, 0);
    rc.font = FONT(size);
    rc.fillStyle = 'rgba(236, 255, 242, 0.95)';
    rc.shadowColor = 'rgba(200, 255, 220, 0.9)'; rc.shadowBlur = 2 * d;
    text0(rc);
    rc.globalCompositeOperation = 'destination-out';
    rc.shadowBlur = 0;
    const nudge = Math.max(1.5, size * 0.03);
    rc.fillText(text, pad - nudge, pad + asc + nudge);

    // The bloom around the word and the light it throws below.
    this.glow = make();
    const gc = this.glow.getContext('2d');
    gc.setTransform(d, 0, 0, d, 0, 0);
    gc.font = FONT(size);
    const fy = pad + this.textH + size * 0.08;
    const floor = gc.createRadialGradient(pad + this.textW / 2, fy, 0, pad + this.textW / 2, fy, this.textW * 0.55);
    floor.addColorStop(0, 'rgba(70, 255, 140, 0.28)');
    floor.addColorStop(1, 'rgba(70, 255, 140, 0)');
    gc.save();
    gc.translate(0, fy);
    gc.scale(1, 0.22);
    gc.translate(0, -fy);
    gc.fillStyle = floor;
    gc.fillRect(0, fy - h * 3, w, h * 6);
    gc.restore();
    gc.shadowColor = 'rgba(60, 255, 130, 0.95)';
    gc.shadowBlur = size * 0.42 * d;
    gc.fillStyle = 'rgba(60, 255, 130, 0.28)';
    text0(gc);
    gc.shadowColor = 'rgba(150, 255, 190, 0.9)';
    gc.shadowBlur = size * 0.12 * d;
    text0(gc);

    // Where the letters are, column by column, for the strands and drips.
    const md = mc.getImageData(0, 0, W, H).data;
    const sw = this.sw = Math.max(2, Math.round(size / 34 * d));   // strand width, device px
    this.cols = [];
    for (let cx = 0; cx < W; cx += sw) {
      const sx = Math.min(W - 1, cx + (sw >> 1));
      let top = -1, bottom = -1;
      for (let yy = 0; yy < H; yy++) {
        if (md[(yy * W + sx) * 4 + 3] > 80) { if (top < 0) top = yy; bottom = yy; }
      }
      if (top < 0) continue;
      const col = { x: cx, top: top, bottom: bottom, strands: [] };
      for (let k = 0; k < 2; k++) col.strands.push(this.strand(top + Math.random() * (bottom - top)));
      this.cols.push(col);
    }

    // A faint layer of glyphs inside the letters, changing now and then.
    const cell = this.cell = Math.max(6, Math.round(size / 9));
    this.tex = make();
    const tc = this.tctx = this.tex.getContext('2d');
    tc.font = Math.round(cell * d * 0.95) + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    tc.textBaseline = 'top';
    this.gcols = Math.ceil(W / (cell * d)); this.grows = Math.ceil(H / (cell * d));
    for (let i = 0; i < this.gcols * this.grows; i++) this.glyph(i);

    this.comp = make();
    this.cctx = this.comp.getContext('2d');
    this.sparks = [];
    this.drips = [];
    this.acc = 0; this.last = 0; this.dirty = true;
    if (!this.formed) this.form(this.formAt);   // a rebuild mid-fill starts the fill over
  };

  CodeWord.prototype.strand = function (y) {
    const H = this.textH * this.dpr;
    return {
      y: y,
      len: H * (0.08 + Math.random() * 0.35),
      v: H * (0.45 + Math.random() * 0.9),       // device px per second
      a: 0.35 + Math.random() * 0.55,
      head: Math.random() < 0.55
    };
  };

  CodeWord.prototype.glyph = function (i) {
    const t = this.tctx, cp = this.cell * this.dpr;
    const c = i % this.gcols, r = (i / this.gcols) | 0;
    t.clearRect(c * cp, r * cp, cp, cp);
    t.fillStyle = 'rgba(200, 255, 220, ' + (0.25 + Math.random() * 0.45).toFixed(2) + ')';
    t.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], c * cp, r * cp);
  };

  // Every so often: a few glyphs change, a speck of light flickers at an
  // edge, and a strand drips past the bottom of a letter.
  CodeWord.prototype.step = function () {
    const n = Math.max(2, (this.gcols * this.grows * 0.04) | 0);
    for (let k = 0; k < n; k++) this.glyph((Math.random() * this.gcols * this.grows) | 0);
    if (this.cols.length && Math.random() < 0.45) {
      const col = this.cols[(Math.random() * this.cols.length) | 0];
      const top = Math.random() < 0.5;
      this.sparks.push({ x: col.x + Math.random() * this.sw * 2 - this.sw, y: top ? col.top - Math.random() * 3 * this.dpr : col.bottom + Math.random() * 3 * this.dpr, life: 1 });
    }
    if (this.cols.length && Math.random() < 0.3 && this.drips.length < 6) {
      const col = this.cols[(Math.random() * this.cols.length) | 0];
      this.drips.push({ col: col, len: 0, max: this.size * this.dpr * (0.08 + Math.random() * 0.22), life: 1 });
    }
    const sparks = [];
    this.sparks.forEach(function (s) { s.life -= 0.25; if (s.life > 0) sparks.push(s); });
    this.sparks = sparks;
  };

  CodeWord.prototype.form = function (at) {
    this.formAt = at;
    this.formed = !!this.reduced;
    this.dirty = true;
    this.fill = [];
    const n = this.cols ? this.cols.length : 0;
    for (let c = 0; c < n; c++) this.fill.push({ delay: Math.random() * 650, dur: 240 + Math.random() * 380 });
  };

  CodeWord.prototype.frame = function (now) {
    if (!this.cols) return;
    const dt = this.last ? Math.min(now - this.last, 100) / 1000 : 0;
    this.last = now;
    const t = now - this.formAt;
    if (t < 0) { if (this.dirty) { this.ctx.clearRect(0, 0, this.view.width, this.view.height); this.dirty = false; } return; }
    const moving = !this.reduced;
    if (!moving && !this.dirty && this.formed && Math.abs(this.hover - this.hoverTo) < 0.01) return;
    this.dirty = false;
    if (moving) {
      this.acc += dt * 1000;
      while (this.acc >= STEP_MS) { this.step(); this.acc -= STEP_MS; }
    }
    this.hover += (this.hoverTo - this.hover) * Math.min(1, dt * 12 || 1);

    const cc = this.cctx, W = this.comp.width, H = this.comp.height, self = this;
    // A slow shimmer in overall brightness.
    const shimmer = moving ? 0.93 + 0.05 * Math.sin(now / 370) + 0.03 * Math.sin(now / 113 + 1.7) : 1;
    const lift = 0.85 + 0.15 * this.hover;

    cc.globalCompositeOperation = 'source-over';
    cc.globalAlpha = 1;
    cc.clearRect(0, 0, W, H);
    cc.drawImage(this.body, 0, 0);
    cc.globalCompositeOperation = 'lighter';
    cc.globalAlpha = 0.5 * shimmer;
    cc.drawImage(this.tex, 0, 0);

    // The strands of code running down the letters.
    const sw = this.sw;
    this.cols.forEach(function (col) {
      col.strands.forEach(function (s, k) {
        if (moving) {
          s.y += s.v * dt;
          if (s.y - s.len > col.bottom) col.strands[k] = s = self.strand(col.top - Math.random() * 40 * self.dpr);
        }
        const y0 = Math.max(col.top, s.y - s.len), y1 = Math.min(col.bottom + 1, s.y);
        if (y1 <= y0) return;
        cc.globalAlpha = s.a * shimmer * lift;
        cc.fillStyle = 'rgb(120, 255, 170)';
        cc.fillRect(col.x, y0, sw - 1, y1 - y0);
        if (s.head && s.y <= col.bottom) {
          cc.globalAlpha = Math.min(1, s.a + 0.3) * lift;
          cc.fillStyle = 'rgb(236, 255, 242)';
          cc.fillRect(col.x, Math.max(y0, s.y - sw * 2), sw - 1, sw * 2);
        }
      });
    });
    cc.globalAlpha = (0.75 + 0.25 * this.hover) * shimmer;
    cc.drawImage(this.rim, 0, 0);

    // Cut everything to the letter shapes.
    cc.globalAlpha = 1;
    cc.globalCompositeOperation = 'destination-in';
    cc.drawImage(this.mask, 0, 0);

    // Past the edges: drips below the letters and flickering specks.
    cc.globalCompositeOperation = 'lighter';
    const drips = [];
    this.drips.forEach(function (dr) {
      if (moving) { dr.len = Math.min(dr.max, dr.len + dr.max * dt * 3); if (dr.len >= dr.max) dr.life -= dt * 2.5; }
      if (dr.life <= 0) return;
      drips.push(dr);
      const g = cc.createLinearGradient(0, dr.col.bottom, 0, dr.col.bottom + dr.len);
      g.addColorStop(0, 'rgba(150, 255, 190, ' + (0.8 * dr.life).toFixed(2) + ')');
      g.addColorStop(1, 'rgba(150, 255, 190, 0)');
      cc.globalAlpha = 1;
      cc.fillStyle = g;
      cc.fillRect(dr.col.x, dr.col.bottom, sw - 1, dr.len);
    });
    this.drips = drips;
    this.sparks.forEach(function (s) {
      cc.globalAlpha = s.life;
      cc.fillStyle = '#eafff0';
      cc.fillRect(s.x, s.y, sw, sw);
    });
    cc.globalAlpha = 1;
    cc.globalCompositeOperation = 'source-over';

    // While filling, each column shows code only down to its fill line.
    let fillAll = 1;
    if (!this.formed) {
      let done = true;
      for (let c = 0; c < this.cols.length; c++) {
        const f = this.fill[c], col = this.cols[c];
        let u = (t - f.delay) / f.dur;
        u = u <= 0 ? 0 : u >= 1 ? 1 : u * u;   // pours faster as it goes
        if (u >= 1) continue;
        done = false;
        const y = col.top + u * (col.bottom - col.top + 4);
        cc.clearRect(col.x, y, sw, H - y);
        if (u > 0) { cc.fillStyle = '#f2fff6'; cc.fillRect(col.x, y - sw * 2, sw - 1, sw * 2); }
      }
      fillAll = Math.min(1, t / 1000);
      if (done) this.formed = true;
    }

    const v = this.ctx;
    v.clearRect(0, 0, this.view.width, this.view.height);
    v.globalAlpha = (0.8 + 0.2 * this.hover) * fillAll * shimmer;
    v.drawImage(this.glow, 0, 0);
    if (this.hover > 0.02) { v.globalAlpha = 0.6 * this.hover * fillAll; v.drawImage(this.glow, 0, 0); }
    v.globalAlpha = 1;
    v.drawImage(this.comp, 0, 0);
  };

  window.CodeWord = CodeWord;
})();
