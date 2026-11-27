/*
 * A menu word drawn as large lettering made of code: fine glyphs stream
 * down inside the letter shapes, brighter and whiter than the rain around
 * them, with a soft glow. The word is the most solid thing on screen.
 *
 * It forms by filling: falling code pours into each letter from the top.
 * A drop of rain landing on it makes the code in that spot flare.
 *
 * Drawing: the glyphs live on their own canvas and only the cells that
 * change are redrawn, from a pre-rendered sheet of glyphs. Each frame the
 * glyph layer is cut to the exact letter shapes and laid over a glow.
 */
(function () {
  'use strict';

  const GLYPHS = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789:=*+<>';
  // Glyph brightness: resting, trail, near the head, the head itself.
  const LEVELS = ['rgba(178, 255, 206, 0.82)', 'rgba(214, 255, 228, 0.94)', 'rgba(240, 255, 245, 1)', '#ffffff'];
  const STEP_MS = 50;
  const FONT = function (px) { return '800 ' + px + 'px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'; };

  // One sheet of every glyph at every brightness, per glyph size.
  const sheets = new Map();
  function sheet(cell, dpr) {
    const k = cell + '@' + dpr;
    if (sheets.has(k)) return sheets.get(k);
    const c = document.createElement('canvas'), px = Math.round(cell * dpr);
    c.width = px * GLYPHS.length; c.height = px * LEVELS.length;
    const ctx = c.getContext('2d');
    ctx.font = Math.round(px * 0.92) + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    LEVELS.forEach(function (col, l) {
      ctx.fillStyle = col;
      for (let g = 0; g < GLYPHS.length; g++) ctx.fillText(GLYPHS[g], g * px + px * 0.1, l * px);
    });
    const out = { canvas: c, px: px };
    sheets.set(k, out);
    return out;
  }

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
    const pad = Math.round(size * 0.32);
    this.size = size; this.pad = pad;
    this.textW = Math.ceil(mt.width); this.textH = asc + desc;
    this.x = x; this.y = y;
    const w = this.w = this.textW + pad * 2, h = this.h = this.textH + pad * 2;

    const make = function () { const c = document.createElement('canvas'); c.width = Math.round(w * d); c.height = Math.round(h * d); return c; };
    const v = this.view;
    v.width = Math.round(w * d); v.height = Math.round(h * d);
    v.style.width = w + 'px'; v.style.height = h + 'px';
    v.style.left = -pad + 'px'; v.style.top = -pad + 'px';   // relative to the link, which sits on the text
    v.style.transformOrigin = pad + 'px ' + pad + 'px';

    // The exact letter shapes.
    this.mask = make();
    const mc = this.mask.getContext('2d');
    mc.setTransform(d, 0, 0, d, 0, 0);
    mc.font = FONT(size); mc.fillStyle = '#fff';
    mc.fillText(text, pad, pad + asc);

    // A faint solid body, so the letters read even where the code is sparse.
    this.body = make();
    const bc = this.body.getContext('2d');
    bc.drawImage(this.mask, 0, 0);
    bc.globalCompositeOperation = 'source-in';
    bc.fillStyle = 'rgba(150, 255, 190, 0.36)';
    bc.fillRect(0, 0, this.body.width, this.body.height);

    // The halo around the letters.
    this.glow = make();
    const gc = this.glow.getContext('2d');
    gc.setTransform(d, 0, 0, d, 0, 0);
    gc.font = FONT(size);
    gc.shadowColor = 'rgba(80, 255, 150, 0.9)';
    gc.shadowBlur = size * 0.34 * d;
    gc.fillStyle = 'rgba(80, 255, 150, 0.22)';
    gc.fillText(text, pad, pad + asc);
    gc.shadowColor = 'rgba(190, 255, 215, 0.85)';
    gc.shadowBlur = size * 0.1 * d;
    gc.fillText(text, pad, pad + asc);

    // The glyph grid: only cells that touch a letter are ever drawn.
    const cell = this.cell = Math.max(6, Math.round(size / 11));
    this.cols = Math.ceil(w / cell); this.rows = Math.ceil(h / cell);
    this.sheet = sheet(cell, d);
    this.tex = make();
    this.tctx = this.tex.getContext('2d');
    this.comp = make();
    this.cctx = this.comp.getContext('2d');
    const md = mc.getImageData(0, 0, this.mask.width, this.mask.height).data, mw = this.mask.width;
    const cp = cell * d;
    this.inside = new Uint8Array(this.cols * this.rows);
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows; r++) {
        let hit = false;
        for (let yy = Math.floor(r * cp); yy < Math.min(this.mask.height, (r + 1) * cp) && !hit; yy += 2) {
          for (let xx = Math.floor(c * cp); xx < Math.min(mw, (c + 1) * cp); xx += 2) {
            if (md[(yy * mw + xx) * 4 + 3] > 20) { hit = true; break; }
          }
        }
        this.inside[r * this.cols + c] = hit ? 1 : 0;
      }
    }
    // Coverage at the rain's own grid, so the rain knows where the letters are solid.
    this.maskData = { data: md, w: mw, h: this.mask.height };

    this.glyph = new Uint8Array(this.cols * this.rows);
    this.level = new Uint8Array(this.cols * this.rows);
    for (let i = 0; i < this.glyph.length; i++) this.glyph[i] = (Math.random() * GLYPHS.length) | 0;
    this.heads = [];
    for (let c = 0; c < this.cols; c++) {
      this.heads.push({ y: -Math.random() * this.rows * 1.5, speed: 0.25 + Math.random() * 0.45 });
    }
    // Filling: each column fills from the top at its own moment and pace.
    this.fill = [];
    for (let c = 0; c < this.cols; c++) this.fill.push({ delay: Math.random() * 700, dur: 260 + Math.random() * 380 });
    for (let i = 0; i < this.inside.length; i++) if (this.inside[i]) this.paint(i);
    this.acc = 0; this.last = 0;
    this.dirty = true;
  };

  // How much of a rain cell (CSS px box) the letters cover, 0 to 1.
  CodeWord.prototype.coverage = function (cx, cy, s) {
    const m = this.maskData, d = this.dpr;
    const x0 = Math.round((cx - this.x + this.pad) * d), y0 = Math.round((cy - this.y + this.pad) * d);
    const n = Math.round(s * d);
    let hit = 0, all = 0;
    for (let yy = y0; yy < y0 + n; yy += 2) {
      for (let xx = x0; xx < x0 + n; xx += 2) {
        all++;
        if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h) continue;
        if (m.data[(yy * m.w + xx) * 4 + 3] > 100) hit++;
      }
    }
    return all ? hit / all : 0;
  };

  CodeWord.prototype.paint = function (i) {
    const sh = this.sheet, px = sh.px, cp = this.cell * this.dpr;
    const c = i % this.cols, r = (i / this.cols) | 0;
    const t = this.tctx;
    t.clearRect(c * cp, r * cp, cp, cp);
    t.drawImage(sh.canvas, this.glyph[i] * px, this.level[i] * px, px, px, c * cp, r * cp, cp, cp);
  };

  CodeWord.prototype.set = function (c, r, level, newGlyph) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return;
    const i = r * this.cols + c;
    if (!this.inside[i]) return;
    if (newGlyph) this.glyph[i] = (Math.random() * GLYPHS.length) | 0;
    if (this.level[i] === level && !newGlyph) return;
    this.level[i] = level;
    this.paint(i);
    this.dirty = true;
  };

  // One step of the code streaming down inside the letters.
  CodeWord.prototype.step = function () {
    const rows = this.rows;
    for (let c = 0; c < this.cols; c++) {
      const h = this.heads[c];
      const before = Math.floor(h.y);
      h.y += h.speed;
      const now = Math.floor(h.y);
      if (now !== before && now >= 0) {
        this.set(c, now, 3, true);
        this.set(c, now - 1, 2);
        this.set(c, now - 3, 1);
        this.set(c, now - 7, 0);
      }
      if (h.y - 8 > rows) { h.y = -Math.random() * rows; h.speed = 0.25 + Math.random() * 0.45; }
    }
    // A few glyphs change at random, as code does.
    const n = Math.max(1, (this.inside.length * 0.02) | 0);
    for (let k = 0; k < n; k++) {
      const i = (Math.random() * this.inside.length) | 0;
      if (this.inside[i]) { this.glyph[i] = (Math.random() * GLYPHS.length) | 0; this.paint(i); this.dirty = true; }
    }
  };

  // A drop of rain landed at x (CSS px, page coordinates): the code flares there.
  CodeWord.prototype.flare = function (x) {
    const c = Math.floor((x - this.x + this.pad) / this.cell);
    for (let dc = -1; dc <= 1; dc++) {
      for (let r = 0; r < this.rows; r++) {
        const i = r * this.cols + c + dc;
        if (c + dc < 0 || c + dc >= this.cols || !this.inside[i]) continue;
        // Only the top of the letter at that spot.
        this.set(c + dc, r, dc === 0 ? 3 : 2, true);
        this.set(c + dc, r + 1, 2);
        this.set(c + dc, r + 2, 1);
        break;
      }
    }
  };

  CodeWord.prototype.form = function (at) {
    this.formAt = at;
    this.formed = !!this.reduced;
    this.dirty = true;
  };

  CodeWord.prototype.frame = function (now) {
    if (!this.reduced) {
      if (!this.last) this.last = now;
      this.acc += Math.min(now - this.last, 200);
      this.last = now;
      while (this.acc >= STEP_MS) { this.step(); this.acc -= STEP_MS; }
    }
    // Ease the hover glow in and out.
    const target = this.hoverTo;
    if (Math.abs(this.hover - target) > 0.01) { this.hover += (target - this.hover) * 0.25; this.dirty = true; }
    const t = now - this.formAt;
    const filling = !this.formed && t >= 0;
    if (!this.dirty && !filling) return;
    if (t < 0) { this.ctx.clearRect(0, 0, this.view.width, this.view.height); return; }
    this.dirty = false;

    // Letters made of code: body plus glyphs, cut to the letter shapes.
    const cc = this.cctx, W = this.comp.width, H = this.comp.height;
    cc.globalCompositeOperation = 'source-over';
    cc.globalAlpha = 1;
    cc.clearRect(0, 0, W, H);
    cc.drawImage(this.body, 0, 0);
    cc.globalAlpha = 0.86 + 0.14 * this.hover;
    cc.drawImage(this.tex, 0, 0);
    cc.globalAlpha = 1;
    cc.globalCompositeOperation = 'destination-in';
    cc.drawImage(this.mask, 0, 0);
    cc.globalCompositeOperation = 'source-over';

    // While filling, each column shows code only down to its fill line.
    let fillAll = 1;
    if (filling) {
      const cp = this.cell * this.dpr;
      let done = true;
      for (let c = 0; c < this.cols; c++) {
        const f = this.fill[c];
        let u = (t - f.delay) / f.dur;
        u = u <= 0 ? 0 : u >= 1 ? 1 : u * u;   // pours faster as it goes
        if (u < 1) {
          done = false;
          const y = Math.floor(u * H);
          cc.clearRect(c * cp, y, cp + 1, H - y);
          if (u > 0 && y < H) {
            // The leading drop of the pour.
            const px = this.sheet.px, r = Math.floor(y / cp);
            cc.drawImage(this.sheet.canvas, ((Math.random() * GLYPHS.length) | 0) * px, 3 * px, px, px, c * cp, r * cp, cp, cp);
          }
        }
      }
      fillAll = Math.min(1, t / 1100);
      if (done) { this.formed = true; fillAll = 1; this.dirty = true; }
    }

    const v = this.ctx;
    v.clearRect(0, 0, this.view.width, this.view.height);
    v.globalAlpha = (0.7 + 0.3 * this.hover) * fillAll;
    v.drawImage(this.glow, 0, 0);
    if (this.hover > 0.02) { v.globalAlpha = 0.5 * this.hover * fillAll; v.drawImage(this.glow, 0, 0); }
    v.globalAlpha = 1;
    v.drawImage(this.comp, 0, 0);
  };

  window.CodeWord = CodeWord;
})();
