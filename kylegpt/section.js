/*
 * A section, shown in a clear column the rain parts around (see
 * Matrix.setLane). menu.js flies the chosen menu word up into the heading;
 * this file fills in the rest:
 *   - headings, job titles, dates and captions decode out of scrambled
 *     characters (they're set in monospace, so nothing shifts while they do);
 *   - paragraphs and lists fade in, one block after another, so long text is
 *     never held up;
 *   - media, wherever a section has any, dissolves out of a patch of rain as
 *     it scrolls into view and has loaded.
 *
 * Media is optional, and can sit anywhere in a section or sub-section:
 *   <img>, <video controls>, an <iframe> embed (YouTube, Vimeo, CodePen...),
 *   a looping animation as <video autoplay muted loop playsinline>, or any
 *   element marked data-media (a canvas, an SVG, a GIF in a link...).
 * Looping videos only play once revealed and while on screen, and don't
 * autoplay at all for visitors who prefer reduced motion. Closing a section
 * removes its content, so nothing keeps playing.
 */
(function () {
  'use strict';

  const SCRAMBLE = 'ABCDEFGHJKLMNPRSTUVXYZ0123456789#$%&*+=<>/\\|';
  const GLYPHS = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789:=*+<>';
  const DECODE = 'h2, h3, h4, .dates, figcaption';
  const MEDIA = 'img, video, iframe, [data-media]';

  function rnd(set) { return set[(Math.random() * set.length) | 0]; }

  function Section(opts) {
    this.el = opts.el;
    this.reduced = opts.reduced;
    this.body = this.el.querySelector('.rain-page-body');
    this.crumb = this.el.querySelector('.rain-crumb');
    this.name = this.el.querySelector('.rain-name');
    this.plain = this.el.querySelector('.rain-plain');
    this.observer = null;
    this.timers = [];
  }

  // The width of the clear column, in CSS px: room for text plus wide media.
  Section.prototype.lane = function () {
    const vw = window.innerWidth;
    const w = vw < 600 ? vw : Math.min(820, vw - 32);
    return { x0: (vw - w) / 2, x1: (vw + w) / 2, w: w };
  };

  function letters(el, text) {
    el.textContent = '';
    return Array.prototype.map.call(text, function (ch) {
      const s = document.createElement('span');
      s.className = 'tl';
      s.textContent = ch;
      el.appendChild(s);
      return s;
    });
  }

  // Put the section's content in place, still hidden.
  Section.prototype.render = function (name, sec, href) {
    this.clear();
    this.crumbLetters = letters(this.crumb, 'kyle/');
    this.nameLetters = letters(this.name, name);
    this.plain.setAttribute('href', href);
    const body = this.body;
    Array.prototype.forEach.call(sec.children, function (el) { body.appendChild(el.cloneNode(true)); });

    const self = this;
    this.media = [];
    body.querySelectorAll(MEDIA).forEach(function (m) {
      if (m.closest('[data-media]') && m.closest('[data-media]') !== m) return; // inside a marked block
      const wrap = document.createElement('div');
      wrap.className = 'rain-media';
      if (m.tagName === 'IFRAME') {
        wrap.classList.add('embed');
        const w = +m.getAttribute('width'), h = +m.getAttribute('height');
        if (w && h) wrap.style.aspectRatio = w + ' / ' + h;
        m.setAttribute('loading', 'lazy');
        if (!m.hasAttribute('allowfullscreen')) m.setAttribute('allowfullscreen', '');
      } else if (m.tagName === 'IMG') {
        m.setAttribute('loading', 'lazy');
        m.setAttribute('decoding', 'async');
      } else if (m.tagName === 'VIDEO') {
        m.setAttribute('playsinline', '');
        if (!m.hasAttribute('preload')) m.setAttribute('preload', 'metadata');
        // A looping, muted video is an animation: it plays only once revealed.
        m.loopAnim = m.hasAttribute('autoplay');
        m.removeAttribute('autoplay');
        if (m.loopAnim && self.reduced) m.setAttribute('controls', '');
      }
      m.parentNode.insertBefore(wrap, m);
      wrap.appendChild(m);
      if (!self.reduced) m.classList.add('rain-wait');
      self.media.push({ wrap: wrap, el: m, shown: false });
    });
  };

  // Called when the heading letters have landed: everything else arrives.
  Section.prototype.reveal = function () {
    const self = this;
    this.el.classList.remove('entering');
    const blocks = Array.prototype.slice.call(this.body.children).concat([this.plain.parentNode]);
    if (!this.reduced) {
      blocks.forEach(function (b, i) { b.style.animationDelay = Math.min(i, 12) * 55 + 'ms'; b.classList.add('rain-in'); });
      this.decode(this.body.querySelectorAll(DECODE));
    }

    // Media dissolves in once it's on screen and loaded; animations then
    // play only while they're visible.
    if (!this.media.length) return;
    this.observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        const item = self.media.find(function (m) { return m.wrap === e.target; });
        if (!item) return;
        if (e.isIntersecting) {
          if (!item.shown) { item.shown = true; self.ready(item.el, function () { self.dissolve(item); }); }
          else if (item.revealed) self.play(item.el);
        } else if (item.el.loopAnim) item.el.pause();
      });
    }, { root: this.el, threshold: 0.2 });
    this.media.forEach(function (m) { self.observer.observe(m.wrap); });
  };

  Section.prototype.play = function (el) {
    if (el.loopAnim && !this.reduced) { el.muted = true; const p = el.play(); if (p && p.catch) p.catch(function () {}); }
  };

  // Wait for the media to load, but never for long.
  Section.prototype.ready = function (el, cb) {
    let done = false;
    const go = function () { if (!done) { done = true; cb(); } };
    this.timers.push(setTimeout(go, 1800));
    if (el.tagName === 'IMG') {
      if (el.complete && el.naturalWidth) return go();
      el.addEventListener('load', go, { once: true });
      el.addEventListener('error', go, { once: true });
    } else if (el.tagName === 'VIDEO') {
      if (el.readyState >= 2) return go();
      el.addEventListener('loadeddata', go, { once: true });
      el.addEventListener('error', go, { once: true });
    } else if (el.tagName === 'IFRAME') {
      el.addEventListener('load', go, { once: true });
    } else go();
  };

  // A patch of rain over the media falls away column by column.
  Section.prototype.dissolve = function (item) {
    const self = this;
    item.el.classList.remove('rain-wait');
    if (this.reduced) { item.revealed = true; return; }
    const r = item.wrap.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cv = document.createElement('canvas');
    cv.width = w * dpr; cv.height = h * dpr;
    cv.setAttribute('aria-hidden', 'true');
    item.wrap.appendChild(cv);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = 14;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.font = cell + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
    for (let c = 0; c < cols; c++) {
      for (let k = 0; k < rows; k++) {
        if (Math.random() < 0.55) continue;
        ctx.fillStyle = 'rgba(31, 209, 106, ' + (0.25 + Math.random() * 0.5).toFixed(2) + ')';
        ctx.fillText(rnd(GLYPHS), c * cell, k * cell);
      }
    }
    // Each column's head falls at its own pace, clearing the rain above it.
    const heads = [];
    for (let c = 0; c < cols; c++) heads.push({ delay: Math.random() * 280, dur: 320 + Math.random() * 320 });
    const start = performance.now();
    (function step(now) {
      if (!cv.isConnected) return;
      const t = now - start;
      let done = true;
      for (let c = 0; c < cols; c++) {
        const p = (t - heads[c].delay) / heads[c].dur;
        if (p <= 0) { done = false; continue; }
        const y = Math.min(h + cell, p * p * (h + cell)); // speeds up as it falls
        if (y < h + cell) done = false;
        ctx.clearRect(c * cell, 0, cell, y);
        if (y < h) {
          ctx.fillStyle = '#dcffe6';
          ctx.fillText(rnd(GLYPHS), c * cell, y);
        }
      }
      if (done) { cv.remove(); item.revealed = true; self.play(item.el); }
      else requestAnimationFrame(step);
    })(start);
  };

  // Text scrambles, then each character settles into place. Only the text
  // nodes change, so links and emphasis inside them are kept.
  Section.prototype.decode = function (els) {
    const nodes = [];
    els.forEach(function (el) {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n, i = 0;
      while ((n = walk.nextNode())) {
        const text = n.nodeValue;
        if (!text.trim()) continue;
        const at = Array.prototype.map.call(text, function (ch, k) {
          return /\s/.test(ch) ? 0 : 120 + Math.min(520, (i + k) * 14) + Math.random() * 200;
        });
        i += text.length;
        nodes.push({ n: n, text: text, at: at });
      }
    });
    if (!nodes.length) return;
    this.body.setAttribute('aria-busy', 'true');
    const self = this, start = performance.now();
    (function step(now) {
      if (!self.body.isConnected) return;
      const t = now - start;
      let busy = false;
      nodes.forEach(function (o) {
        let out = '';
        for (let k = 0; k < o.text.length; k++) {
          if (t >= o.at[k]) out += o.text[k];
          else { out += rnd(SCRAMBLE); busy = true; }
        }
        if (o.n.nodeValue !== out) o.n.nodeValue = out;
      });
      if (busy) requestAnimationFrame(step);
      else self.body.removeAttribute('aria-busy');
    })(start);
  };

  Section.prototype.clear = function () {
    if (this.observer) this.observer.disconnect();
    this.observer = null;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.body.innerHTML = '';   // also stops any video or embed
    this.media = [];
  };

  window.Section = Section;
})();
