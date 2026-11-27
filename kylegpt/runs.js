/*
 * The answer to "can it run…?": a tiny first-person shooter hidden behind
 * the menu's "other?". Everything here is original: a maze whose walls are
 * falling code, "bugs" made of corrupted red glyphs, and a blinking text
 * cursor that deletes them. Clear every bug, reach the exit, and the build
 * passes, which unlocks the actual kyle/other page.
 *
 * Rendering: classic ray casting. One ray per column of a small internal
 * canvas finds the nearest wall; the wall slice is drawn from an animated
 * texture of falling glyphs, darkened with distance. Bugs are flat sprites
 * clipped against the walls with a depth buffer. The small canvas is
 * scaled up to fill the screen.
 *
 * The cursor fires glowing bolts that travel through the maze and burst on
 * whatever they reach: a wall, or a bug (which they damage). A minimap in
 * the corner shows the walls, you, the remaining bugs, repair patches and
 * the exit.
 *
 * Controls: WASD or arrows to move, mouse or Q/E to turn (click to capture
 * the mouse), click or Space to fire, M for the map, Esc to leave. On touch screens: drag
 * on the left to move, drag on the right to turn, tap the fire button.
 */
(function () {
  'use strict';

  const GLYPHS = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789:=*+<>';
  const BUGLYPHS = '#%&@$?!¿¤§¶×÷░▒▓';
  // # wall, . floor, S start, b bug, + patch (repairs integrity), E exit.
  const MAP = [
    '####################',
    '#S.....#...........#',
    '#......#..b....b...#',
    '#..##..#...........#',
    '#..##......####.+..#',
    '#......#...#..#....#',
    '####.###...#..#.b..#',
    '#......#...##.#....#',
    '#..b...#......#....#',
    '#......######.######',
    '#.....b......b.....#',
    '######.#####.#####.#',
    '#....#.#...#.#...#.#',
    '#.b..#...b.#...b.#.#',
    '#..+.#######.....#.#',
    '#..........#######.#',
    '#.##.b.##..........#',
    '#.##...##....b...#E#',
    '#..................#',
    '####################'
  ];
  const FOV = 0.66;            // camera plane length: about a 66° field of view
  const MOVE = 3.0, TURN = 2.4; // tiles/s, rad/s
  const R = 0.22;              // player radius, tiles

  function rnd(set) { return set[(Math.random() * set.length) | 0]; }

  function Runs(opts) {
    this.reduced = opts.reduced;
    this.onLeave = opts.onLeave || function () {};   // (action) 'menu' | 'read'
    this.el = null;
  }

  Runs.prototype.open = function () {
    if (this.el) return;
    const el = this.el = document.createElement('section');
    el.className = 'runs';
    el.setAttribute('aria-label', 'A small shooting game');
    el.innerHTML =
      '<canvas class="runs-view" aria-label="First-person view of a maze whose walls are falling code. Move with W A S D or the arrow keys, turn with the mouse or Q and E, fire with Space or a click, press Escape to leave." tabindex="0"></canvas>' +
      '<div class="runs-hud" aria-hidden="true"><span class="runs-path">kyle/other</span><span class="runs-hint">esc to leave</span></div>' +
      '<div class="runs-stats" aria-live="polite"><span class="runs-hp"></span><span class="runs-left"></span></div>' +
      '<div class="runs-weapon" aria-hidden="true"><span>▌</span></div>' +
      '<div class="runs-cross" aria-hidden="true"></div>' +
      '<canvas class="runs-map" aria-hidden="true"></canvas>' +
      '<div class="runs-touch" aria-hidden="true"><div class="runs-stick"></div><button type="button" class="runs-fire" tabindex="-1">fire</button></div>' +
      '<div class="runs-screen" role="dialog" aria-modal="false"></div>';
    document.body.appendChild(el);
    document.body.classList.add('runs-open');
    this.canvas = el.querySelector('.runs-view');
    this.ctx = this.canvas.getContext('2d');
    this.screen = el.querySelector('.runs-screen');
    this.hpEl = el.querySelector('.runs-hp');
    this.leftEl = el.querySelector('.runs-left');
    this.mapEl = el.querySelector('.runs-map');
    this.mapCtx = this.mapEl.getContext('2d');
    this.weapon = el.querySelector('.runs-weapon');
    // The game draws at a low resolution straight into the visible canvas,
    // and the browser scales it up to fill the screen.
    this.small = this.canvas;
    this.sctx = this.ctx;
    this.makeTextures();
    this.bind();
    this.resize();
    this.reset();
    this.intro();
    const self = this;
    this.running = true;
    this.last = 0;
    (function loop(now) {
      if (!self.running) return;
      self.frame(now);
      requestAnimationFrame(loop);
    })(performance.now());
  };

  Runs.prototype.close = function () {
    if (!this.el) return;
    this.running = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.unbind();
    this.el.remove();
    this.el = null;
    document.body.classList.remove('runs-open');
  };

  // ---------------------------------------------------------------------------
  // Level and state

  Runs.prototype.reset = function () {
    this.map = MAP.map(function (r) { return r.split(''); });
    this.bugs = [];
    this.items = [];
    for (let y = 0; y < this.map.length; y++) {
      for (let x = 0; x < this.map[y].length; x++) {
        const c = this.map[y][x];
        if (c === 'S') { this.px = x + 0.5; this.py = y + 0.5; this.map[y][x] = '.'; }
        if (c === 'b') { this.bugs.push({ x: x + 0.5, y: y + 0.5, hp: 3, hurt: 0, dead: 0, seen: false, wob: Math.random() * 6 }); this.map[y][x] = '.'; }
        if (c === '+') { this.items.push({ x: x + 0.5, y: y + 0.5, kind: 'patch' }); this.map[y][x] = '.'; }
        if (c === 'E') { this.exit = { x: x + 0.5, y: y + 0.5 }; this.map[y][x] = '.'; }
      }
    }
    this.dirX = 1; this.dirY = 0;
    this.planeX = 0; this.planeY = FOV;
    this.hp = 100;
    this.cool = 0; this.flash = 0; this.hit = 0;
    this.shots = [];    // bolts in flight
    this.sparks = [];   // where bolts burst
    this.drawMapBase();
    this.state = 'intro';
    this.updateStats();
  };

  Runs.prototype.solid = function (x, y) {
    const r = this.map[Math.floor(y)];
    return !r || r[Math.floor(x)] !== '.';
  };

  Runs.prototype.updateStats = function () {
    const left = this.bugs.filter(function (b) { return !b.dead; }).length;
    this.hpEl.textContent = 'integrity ' + Math.max(0, Math.round(this.hp)) + '%';
    this.leftEl.textContent = left ? left + (left === 1 ? ' bug left' : ' bugs left') : 'exit open';
  };

  // ---------------------------------------------------------------------------
  // Screens

  Runs.prototype.show = function (html, focus) {
    // Give the mouse back first, so the screen's buttons can be clicked.
    if (document.pointerLockElement) document.exitPointerLock();
    this.screen.innerHTML = html;
    this.screen.hidden = false;
    this.el.classList.add('paused');
    const self = this;
    this.screen.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); self.act(b.getAttribute('data-act')); });
    });
    const f = this.screen.querySelector(focus || 'button');
    if (f) f.focus({ preventScroll: true });
  };

  Runs.prototype.hide = function () {
    this.screen.hidden = true;
    this.el.classList.remove('paused');
    this.canvas.focus({ preventScroll: true });
  };

  Runs.prototype.intro = function () {
    const self = this;
    this.show(
      '<p class="runs-term"><span class="runs-type"></span><span class="runs-caret">▌</span></p>' +
      '<div class="runs-actions" hidden>' +
      '<button type="button" data-act="play">run it</button>' +
      '<button type="button" data-act="read" class="quiet">just show me kyle/other</button>' +
      '</div>');
    const lines = ['> can this site run it?', '> checking ', '.', '.', '.', '.', '.', ' yes.'];
    const out = this.screen.querySelector('.runs-type');
    let i = 0;
    const next = function () {
      if (!self.el || self.state !== 'intro') return;
      if (i >= lines.length) {
        const a = self.screen.querySelector('.runs-actions');
        a.hidden = false;
        a.querySelector('button').focus({ preventScroll: true });
        return;
      }
      out.textContent += (i === 1 ? '\n' : '') + lines[i++];
      setTimeout(next, self.reduced ? 0 : i <= 2 ? 520 : i < lines.length ? 230 : 300);
    };
    next();
  };

  Runs.prototype.act = function (a) {
    if (a === 'play' || a === 'again') {
      if (a === 'again') this.reset();
      this.state = 'play';
      this.hide();
      this.capture();
    } else if (a === 'read') {
      this.onLeave('read');
    } else if (a === 'menu') {
      this.onLeave('menu');
    } else if (a === 'resume') {
      this.state = 'play';
      this.hide();
      this.capture();
    }
  };

  Runs.prototype.pause = function () {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.show('<p class="runs-term">> paused</p><div class="runs-actions">' +
      '<button type="button" data-act="resume">resume</button>' +
      '<button type="button" data-act="menu" class="quiet">back to the menu</button></div>');
  };

  Runs.prototype.win = function () {
    this.state = 'won';
    if (document.pointerLockElement) document.exitPointerLock();
    this.show('<p class="runs-term">> build passed. 0 bugs remaining.\n> kyle/other unlocked.</p><div class="runs-actions">' +
      '<button type="button" data-act="read">open kyle/other</button>' +
      '<button type="button" data-act="menu" class="quiet">back to the menu</button></div>');
  };

  Runs.prototype.lose = function () {
    this.state = 'lost';
    if (document.pointerLockElement) document.exitPointerLock();
    this.show('<p class="runs-term">> segmentation fault (core dumped)</p><div class="runs-actions">' +
      '<button type="button" data-act="again">try again</button>' +
      '<button type="button" data-act="read" class="quiet">skip to kyle/other</button>' +
      '<button type="button" data-act="menu" class="quiet">back to the menu</button></div>');
  };

  // ---------------------------------------------------------------------------
  // Input

  Runs.prototype.capture = function () {
    // Mouse look only where there's a mouse, and only where the browser allows
    // it (an embedded page may not); otherwise click to fire, and turn with
    // the keys or by dragging.
    if (this.touch || this.noLock || !this.canvas.requestPointerLock) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* not allowed here */ }
  };

  Runs.prototype.bind = function () {
    const self = this, keys = this.keys = {};
    this.touch = window.matchMedia('(pointer: coarse)').matches;
    if (this.touch) this.el.classList.add('touch');
    const on = this.handlers = [];
    const add = function (t, ev, fn, o) { t.addEventListener(ev, fn, o); on.push([t, ev, fn, o]); };

    add(window, 'keydown', function (e) {
      if (!self.el) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (self.state === 'play') self.pause(); else self.onLeave('menu');
        return;
      }
      if (e.code === 'KeyM') { self.el.classList.toggle('no-map'); return; }
      if (self.state !== 'play') return;
      keys[e.code] = true;
      if (e.code === 'Space') { e.preventDefault(); self.fire(); }
      if (/^(Arrow|Key[WASDQE])/.test(e.code)) e.preventDefault();
    });
    add(window, 'keyup', function (e) { keys[e.code] = false; });
    add(window, 'resize', function () { self.resize(); });
    add(this.canvas, 'mousedown', function (e) {
      if (self.state !== 'play' || self.touch || e.button !== 0) return;
      if (document.pointerLockElement === self.canvas || self.noLock) self.fire();
      else self.capture();
      self.dragX = e.clientX;
    });
    add(window, 'mouseup', function () { self.dragX = null; });
    add(document, 'mousemove', function (e) {
      if (self.state !== 'play') return;
      if (document.pointerLockElement === self.canvas) self.turn(e.movementX * 0.0028);
      else if (self.noLock && self.dragX != null && e.buttons) { self.turn((e.clientX - self.dragX) * 0.006); self.dragX = e.clientX; }
    });
    // Having the mouse and then losing it (Esc in most browsers) pauses the game.
    add(document, 'pointerlockchange', function () {
      const locked = document.pointerLockElement === self.canvas;
      if (!locked && self.locked && self.state === 'play') self.pause();
      self.locked = locked;
    });
    add(document, 'pointerlockerror', function () { self.noLock = true; });
    add(document, 'visibilitychange', function () { if (document.hidden) self.pause(); });

    // Touch: drag left to move, drag right to turn, tap the button to fire.
    this.stick = null; this.look = null;
    const stickEl = this.el.querySelector('.runs-stick');
    add(this.canvas, 'touchstart', function (e) {
      if (self.state !== 'play') return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX < window.innerWidth / 2 && !self.stick) {
          self.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY, dx: 0, dy: 0 };
          stickEl.style.left = t.clientX + 'px'; stickEl.style.top = t.clientY + 'px'; stickEl.classList.add('on');
        } else if (!self.look) self.look = { id: t.identifier, x: t.clientX };
      }
      e.preventDefault();
    }, { passive: false });
    add(this.canvas, 'touchmove', function (e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (self.stick && t.identifier === self.stick.id) { self.stick.dx = t.clientX - self.stick.x0; self.stick.dy = t.clientY - self.stick.y0; }
        if (self.look && t.identifier === self.look.id) { self.turn((t.clientX - self.look.x) * 0.006); self.look.x = t.clientX; }
      }
      e.preventDefault();
    }, { passive: false });
    const end = function (e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (self.stick && t.identifier === self.stick.id) { self.stick = null; stickEl.classList.remove('on'); }
        if (self.look && t.identifier === self.look.id) self.look = null;
      }
    };
    add(this.canvas, 'touchend', end);
    add(this.canvas, 'touchcancel', end);
    add(this.el.querySelector('.runs-fire'), 'touchstart', function (e) { e.preventDefault(); self.fire(); }, { passive: false });
  };

  Runs.prototype.unbind = function () {
    (this.handlers || []).forEach(function (h) { h[0].removeEventListener(h[1], h[2], h[3]); });
    this.handlers = [];
  };

  Runs.prototype.turn = function (a) {
    const c = Math.cos(a), s = Math.sin(a);
    const dx = this.dirX, px = this.planeX;
    this.dirX = dx * c - this.dirY * s; this.dirY = dx * s + this.dirY * c;
    this.planeX = px * c - this.planeY * s; this.planeY = px * s + this.planeY * c;
  };

  // ---------------------------------------------------------------------------
  // Play

  Runs.prototype.fire = function () {
    if (this.state !== 'play' || this.cool > 0) return;
    this.cool = 0.24;
    this.flash = 1;
    this.weapon.classList.remove('kick'); void this.weapon.offsetWidth; this.weapon.classList.add('kick');
    // A bolt leaves the cursor, low on the screen, and rises toward the
    // crosshair as it travels down the middle of the view.
    this.shots.push({ x: this.px + this.dirX * 0.3, y: this.py + this.dirY * 0.3, dx: this.dirX, dy: this.dirY, z: -0.24, dist: 0 });
  };

  // Bolts fly about 13 tiles a second and burst on the first thing they meet.
  Runs.prototype.updateShots = function (dt) {
    const SPEED = 13, STEP = 0.06, self = this;
    const keep = [];
    this.shots.forEach(function (b) {
      let left = SPEED * dt, done = false;
      while (left > 0 && !done) {
        const d = Math.min(STEP, left);
        left -= d;
        b.x += b.dx * d; b.y += b.dy * d; b.dist += d;
        b.z = -0.24 + Math.min(1, b.dist / 1.4) * 0.15;   // from the gun to eye level
        if (self.solid(b.x, b.y)) {
          self.sparks.push({ x: b.x - b.dx * 0.08, y: b.y - b.dy * 0.08, z: b.z, age: 0, wall: true });
          done = true;
          break;
        }
        for (let i = 0; i < self.bugs.length; i++) {
          const g = self.bugs[i];
          if (g.dead || Math.hypot(g.x - b.x, g.y - b.y) > 0.34) continue;
          g.hp--; g.hurt = 0.18; g.seen = true;
          self.hit = 0.12;
          if (g.hp <= 0) { g.dead = 0.001; self.updateStats(); }
          self.sparks.push({ x: b.x, y: b.y, z: b.z, age: 0, wall: false });
          done = true;
          break;
        }
      }
      if (!done && b.dist < 24) keep.push(b);
    });
    this.shots = keep;
    this.sparks = this.sparks.filter(function (k) { k.age += dt; return k.age < 0.28; });
  };

  Runs.prototype.move = function (dx, dy) {
    const nx = this.px + dx, ny = this.py + dy;
    if (!this.solid(nx + Math.sign(dx) * R, this.py) ) this.px = nx;
    if (!this.solid(this.px, ny + Math.sign(dy) * R)) this.py = ny;
  };

  Runs.prototype.clear = function (x0, y0, x1, y1) {
    // Line of sight between two points, sampled every quarter tile.
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d * 4);
    for (let i = 1; i < n; i++) if (this.solid(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false;
    return true;
  };

  Runs.prototype.update = function (dt) {
    const k = this.keys;
    // Moving and turning.
    let f = 0, s = 0, t = 0;
    if (k.KeyW || k.ArrowUp) f += 1;
    if (k.KeyS || k.ArrowDown) f -= 1;
    if (k.KeyA) s -= 1;
    if (k.KeyD) s += 1;
    if (k.ArrowLeft || k.KeyQ) t -= 1;
    if (k.ArrowRight || k.KeyE) t += 1;
    if (this.stick) {
      const m = 50;
      f -= Math.max(-1, Math.min(1, this.stick.dy / m));
      s += Math.max(-1, Math.min(1, this.stick.dx / m));
    }
    if (t) this.turn(t * TURN * dt);
    const len = Math.hypot(f, s) || 1, sp = MOVE * dt / Math.max(1, len);
    if (f || s) this.move((this.dirX * f - this.dirY * s) * sp, (this.dirY * f + this.dirX * s) * sp);

    this.updateShots(dt);
    this.cool = Math.max(0, this.cool - dt);
    this.flash = Math.max(0, this.flash - dt * 7);
    this.hit = Math.max(0, this.hit - dt);

    // Bugs: drift toward you once they can see you, and corrupt you on contact.
    const self = this;
    this.bugs.forEach(function (b) {
      b.wob += dt * 5;
      if (b.dead) { b.dead += dt; return; }
      b.hurt = Math.max(0, b.hurt - dt);
      const dx = self.px - b.x, dy = self.py - b.y, d = Math.hypot(dx, dy);
      if (d < 9 && (b.seen || self.clear(b.x, b.y, self.px, self.py))) b.seen = true;
      if (b.seen && d > 0.55) {
        const v = 1.25 * dt / d;
        const nx = b.x + dx * v, ny = b.y + dy * v;
        if (!self.solid(nx, b.y)) b.x = nx;
        if (!self.solid(b.x, ny)) b.y = ny;
      }
      if (d < 0.65) { self.hp -= 22 * dt; self.hurtFlash = 0.25; }
    });
    this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - dt);
    // Patches repair integrity.
    this.items = this.items.filter(function (it) {
      if (Math.hypot(it.x - self.px, it.y - self.py) < 0.6 && self.hp < 100) { self.hp = Math.min(100, self.hp + 35); return false; }
      return true;
    });
    this.updateStats();
    if (this.hp <= 0) this.lose();
    const left = this.bugs.some(function (b) { return !b.dead; });
    if (!left && Math.hypot(this.exit.x - this.px, this.exit.y - this.py) < 0.7) this.win();
  };

  // ---------------------------------------------------------------------------
  // Drawing

  Runs.prototype.resize = function () {
    if (!this.el) return;
    const w = window.innerWidth, h = window.innerHeight;
    // A low internal resolution keeps it fast; it's scaled up to fill the screen.
    const W = Math.max(240, Math.min(520, Math.round(w / 2.6)));
    this.small.width = W; this.small.height = Math.round(W * h / w);
    this.zbuf = new Float32Array(W);
    if (this.map) this.drawMapBase();
  };

  // Wall texture: columns of glyphs that keep falling. A second, brighter
  // texture marks the exit once it's open.
  Runs.prototype.makeTextures = function () {
    const mk = function (w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    this.wall = mk(64, 128);
    this.wallHeads = [];
    for (let i = 0; i < 8; i++) this.wallHeads.push({ y: Math.random() * 16, v: 0.25 + Math.random() * 0.5 });
    this.wallGrid = [];
    for (let i = 0; i < 8 * 16; i++) this.wallGrid.push({ ch: rnd(GLYPHS), b: Math.random() * 0.5 });
    this.bugFrames = [];
    for (let f = 0; f < 4; f++) {
      const c = mk(48, 48), g = c.getContext('2d');
      g.font = 'bold 9px ui-monospace, Menlo, Consolas, monospace';
      g.textBaseline = 'top';
      // A rough blob of corrupted glyphs, denser in the middle.
      for (let k = 0; k < 120; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.pow(Math.random(), 0.7) * 20;
        const x = 24 + Math.cos(a) * r * 0.8, y = 26 + Math.sin(a) * r;
        g.fillStyle = Math.random() < 0.2 ? '#ffd0e0' : Math.random() < 0.6 ? '#ff2a5a' : '#c0186a';
        g.fillText(rnd(BUGLYPHS), x - 3, y - 4);
      }
      // Two bright "eyes".
      g.fillStyle = '#fff2f6';
      g.fillRect(17 + f % 2, 19, 4, 3); g.fillRect(27 - f % 2, 19, 4, 3);
      this.bugFrames.push(c);
    }
    // A bolt: a hot white core in a green glow.
    const bolt = this.bolt = mk(32, 32), bg = bolt.getContext('2d');
    const gr = bg.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gr.addColorStop(0.18, 'rgba(225, 255, 236, 1)');
    gr.addColorStop(0.42, 'rgba(90, 255, 150, 0.7)');
    gr.addColorStop(1, 'rgba(40, 220, 110, 0)');
    bg.fillStyle = gr;
    bg.fillRect(0, 0, 32, 32);
    const patch = this.patch = mk(32, 32), pg = patch.getContext('2d');
    pg.fillStyle = '#7dffb0'; pg.fillRect(13, 6, 6, 20); pg.fillRect(6, 13, 20, 6);
    pg.fillStyle = '#eafff1'; pg.fillRect(14, 7, 4, 18); pg.fillRect(7, 14, 18, 4);
    this.stepWall();
  };

  Runs.prototype.stepWall = function () {
    const g = this.wall.getContext('2d');
    g.fillStyle = '#010a04';
    g.fillRect(0, 0, 64, 128);
    g.font = '8px ui-monospace, Menlo, Consolas, monospace';
    g.textBaseline = 'top';
    for (let c = 0; c < 8; c++) {
      const h = this.wallHeads[c];
      h.y += h.v;
      if (h.y > 22) { h.y = -Math.random() * 6; h.v = 0.25 + Math.random() * 0.5; }
      for (let r = 0; r < 16; r++) {
        const cell = this.wallGrid[r * 8 + c];
        if (Math.random() < 0.05) cell.ch = rnd(GLYPHS);
        const d = h.y - r;
        const b = d >= 0 && d < 1 ? 1 : d > 0 && d < 7 ? 0.85 - d * 0.1 : 0.22 + cell.b * 0.3;
        g.fillStyle = b > 0.95 ? '#eafff1' : 'rgba(40, 230, 110, ' + b.toFixed(2) + ')';
        g.fillText(cell.ch, c * 8, r * 8);
      }
    }
  };

  Runs.prototype.frame = function (now) {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.state === 'play') this.update(dt);
    this.wallT = (this.wallT || 0) + dt;
    if (this.wallT > 0.07) { this.wallT = 0; this.stepWall(); }
    this.render(now);
  };

  Runs.prototype.render = function (now) {
    const g = this.sctx, W = this.small.width, H = this.small.height, half = H / 2;
    const exitOpen = !this.bugs.some(function (b) { return !b.dead; });

    // Ceiling and floor: dark, with the floor faintly lit near the horizon.
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, half);
    const fl = g.createLinearGradient(0, half, 0, H);
    fl.addColorStop(0, '#062b14'); fl.addColorStop(1, '#000');
    g.fillStyle = fl;
    g.fillRect(0, half, W, half);

    // Walls, one ray per column.
    for (let x = 0; x < W; x++) {
      const cam = 2 * x / W - 1;
      const rx = this.dirX + this.planeX * cam, ry = this.dirY + this.planeY * cam;
      let mx = Math.floor(this.px), my = Math.floor(this.py);
      const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
      const stepX = rx < 0 ? -1 : 1, stepY = ry < 0 ? -1 : 1;
      let sdx = (rx < 0 ? this.px - mx : mx + 1 - this.px) * ddx;
      let sdy = (ry < 0 ? this.py - my : my + 1 - this.py) * ddy;
      let side = 0, guard = 0;
      while (guard++ < 64) {
        if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
        if (this.solid(mx + 0.5, my + 0.5)) break;
      }
      const dist = side === 0 ? sdx - ddx : sdy - ddy;
      this.zbuf[x] = dist;
      const lh = H / Math.max(0.05, dist);
      const top = half - lh / 2;
      let wx = side === 0 ? this.py + dist * ry : this.px + dist * rx;
      wx -= Math.floor(wx);
      const tx = Math.min(63, Math.floor(wx * 64));
      g.drawImage(this.wall, tx, 0, 1, 128, x, top, 1, lh);
      const shade = Math.min(0.9, dist / 11) + (side ? 0.12 : 0);
      if (shade > 0.02) { g.fillStyle = 'rgba(0,0,0,' + shade.toFixed(2) + ')'; g.fillRect(x, top, 1, lh); }
    }

    // Sprites: bugs, patches and the exit beacon, far to near.
    const self = this, list = [];
    this.bugs.forEach(function (b) { if (!b.dead || b.dead < 0.35) list.push({ x: b.x, y: b.y, bug: b }); });
    this.items.forEach(function (it) { list.push({ x: it.x, y: it.y, item: it }); });
    if (exitOpen) list.push({ x: this.exit.x, y: this.exit.y, exit: true });
    this.shots.forEach(function (b) { list.push({ x: b.x, y: b.y, shot: b }); });
    this.sparks.forEach(function (k) { list.push({ x: k.x, y: k.y, spark: k }); });
    list.forEach(function (s) { s.d = (s.x - self.px) * (s.x - self.px) + (s.y - self.py) * (s.y - self.py); });
    list.sort(function (a, b) { return b.d - a.d; });
    const inv = 1 / (this.planeX * this.dirY - this.dirX * this.planeY);
    list.forEach(function (s) {
      const sx = s.x - self.px, sy = s.y - self.py;
      const tx = inv * (self.dirY * sx - self.dirX * sy), tz = inv * (-self.planeY * sx + self.planeX * sy);
      if (tz <= 0.1) return;
      const cx = (W / 2) * (1 + tx / tz);
      let size = Math.abs(H / tz);
      if (s.shot || s.spark) {
        // Glowing points: drawn whole if nothing nearer covers their centre.
        const col = Math.round(cx);
        if (col < 0 || col >= W || tz >= self.zbuf[col]) return;
        const z = (s.shot || s.spark).z, y = half - z * size;
        let r, a = 1;
        if (s.shot) r = Math.max(2, size * 0.09);
        else { const u = s.spark.age / 0.28; r = Math.max(3, size * (0.08 + u * 0.22)); a = 1 - u; }
        g.globalAlpha = a;
        g.globalCompositeOperation = 'lighter';
        g.drawImage(self.bolt, cx - r, y - r, r * 2, r * 2);
        if (s.spark) {
          // A few flecks thrown out from the burst.
          g.fillStyle = s.spark.wall ? '#b9ffd0' : '#ff9ab5';
          for (let k = 0; k < 6; k++) {
            const ang = k * 1.047 + s.spark.x * 3, d = r * 1.3;
            g.fillRect(cx + Math.cos(ang) * d, y + Math.sin(ang) * d, Math.max(1, r * 0.15), Math.max(1, r * 0.15));
          }
        }
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        return;
      }
      let img, alpha = 1, yoff = 0;
      if (s.bug) {
        const b = s.bug;
        img = self.bugFrames[((now / 90) | 0) % self.bugFrames.length];
        size *= 0.7; yoff = Math.sin(b.wob) * size * 0.04 + size * 0.15;
        // Deleted: it shrinks and breaks up as it fades.
        if (b.dead) { const u = b.dead / 0.35; alpha = 1 - u; size *= 1 - u * 0.6; yoff += size * u * 0.5; }
      } else if (s.item) {
        img = self.patch; size *= 0.35; yoff = size * 0.9;
      } else {
        size *= 1.0;
      }
      const x0 = Math.floor(cx - size / 2), x1 = Math.ceil(cx + size / 2);
      const top = half - size / 2 + yoff;
      for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
        if (tz >= self.zbuf[x]) continue;
        const u = (x - (cx - size / 2)) / size;
        if (s.exit) {
          // The exit: a column of bright light.
          const a = 0.55 + 0.35 * Math.sin(now / 160 + u * 6);
          g.fillStyle = 'rgba(220, 255, 232, ' + (a * (1 - Math.abs(u - 0.5) * 2)).toFixed(2) + ')';
          g.fillRect(x, half - size, 1, size * 1.5);
          continue;
        }
        const sx = Math.floor(u * img.width);
        if (s.bug && s.bug.dead && ((sx * 7 + x) % 3 === 0)) continue;   // breaking up
        g.globalAlpha = alpha;
        g.drawImage(img, sx, 0, 1, img.height, x, top, 1, size);
        if (s.bug && s.bug.hurt > 0) {
          // Hit: only the bug's own glyphs flash brighter.
          g.globalCompositeOperation = 'lighter';
          g.drawImage(img, sx, 0, 1, img.height, x, top, 1, size);
          g.globalCompositeOperation = 'source-over';
        }
        g.globalAlpha = 1;
      }
    });

    // Firing flashes the screen a little; being corrupted tints it red.
    if (this.flash > 0) { g.fillStyle = 'rgba(200, 255, 220, ' + (this.flash * 0.12).toFixed(3) + ')'; g.fillRect(0, 0, W, H); }
    if (this.hurtFlash > 0) { g.fillStyle = 'rgba(255, 30, 80, ' + (this.hurtFlash * 0.5).toFixed(3) + ')'; g.fillRect(0, 0, W, H); }

    this.el.classList.toggle('hit', this.hit > 0);
    this.drawMap(now);
  };

  // The minimap: north up. Walls are drawn once; the rest every frame.
  Runs.prototype.drawMapBase = function () {
    const rows = this.map.length, cols = this.map[0].length;
    const t = this.mapTile = window.innerWidth < 600 ? 5 : 7;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.mapEl.width = cols * t * dpr; this.mapEl.height = rows * t * dpr;
    this.mapEl.style.width = cols * t + 'px'; this.mapEl.style.height = rows * t + 'px';
    const base = this.mapBase = document.createElement('canvas');
    base.width = this.mapEl.width; base.height = this.mapEl.height;
    const g = base.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        g.fillStyle = this.map[y][x] === '.' ? 'rgba(10, 40, 20, 0.85)' : 'rgba(40, 170, 90, 0.75)';
        g.fillRect(x * t, y * t, t, t);
      }
    }
  };

  Runs.prototype.drawMap = function (now) {
    if (!this.mapBase) return;
    const g = this.mapCtx, t = this.mapTile, dpr = this.mapEl.width / (this.map[0].length * t);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.mapEl.width, this.mapEl.height);
    g.drawImage(this.mapBase, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const exitOpen = !this.bugs.some(function (b) { return !b.dead; });
    // The exit: dim and locked until the bugs are gone, then pulsing.
    const pulse = 0.6 + 0.4 * Math.sin(now / 180);
    g.fillStyle = exitOpen ? 'rgba(235, 255, 242, ' + pulse.toFixed(2) + ')' : 'rgba(140, 170, 150, 0.55)';
    g.fillRect((this.exit.x - 0.5) * t, (this.exit.y - 0.5) * t, t, t);
    if (!exitOpen) { g.strokeStyle = 'rgba(0, 0, 0, 0.8)'; g.lineWidth = 1; g.strokeRect((this.exit.x - 0.5) * t + 1.5, (this.exit.y - 0.5) * t + 1.5, t - 3, t - 3); }
    g.fillStyle = '#7dffb0';
    this.items.forEach(function (it) {
      g.fillRect(it.x * t - 1, (it.y - 0.3) * t, 2, t * 0.6);
      g.fillRect((it.x - 0.3) * t, it.y * t - 1, t * 0.6, 2);
    });
    g.fillStyle = '#ff3b6b';
    this.bugs.forEach(function (b) {
      if (b.dead) return;
      g.beginPath(); g.arc(b.x * t, b.y * t, Math.max(1.5, t * 0.3), 0, Math.PI * 2); g.fill();
    });
    // You: an arrow pointing the way you face.
    const a = Math.atan2(this.dirY, this.dirX), px = this.px * t, py = this.py * t, r = t * 0.75;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(px + Math.cos(a) * r, py + Math.sin(a) * r);
    g.lineTo(px + Math.cos(a + 2.5) * r * 0.75, py + Math.sin(a + 2.5) * r * 0.75);
    g.lineTo(px + Math.cos(a - 2.5) * r * 0.75, py + Math.sin(a - 2.5) * r * 0.75);
    g.closePath(); g.fill();
  };

  window.Runs = Runs;
})();
