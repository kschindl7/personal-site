/*
 * The menu that forms out of the rain once the screen is gone.
 *
 * The links are ordinary <a> elements in index.html, each pointing at its
 * section of the plain page, so the menu still works without JavaScript and
 * for search engines. Each word is drawn as large lettering made of code
 * (codeword.js): glowing letters made of streaming code that stand in front
 * of the rain, filling with falling code to appear. The small kyle/ label
 * above is set on the rain's own grid and condenses out of the rain.
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
      const head = el.classList.contains('rain-head');
      if (!head) {
        // The link keeps its text for screen readers and search; the code
        // lettering is drawn over it.
        el.textContent = '';
        const label = document.createElement('span');
        label.className = 'code-label';
        label.textContent = text;
        el.appendChild(label);
        const word = new CodeWord(text, self.reduced);
        el.appendChild(word.view);
        const on = function () { word.hoverTo = 1; }, off = function () { word.hoverTo = 0; };
        el.addEventListener('pointerenter', on); el.addEventListener('pointerleave', off);
        el.addEventListener('focus', on); el.addEventListener('blur', off);
        return { el: el, text: text, letters: [], word: word, head: false };
      }
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
      return { el: el, text: text, letters: letters, head: true };
    });
    this.words = this.lines.filter(function (l) { return l.word; });
    this.headLine = this.lines.find(function (l) { return l.head; });
    this.matrix.onLock = function (t) { self.show(t); };
    // The code lettering runs on its own frame loop.
    (function tick(now) {
      if (self.started) self.words.forEach(function (l) { l.word.frame(now); });
      requestAnimationFrame(tick);
    })(performance.now());

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

  // Size the words as large as fits, wrapping into centered rows, and line
  // them up with the rain's grid. The small kyle/ label sits above them.
  Menu.prototype.layout = function () {
    const m = this.matrix, s = m.size, vw = m.w, vh = m.h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const words = this.words;
    const base = words.map(function (l) { return CodeWord.measure(l.text, 100); });
    const margin = Math.max(20, vw * 0.07), avail = vw - margin * 2;
    let size = Math.min(150, vh * 0.17), rows;
    for (; size > 26; size -= 2) {
      const gap = size * 0.5;
      rows = [];
      let cur = [], w = 0;
      words.forEach(function (l, i) {
        const wi = base[i] * size / 100;
        if (cur.length && w + gap + wi > avail) { rows.push({ items: cur, w: w }); cur = []; w = 0; }
        w += (cur.length ? gap : 0) + wi;
        cur.push({ l: l, w: wi });
      });
      rows.push({ items: cur, w: w });
      const fits = rows.every(function (r) { return r.w <= avail; });
      if (fits && rows.length * size * 1.45 <= vh * 0.62) break;
    }
    size = Math.round(size);
    const lineH = Math.ceil(size * 1.45 / s) * s;
    const gap = size * 0.5;
    const top = Math.round((vh - rows.length * lineH) / 2 / s) * s + s;
    let blockLeft = Infinity;
    rows.forEach(function (row, k) {
      let x = Math.round((vw - row.w) / 2 / s) * s;
      blockLeft = Math.min(blockLeft, x);
      row.items.forEach(function (it) {
        const l = it.l;
        l.box = { x: x, y: top + k * lineH, w: Math.ceil(it.w), h: size };
        l.word.build(size, x, top + k * lineH, dpr);
        x = Math.round((x + it.w + gap) / s) * s;
      });
    });

    // The links cover the words, with room to spare for tapping.
    words.forEach(function (l) {
      const st = l.el.style;
      st.left = l.box.x + 'px'; st.top = l.box.y + 'px';
      st.width = l.box.w + 'px'; st.height = l.word.textH + 'px';
      st.fontSize = '';
      st.lineHeight = '';
    });

    // The label, on the rain's grid, two rows above the first line.
    const targets = [];
    const head = this.headLine;
    const hc = Math.max(1, Math.round(blockLeft / s)), hr = Math.max(1, Math.round(top / s) - 3);
    head.el.style.left = hc * s + 'px';
    head.el.style.top = hr * s + 'px';
    head.el.style.width = head.text.length * s + 'px';
    head.el.style.height = s + 'px';
    head.el.style.fontSize = s + 'px';
    head.el.style.lineHeight = s + 'px';
    head.letters.forEach(function (t, i) {
      t.col = hc + i; t.row = hr; t.left = hc; t.right = hc + head.text.length - 1;
      t.span.style.left = i * s + 'px';
      t.span.style.width = s + 'px';
      targets.push(t);
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
    const now = performance.now();
    this.words.forEach(function (l, i) { l.word.form(now + 150 + i * 160); });
    if (this.reduced) {
      this.targets.forEach(function (t) { if (t.span) { t.locked = true; self.show(t, true); } });
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
    this.targets.forEach(function (t) { if (!t.locked && t.span) { t.locked = true; self.show(t, still); } });
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
    this.flyWord(chosen, S.nameLetters, 90);
    this.part(lane, true, 480);
    setTimeout(function () {
      // The flying letters hand over to the real heading.
      head.letters.forEach(function (t) { t.span.classList.add('flown'); });
      chosen.word.view.classList.add('flown');
      S.reveal();
      self.finishOpen();
    }, 660);
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

  // The chosen word shrinks as it glides up into the heading.
  Menu.prototype.flyWord = function (line, to, delay) {
    const v = line.word.view, w = line.word;
    const a = { left: w.x, top: w.y };
    const first = to[0].getBoundingClientRect(), last = to[to.length - 1].getBoundingClientRect();
    const k = (last.right - first.left) / w.textW;
    line.flight = v.animate([
      { transform: 'translate(0, 0) scale(1)' },
      { transform: 'translate(' + (first.left - a.left).toFixed(1) + 'px,' + (first.top - a.top).toFixed(1) + 'px) scale(' + k.toFixed(3) + ')' }
    ], { duration: 560, delay: delay, easing: 'cubic-bezier(0.65, 0, 0.25, 1)', fill: 'forwards' });
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

  // Words that weren't chosen lose their hold and fall away.
  Menu.prototype.drop = function (line) {
    if (line.word) {
      const tilt = (Math.random() - 0.5) * 24;
      line.flight = line.word.view.animate([
        { transform: 'translate(0, 0) rotate(0deg)' },
        { transform: 'translate(' + ((Math.random() - 0.5) * 60).toFixed(0) + 'px,' + Math.round(window.innerHeight * 0.9) + 'px) rotate(' + tilt.toFixed(1) + 'deg)' }
      ], { duration: 650 + Math.random() * 200, delay: Math.random() * 90, easing: 'cubic-bezier(0.5, 0, 1, 0.6)', fill: 'forwards' });
      return;
    }
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
        if (l.flight) { l.flight.cancel(); l.flight = null; }
        if (l.word) l.word.view.classList.remove('flown');
        l.letters.forEach(function (t) {
          if (t.flight) { t.flight.cancel(); t.flight = null; }
          t.span.classList.remove('flown');
        });
      });
      // Words that fell away fill with code again.
      const now = performance.now();
      self.words.forEach(function (l, i) {
        if (l !== chosen && !self.reduced && !o.quick) l.word.form(now + 60 + i * 120);
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
    head.letters.forEach(function (t) {
      t.span.classList.remove('flown');
      if (t.flight) t.flight.reverse();
    });
    if (chosen) {
      chosen.word.view.classList.remove('flown');
      if (chosen.flight) chosen.flight.reverse();
    }
    this.part(S.lane(), false, 420);
    setTimeout(finish, 600);
  };

  window.Menu = Menu;
})();
