/*
 * The menu that forms out of the rain once the screen is gone.
 *
 * The links are ordinary <a> elements in index.html, each pointing at its
 * section of the plain page, so the menu still works without JavaScript and
 * for search engines. Here each link is split into letters and laid exactly
 * on the rain's grid. A letter shows when a rain head runs through its cell
 * (see Matrix.setTargets), so the words condense out of the rain.
 *
 * Choosing a section: the other words fall away, the chosen word and kyle/
 * fly up to become the section's heading, and the rain parts to leave a
 * clear column where the section arrives (section.js). Back reverses it.
 * Each section gets its own address (#work), so the browser's back button
 * and direct links work. The text is read from tavern/index.html, the one
 * place it lives.
 */
(function () {
  'use strict';

  const SOURCE = 'tavern/index.html';

  function Menu(opts) {
    this.matrix = opts.matrix;
    this.nav = opts.nav;
    this.page = opts.page;               // the <article> a section shows in
    this.section = new Section({ el: opts.page, reduced: opts.reduced });
    this.reduced = opts.reduced;
    this.openName = null;
    this.pending = null;                 // a section to open once content loads
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
      self.open(a, { push: true });
    });
    this.page.querySelector('.rain-back').addEventListener('click', function () { self.back(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && self.openName) self.back();
    });
    // The browser's back and forward buttons move between the menu and sections.
    window.addEventListener('popstate', function () {
      const name = self.fromHash();
      if (name && name !== self.openName) {
        if (self.openName) self.close({ quick: true });
        self.open(self.link(name), {});
      } else if (!name && self.openName) self.close({});
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
    const name = this.fromHash();
    if (this.reduced) {
      this.targets.forEach(function (t) { t.locked = true; self.show(t, true); });
      this.matrix.setTargets(this.targets);
    } else {
      this.call(this.targets);
      // Anything the rain hasn't reached in a few seconds just appears.
      setTimeout(function () { self.lockAll(); }, 3500);
    }
    if (name) this.openWhenReady(name);
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

  Menu.prototype.lockAll = function (still) {
    const self = this;
    this.targets.forEach(function (t) { if (!t.locked) { t.locked = true; self.show(t, still); } });
    if (!this.openName) this.matrix.setTargets(this.targets);
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
      if (self.pending) { const n = self.pending; self.pending = null; self.open(self.link(n), { quick: true }); }
    }).catch(function () { /* the links fall back to the plain page */ });
  };

  Menu.prototype.link = function (name) {
    return this.nav.querySelector('a[data-section="' + name + '"]');
  };

  Menu.prototype.fromHash = function () {
    const name = decodeURIComponent(location.hash.slice(1));
    return name && this.link(name) ? name : null;
  };

  // Arriving on a link to a section (#work): show it once the content loads.
  Menu.prototype.openWhenReady = function (name) {
    if (this.content) this.open(this.link(name), { quick: true });
    else this.pending = name;
  };

  Menu.prototype.back = function () {
    if (this.pushed) history.back(); // popstate closes it
    else this.close({});
  };

  Menu.prototype.open = function (a, o) {
    if (this.busy || !a) return;
    const name = a.getAttribute('data-section');
    const sec = this.content && this.content[name];
    if (!sec) { location.href = a.href; return; }
    this.busy = true;
    this.openName = name;
    if (o.push) { history.pushState({ kyle: name }, '', '#' + name); this.pushed = true; }
    else this.pushed = !!(history.state && history.state.kyle === name); // came forward to it

    const self = this;
    const chosen = this.lines.find(function (l) { return l.el === a; });
    const head = this.lines.find(function (l) { return l.head; });
    this.picked = chosen;
    this.nav.classList.add('chosen');
    a.classList.add('picked');
    this.nav.inert = true;
    document.body.classList.add('section-open');
    this.matrix.setTargets([]);  // the rain stops landing on the words

    const S = this.section, lane = S.lane();
    S.render(name, sec, a.getAttribute('href'));
    this.page.hidden = false;
    this.page.scrollTop = 0;

    if (this.reduced || o.quick) {
      this.matrix.setLane(lane.x0, lane.x1);
      this.nav.classList.add('away');
      this.lockAll(true);
      S.reveal();
      this.finishOpen();
      return;
    }

    this.page.classList.add('entering');
    this.lines.forEach(function (l) { if (l !== chosen && l !== head) self.drop(l); });
    this.fly(head.letters, S.crumbLetters, 60);
    this.fly(chosen.letters, S.nameLetters, 110);
    this.part(lane, true, 480);
    setTimeout(function () {
      // The flying letters hand over to the real heading.
      head.letters.concat(chosen.letters).forEach(function (t) { t.span.classList.add('flown'); });
      S.reveal();
      self.finishOpen();
    }, 640);
  };

  Menu.prototype.finishOpen = function () {
    this.busy = false;
    this.page.querySelector('.rain-title').focus({ preventScroll: true });
  };

  // Letters glide from the menu row to their place in the heading.
  Menu.prototype.fly = function (from, to, delay) {
    const s = this.matrix.size;
    from.forEach(function (t, i) {
      const span = t.span;
      span.style.transform = '';
      const a = span.getBoundingClientRect(), b = to[i].getBoundingClientRect();
      const k = b.height / s;
      t.flight = span.animate([
        { transform: 'translate(0, 0) scale(1)' },
        { transform: 'translate(' + (b.left - a.left).toFixed(1) + 'px,' + (b.top - a.top).toFixed(1) + 'px) scale(' + k.toFixed(3) + ')' }
      ], { duration: 520, delay: delay + i * 22, easing: 'cubic-bezier(0.65, 0, 0.25, 1)', fill: 'forwards' });
    });
  };

  // The rain parts from the middle out (or closes back over).
  Menu.prototype.part = function (lane, opening, dur) {
    const m = this.matrix, mid = (lane.x0 + lane.x1) / 2, half = (lane.x1 - lane.x0) / 2;
    const start = performance.now();
    const self = this;
    this.parting = start;
    (function step(now) {
      if (self.parting !== start) return;
      let u = Math.min(1, (now - start) / dur);
      u = opening ? 1 - Math.pow(1 - u, 3) : u * u * u;
      const h = half * (opening ? u : 1 - u);
      if (h < 1 && !opening) { m.setLane(null); return; }
      m.setLane(mid - h, mid + h);
      if (now - start < dur) requestAnimationFrame(step);
      else if (!opening) m.setLane(null);
    })(start);
  };

  // The chosen word's letters lose their hold and fall, each a moment apart.
  Menu.prototype.drop = function (line) {
    const g = 2400, start = performance.now();
    const parts = line.letters.map(function (t, i) {
      return { t: t, delay: i * 30 + Math.random() * 80, vx: (Math.random() - 0.5) * 40, spin: (Math.random() - 0.5) * 6 };
    });
    line.dropping = start;
    (function step(now) {
      if (line.dropping !== start) return; // put back already
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

  // Back to the menu: the heading flies back into the row, the rain closes
  // over the column, and the other words form out of the rain again.
  Menu.prototype.close = function (o) {
    if (!this.openName) return;
    const self = this, S = this.section;
    const chosen = this.picked, head = this.lines.find(function (l) { return l.head; });
    this.openName = null;
    this.pushed = false;
    if (location.hash && !o.quick && history.state === null) history.replaceState(null, '', location.pathname + location.search);
    this.busy = true;

    const finish = function () {
      S.clear();
      self.page.hidden = true;
      self.page.classList.remove('leaving', 'entering');
      self.nav.classList.remove('chosen', 'away');
      self.nav.inert = false;
      document.body.classList.remove('section-open');
      if (chosen) chosen.el.classList.remove('picked');
      self.lines.forEach(function (l) {
        l.dropping = 0;
        l.letters.forEach(function (t) {
          if (t.flight) { t.flight.cancel(); t.flight = null; }
          t.span.classList.remove('flown');
        });
      });
      // Words that fell away form out of the rain again.
      const again = [];
      self.lines.forEach(function (l) {
        if (l === chosen || l === head) return;
        l.letters.forEach(function (t) {
          t.span.style.transform = '';
          if (self.reduced || o.quick) return;
          t.locked = false;
          t.span.classList.remove('on', 'set');
          again.push(t);
        });
      });
      self.matrix.setTargets(self.targets);
      self.call(again);
      if (again.length) setTimeout(function () { self.lockAll(); }, 2000);
      self.busy = false;
      self.picked = null;
      if (chosen && !o.quick) chosen.el.focus({ preventScroll: true });
    };

    if (this.reduced || o.quick) { this.matrix.setLane(null); this.parting = 0; finish(); return; }

    this.page.classList.add('leaving');
    head.letters.concat(chosen ? chosen.letters : []).forEach(function (t) {
      t.span.classList.remove('flown');
      if (t.flight) t.flight.reverse();
    });
    this.part(S.lane(), false, 420);
    setTimeout(finish, 600);
  };

  window.Menu = Menu;
})();
