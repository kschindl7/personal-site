/*
 * The menu that forms out of the rain once the screen is gone.
 *
 * The links are ordinary <a> elements in index.html, each pointing at its
 * section of the plain page, so the menu still works without JavaScript and
 * for search engines. Here each link is split into letters and laid exactly
 * on the rain's grid. A letter shows when a rain head runs through its cell
 * (see Matrix.setTargets), so the words condense out of the rain.
 *
 * Choosing a section drops its letters, then pours the section into a panel.
 * The section text is read from tavern/index.html, the one place it lives.
 */
(function () {
  'use strict';

  const SOURCE = 'tavern/index.html';

  function Menu(opts) {
    this.matrix = opts.matrix;
    this.nav = opts.nav;
    this.panel = opts.panel;
    this.veil = opts.veil;
    this.reduced = opts.reduced;
    this.started = false;
    this.busy = false;
    this.picked = null;
    this.content = null;

    const self = this;
    this.lines = Array.prototype.map.call(this.nav.querySelectorAll('.rain-head, a'), function (el) {
      const text = el.textContent.trim();
      el.textContent = '';
      el.setAttribute('aria-label', el.getAttribute('aria-label') || text);
      const letters = Array.prototype.map.call(text, function (ch) {
        const span = document.createElement('span');
        span.className = 'rain-l';
        span.textContent = ch;
        span.setAttribute('aria-hidden', 'true');
        el.appendChild(span);
        return { span: span, col: 0, row: 0, locked: false };
      });
      letters.forEach(function (t) { t.line = el; });
      return { el: el, text: text, letters: letters, head: el.classList.contains('rain-head') };
    });
    this.matrix.onLock = function (t) { self.show(t); };
    // Each later drop that lands makes the letter glint for a moment.
    this.matrix.onHit = function (t) {
      const span = t.span;
      if (!span.classList.contains('set')) return;
      span.classList.add('hit');
      setTimeout(function () { span.classList.remove('hit'); }, 90);
    };

    this.nav.addEventListener('click', function (e) {
      const a = e.target.closest('a[data-section]');
      if (!a || !self.content) return; // no content loaded: just follow the link
      e.preventDefault();
      self.open(a);
    });
    this.panel.querySelector('.rain-back').addEventListener('click', function () { self.close(); });
    this.veil.addEventListener('click', function () { self.close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !self.panel.hidden) self.close();
    });
  }

  // Lay the words out in a row on the rain's grid, wrapping onto more rows
  // on narrow screens. Rows are far enough apart for rain to spill between.
  Menu.prototype.layout = function () {
    const m = this.matrix, s = m.size;
    const cols = m.cols.length, rows = Math.floor(m.h / s);
    const gap = 3;
    const maxW = cols - 4;
    const lines = [];
    let cur = [], w = 0;
    this.lines.forEach(function (l) {
      const need = (cur.length ? gap : 0) + l.text.length;
      if (cur.length && w + need > maxW) { lines.push({ items: cur, w: w }); cur = []; w = 0; }
      w += (cur.length ? gap : 0) + l.text.length;
      cur.push(l);
    });
    if (cur.length) lines.push({ items: cur, w: w });

    const rowGap = Math.max(4, Math.ceil(72 / s));
    const r0 = Math.max(3, Math.round(rows * 0.46 - (lines.length - 1) * rowGap / 2));
    const targets = [];
    lines.forEach(function (line, k) {
      const row = r0 + k * rowGap;
      let col = Math.max(2, Math.floor((cols - line.w) / 2));
      line.items.forEach(function (l) {
        const left = col, right = col + l.text.length - 1;
        l.el.style.left = col * s + 'px';
        l.el.style.top = row * s + 'px';
        l.el.style.width = l.text.length * s + 'px';
        l.el.style.height = s + 'px';
        l.el.style.fontSize = s + 'px';
        l.el.style.lineHeight = s + 'px';
        l.letters.forEach(function (t, i) {
          t.col = col + i; t.row = row; t.left = left; t.right = right;
          t.span.style.left = i * s + 'px';
          t.span.style.width = s + 'px';
          targets.push(t);
        });
        col += l.text.length + gap;
      });
    });
    m.setTargets(targets);
    this.targets = targets;
  };

  Menu.prototype.start = function () {
    if (this.started) return;
    this.started = true;
    this.nav.hidden = false;
    this.layout();
    this.load();
    const self = this;
    if (this.reduced) { this.targets.forEach(function (t) { t.locked = true; self.show(t, true); }); this.matrix.setTargets(this.targets); return; }
    this.call(this.targets);
    // Anything the rain hasn't reached in a few seconds just appears.
    setTimeout(function () { self.lockAll(); }, 3500);
  };

  // Send rain heads down every column that still has letters waiting.
  Menu.prototype.call = function (targets) {
    const top = new Map();
    targets.forEach(function (t) {
      if (!t.locked && (!top.has(t.col) || t.row < top.get(t.col))) top.set(t.col, t.row);
    });
    const m = this.matrix;
    top.forEach(function (row, col) { m.summon(col, row); });
  };

  Menu.prototype.lockAll = function () {
    const self = this;
    this.targets.forEach(function (t) { if (!t.locked) { t.locked = true; self.show(t); } });
    this.matrix.setTargets(this.targets);
  };

  Menu.prototype.show = function (t, still) {
    const span = t.span;
    span.style.transform = '';
    span.classList.remove('set');
    span.classList.add('on');
    if (still) span.classList.add('set');
    else setTimeout(function () { span.classList.add('set'); }, 140);
  };

  Menu.prototype.resize = function () {
    if (this.started) this.layout();
  };

  Menu.prototype.load = function () {
    const self = this;
    if (!window.fetch || !window.DOMParser) return;
    fetch(SOURCE).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    }).then(function (html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const base = new URL(SOURCE, location.href);
      const out = {};
      doc.querySelectorAll('#content section[data-section]').forEach(function (sec) {
        // Links in the content are relative to the plain page; fix them up for here.
        sec.querySelectorAll('[href]').forEach(function (a) { a.setAttribute('href', new URL(a.getAttribute('href'), base).href); });
        sec.querySelectorAll('[src]').forEach(function (a) { a.setAttribute('src', new URL(a.getAttribute('src'), base).href); });
        out[sec.getAttribute('data-section')] = sec;
      });
      self.content = out;
    }).catch(function () { /* the links fall back to the plain page */ });
  };

  Menu.prototype.open = function (a) {
    if (this.busy) return;
    const name = a.getAttribute('data-section');
    const sec = this.content[name];
    if (!sec) { location.href = a.href; return; }
    this.busy = true;
    this.picked = this.lines.find(function (l) { return l.el === a; });
    this.nav.classList.add('chosen');
    a.classList.add('picked');
    const self = this;
    if (this.reduced) { this.fill(name, sec, a); return; }
    this.drop(this.picked);
    setTimeout(function () { self.fill(name, sec, a); }, 420);
  };

  // The chosen word's letters lose their hold and fall, each a moment apart.
  Menu.prototype.drop = function (line) {
    const g = 2400, start = performance.now();
    const parts = line.letters.map(function (t, i) {
      return { t: t, delay: i * 30 + Math.random() * 50, vx: (Math.random() - 0.5) * 40, spin: (Math.random() - 0.5) * 6 };
    });
    (function step(now) {
      if (!line.letters[0].span.classList.contains('on')) return; // put back already
      let moving = false;
      parts.forEach(function (p) {
        const age = (now - start - p.delay) / 1000;
        if (age <= 0) { moving = true; return; }
        const y = 0.5 * g * age * age;
        if (y < window.innerHeight) moving = true;
        // Spin builds up as the letter tips away.
        const rot = p.spin * age * Math.min(1, age / 0.25);
        p.t.span.style.transform = 'translate(' + (p.vx * age).toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + rot.toFixed(3) + 'rad)';
      });
      if (moving) requestAnimationFrame(step);
    })(start);
  };

  Menu.prototype.fill = function (name, sec, a) {
    const body = this.panel.querySelector('.rain-panel-body');
    body.innerHTML = '';
    Array.prototype.forEach.call(sec.children, function (el) { body.appendChild(el.cloneNode(true)); });
    this.panel.querySelector('.rain-path').textContent = 'kyle/' + name;
    this.panel.querySelector('.rain-plain').setAttribute('href', a.getAttribute('href'));
    this.veil.hidden = false;
    this.panel.hidden = false;
    this.panel.classList.remove('pour');
    void this.panel.offsetWidth;
    if (!this.reduced) this.panel.classList.add('pour');
    this.panel.scrollTop = 0;
    this.panel.querySelector('.rain-back').focus({ preventScroll: true });
  };

  // Back to the menu: the chosen word condenses out of the rain again.
  Menu.prototype.close = function () {
    if (this.panel.hidden) return;
    this.panel.hidden = true;
    this.veil.hidden = true;
    this.nav.classList.remove('chosen');
    const line = this.picked;
    this.busy = false;
    this.picked = null;
    if (!line) return;
    line.el.classList.remove('picked');
    if (this.reduced) { line.el.focus(); return; }
    line.letters.forEach(function (t) {
      t.locked = false;
      t.span.classList.remove('on', 'set');
      t.span.style.transform = '';
    });
    this.matrix.setTargets(this.targets);
    this.call(line.letters);
    const self = this;
    setTimeout(function () { line.letters.forEach(function (t) { if (!t.locked) { t.locked = true; self.show(t); } }); self.matrix.setTargets(self.targets); }, 2500);
    line.el.focus({ preventScroll: true });
  };

  window.Menu = Menu;
})();
