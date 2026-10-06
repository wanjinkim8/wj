/* W.J Wine Journey — study tab "나라와 등급".
   A dark world map of the twelve wine countries and a classification ladder for the one selected.
   API: window.WJClasses.mount(el, { countries, depthGetter, initial?, geoUrl? }) → Promise<api>
        window.WJClasses.destroy()
   Needs d3 7.9 + topojson-client; loads them from jsdelivr when window.d3 is missing. */
(function () {
  'use strict';

  const D3_URL = 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js';
  const TOPO_URL = 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js';
  const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

  const ORDER = ['france', 'italy', 'spain', 'portugal', 'germany', 'austria', 'usa', 'chile', 'argentina', 'australia', 'newzealand', 'southafrica'];
  const REGION = {
    eu: ['france', 'italy', 'spain', 'portugal', 'germany', 'austria'],
    na: ['usa'],
    sa: ['chile', 'argentina'],
    oc: ['australia', 'newzealand'],
    af: ['southafrica'],
  };
  const GROUP_OF = {};
  Object.keys(REGION).forEach((g) => REGION[g].forEach((k) => { GROUP_OF[k] = g; }));
  // camera bounds per region, [[west, south], [east, north]] — wide enough to keep labels in frame
  const VIEW = {
    eu: [[-15.5, 35.2], [23.5, 55.8]],
    na: [[-126, 23], [-64, 50.5]],
    sa: [[-86, -56], [-49, -18.5]],
    oc: [[111, -48.5], [179.5, -9]],
    af: [[7, -37], [42, -19.5]],
  };
  const ISO = { france: '250', italy: '380', spain: '724', portugal: '620', germany: '276', austria: '040', usa: '840', chile: '152', argentina: '032', australia: '036', newzealand: '554', southafrica: '710' };
  const KEEP = {
    france: ([lon]) => lon > -20,
    usa: ([lon, lat]) => lon > -130 && lat < 50,
  };
  // label anchor [lon, lat, side]: side r = text to the right of the dot, l = left
  const PIN = {
    france: [2.4, 46.7, 'l'], spain: [-3.6, 40.2, 'r'], portugal: [-8.1, 39.6, 'l'], italy: [12.5, 42.8, 'r'],
    germany: [10.3, 51.1, 'r'], austria: [14.6, 47.6, 'r'], usa: [-98.6, 39.4, 'r'], chile: [-71.0, -33.6, 'l'],
    argentina: [-65.2, -35.0, 'r'], australia: [134.0, -24.8, 'r'], newzealand: [172.6, -41.6, 'l'], southafrica: [24.2, -29.9, 'r'],
  };
  // ladder steps listed from the base (widest) to the top. Anything not listed goes to "라벨 표기".
  const LADDER = {
    france: { steps: ['뱅 드 프랑스', 'IGP', 'AOC · AOP'] },
    italy: { steps: ['비노', 'IGT', 'DOC', 'DOCG'] },
    spain: { steps: ['IGP · 비노 데 라 티에라', 'DO', 'DOCa · DOQ', '비노 데 파고'] },
    portugal: { steps: ['비뉴', '비뉴 레지오날 · IGP', 'DOP · DOC'] },
    germany: { steps: ['란트바인 · 도이처 바인', '크발리테츠바인', '프레디카츠바인'] },
    austria: { steps: ['크발리테츠바인 표시', 'DAC', '게비츠바인 · 오르츠바인 · 리덴바인'] },
    usa: { steps: ['주 · 카운티 표시', 'AVA'], title: '산지 표시 단계', axis: ['좁은 산지', '넓은 지역'] },
    argentina: { steps: ['IP', 'IG', 'DOC'] },
    chile: { base: 'DO' },
    australia: { base: 'GI 지리적 표시' },
    newzealand: { base: 'GI 지리적 표시' },
    southafrica: { base: 'WO' },
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const norm = (s) => String(s || '').replace(/\s+/g, '');
  const pad = (n) => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- d3 loader (shares app.js script tags when they exist) ---------- */
  let libP = null;
  function loadLibs() {
    if (window.d3 && window.topojson) return Promise.resolve();
    if (libP) return libP;
    const one = (src, ok) => new Promise((res, rej) => {
      if (ok()) return res();
      let s = document.querySelector(`script[src="${src}"]`);
      if (!s) { s = document.createElement('script'); s.src = src; document.head.appendChild(s); }
      s.addEventListener('load', () => res(), { once: true });
      s.addEventListener('error', rej, { once: true });
      const t0 = Date.now();
      (function poll() { if (ok()) return res(); if (Date.now() - t0 < 15000) setTimeout(poll, 120); })();
    });
    libP = one(D3_URL, () => !!window.d3).then(() => one(TOPO_URL, () => !!window.topojson));
    libP.catch(() => { libP = null; });
    return libP;
  }
  const geoCache = {};
  function loadWorld(url) {
    if (!geoCache[url]) geoCache[url] = fetch(url).then((r) => { if (!r.ok) throw new Error('geo ' + r.status); return r.json(); });
    geoCache[url].catch(() => { delete geoCache[url]; });
    return geoCache[url];
  }

  /* ---------- data model per country ---------- */
  function modelOf(c) {
    const cfg = LADDER[c.key] || {};
    const items = (c.classification || []).filter((x) => x && x.name);
    const find = (nm) => items.find((x) => norm(x.name) === norm(nm));
    let steps = (cfg.steps || []).map(find).filter(Boolean);
    let mode = 'ladder';
    if (steps.length < 2) {
      mode = 'base';
      const b = (cfg.base && find(cfg.base)) || steps[0] || items[0];
      steps = b ? [b] : [];
    }
    const used = new Set(steps);
    return {
      mode,
      steps, // base → top
      extras: items.filter((x) => !used.has(x)),
      title: cfg.title || (mode === 'ladder' ? '품질 등급' : '산지 표시 제도'),
      axis: cfg.axis || ['엄격', '기본'],
    };
  }

  /* ---------- instance ---------- */
  let inst = null;

  function create(el, opts) {
    const raw = opts.countries || {};
    const list = (Array.isArray(raw) ? raw : Object.values(raw)).filter((c) => c && c.key);
    const byKey = {};
    list.forEach((c) => { byKey[c.key] = c; });
    const has = (k) => byKey[k] && (byKey[k].classification || []).length;
    const keys = ORDER.filter(has).concat(list.map((c) => c.key).filter((k) => !ORDER.includes(k) && has(k)));
    const depthGetter = typeof opts.depthGetter === 'function' ? opts.depthGetter
      : () => (document.body.classList.contains('depth-expert') ? 'expert' : 'easy');
    const mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const reduced = () => mq.matches;
    const uid = 'wjc' + Math.random().toString(36).slice(2, 8);
    const cleanups = [];
    let alive = true;
    let sel = keys.includes(opts.initial) ? opts.initial : (keys.includes('france') ? 'france' : keys[0]);

    if (!keys.length) {
      el.innerHTML = '<div class="wjc"><p class="wjc-empty">자료를 정리하고 있습니다.</p></div>';
      return { ready: Promise.resolve(), destroy() { el.innerHTML = ''; }, select() {}, setDepth() {} };
    }

    /* ----- skeleton ----- */
    let tabsHTML = '';
    keys.forEach((k, i) => {
      if (i && GROUP_OF[k] !== GROUP_OF[keys[i - 1]]) tabsHTML += '<span class="wjc-sep" aria-hidden="true"></span>';
      tabsHTML += `<button class="wjc-tab" type="button" role="tab" id="${uid}-t-${k}" data-k="${k}" aria-controls="${uid}-panel" aria-selected="false" tabindex="-1">${esc(byKey[k].ko)}</button>`;
    });
    el.innerHTML = `
      <div class="wjc" data-depth="${depthGetter() === 'expert' ? 'expert' : 'easy'}">
        <div class="wjc-tabs" role="tablist" aria-label="나라">${tabsHTML}<span class="wjc-ink" aria-hidden="true"></span></div>
        <div class="wjc-body">
          <div class="wjc-stage">
            <div class="wjc-map" role="group" aria-label="와인 나라 지도">
              <svg class="wjc-svg" xmlns="http://www.w3.org/2000/svg"></svg>
              <div class="wjc-labels is-moving" aria-hidden="true"></div>
              <p class="wjc-hint" aria-hidden="true">나라를 누르면 등급이 바뀝니다</p>
              <p class="wjc-coord" aria-hidden="true"></p>
              <p class="wjc-wait">지도를 불러오고 있습니다.</p>
            </div>
          </div>
          <div class="wjc-panel" role="tabpanel" id="${uid}-panel" tabindex="0"></div>
        </div>
      </div>`;
    const root = el.querySelector('.wjc');
    const tabsEl = root.querySelector('.wjc-tabs');
    const inkEl = root.querySelector('.wjc-ink');
    const mapEl = root.querySelector('.wjc-map');
    const svgEl = root.querySelector('.wjc-svg');
    const labelsEl = root.querySelector('.wjc-labels');
    const coordEl = root.querySelector('.wjc-coord');
    const panelEl = root.querySelector('.wjc-panel');
    const tabs = [...tabsEl.querySelectorAll('.wjc-tab')];

    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); cleanups.push(() => t.removeEventListener(ev, fn, o)); };

    /* ----- depth ----- */
    function setDepth(d) { root.dataset.depth = d === 'expert' ? 'expert' : 'easy'; }
    if ('MutationObserver' in window) {
      const mo = new MutationObserver(() => setDepth(depthGetter()));
      mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      cleanups.push(() => mo.disconnect());
    }

    /* ----- tabs ----- */
    function syncTabs(scroll) {
      tabs.forEach((t) => {
        const isOn = t.dataset.k === sel;
        t.setAttribute('aria-selected', String(isOn));
        t.tabIndex = isOn ? 0 : -1;
      });
      const t = tabs.find((x) => x.dataset.k === sel);
      if (!t) return;
      inkEl.style.transform = `translateX(${t.offsetLeft + 12}px) scaleX(${Math.max(1, t.offsetWidth - 24)})`;
      panelEl.setAttribute('aria-labelledby', t.id);
      if (scroll && tabsEl.scrollWidth > tabsEl.clientWidth + 2) {
        const left = t.offsetLeft - (tabsEl.clientWidth - t.offsetWidth) / 2;
        tabsEl.scrollTo({ left: clamp(left, 0, tabsEl.scrollWidth - tabsEl.clientWidth), behavior: reduced() ? 'auto' : 'smooth' });
      }
    }
    on(tabsEl, 'click', (e) => { const t = e.target.closest('.wjc-tab'); if (t) select(t.dataset.k); });
    on(tabsEl, 'keydown', (e) => {
      const i = tabs.findIndex((t) => t.dataset.k === sel);
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tabs.length - 1;
      if (j < 0) return;
      e.preventDefault();
      select(tabs[j].dataset.k);
      tabs[j].focus();
    });

    /* ----- panel ----- */
    function panelHTML(k) {
      const c = byKey[k];
      const m = modelOf(c);
      const n = m.steps.length;
      const top = m.steps.slice().reverse();
      const en = c.en === 'United States of America' ? 'United States' : c.en;
      const meta = m.mode === 'ladder'
        ? `${m.title} ${n}단계${m.extras.length ? ` · 라벨 표기 ${m.extras.length}개` : ''}`
        : `${m.title}${m.extras.length ? ` · 라벨 표기 ${m.extras.length}개` : ''}`;
      const steps = top.map((s, i) => {
        const r = n > 1 ? (n - 1 - i) / (n - 1) : 1;
        const w = n > 1 ? 38 + 62 * (i / (n - 1)) : 100;
        return `<li class="wjc-step${i === 0 ? ' is-top' : ''}" style="--r:${r.toFixed(3)};--w:${w.toFixed(1)}%">
          <span class="wjc-bar" aria-hidden="true"><i></i>${i === 0 ? '<em class="wjc-sheen"></em>' : ''}</span>
          <div class="wjc-st"><b class="wjc-sn">${esc(s.name)}</b><p class="wjc-e">${esc(s.easy)}</p>${s.expert ? `<p class="wjc-x">${esc(s.expert)}</p>` : ''}</div>
        </li>`;
      }).join('');
      const extras = m.extras.map((x) => `<li class="wjc-xi"><b class="wjc-xn">${esc(x.name)}</b><p class="wjc-e">${esc(x.easy)}</p>${x.expert ? `<p class="wjc-x">${esc(x.expert)}</p>` : ''}</li>`).join('');
      return `
        <header class="wjc-ph">
          <p class="wjc-eye"><span class="wjc-no">${pad(keys.indexOf(k) + 1)}</span><span class="wjc-of">/ ${pad(keys.length)}</span><span class="wjc-en" lang="en">${esc(en)}</span></p>
          <h3 class="wjc-name">${esc(c.ko)}</h3>
          <p class="wjc-meta">${esc(meta)}</p>
        </header>
        <section class="wjc-lad" data-mode="${m.mode}">
          <h4 class="wjc-h">${esc(m.title)}</h4>
          ${m.mode === 'ladder' ? `<p class="wjc-ax wjc-ax-top" aria-hidden="true"><span>${esc(m.axis[0])}</span></p>` : ''}
          <ol class="wjc-steps">${steps}</ol>
          ${m.mode === 'ladder' ? `<p class="wjc-ax wjc-ax-bot" aria-hidden="true"><span>${esc(m.axis[1])}</span></p>` : ''}
        </section>
        ${extras ? `<section class="wjc-more"><h4 class="wjc-h">라벨 표기</h4><ul class="wjc-xs">${extras}</ul></section>` : ''}`;
    }

    const anims = new Set();
    const play = (node, kf, o) => {
      if (!node || !node.animate) return null;
      const a = node.animate(kf, o);
      anims.add(a);
      a.finished.then(() => anims.delete(a), () => anims.delete(a));
      return a;
    };
    function animateIn() {
      if (reduced()) { play(panelEl, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' }); return; }
      const rise = (y) => [{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: 'none' }];
      panelEl.querySelectorAll('.wjc-ph > *').forEach((h, i) => play(h, rise(10), { duration: 760, delay: i * 70, easing: EASE, fill: 'backwards' }));
      const lad = panelEl.querySelector('.wjc-lad');
      play(lad.querySelector('.wjc-h'), [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 160, easing: 'ease-out', fill: 'backwards' });
      const steps = [...panelEl.querySelectorAll('.wjc-step')];
      const n = steps.length;
      const t0 = 240, gap = 140;
      play(lad.querySelector('.wjc-ax-bot'), [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: t0, easing: 'ease-out', fill: 'backwards' });
      steps.forEach((s, i) => {
        const d = t0 + (n - 1 - i) * gap; // bottom step first, then upward
        play(s.querySelector('.wjc-bar'), [{ opacity: 0, transform: 'translateY(22px) scaleX(0.5)' }, { opacity: 1, transform: 'none' }], { duration: 980, delay: d, easing: EASE, fill: 'backwards' });
        play(s.querySelector('.wjc-st'), rise(16), { duration: 900, delay: d + 70, easing: EASE, fill: 'backwards' });
      });
      const tTop = t0 + (n - 1) * gap;
      play(lad.querySelector('.wjc-ax-top'), [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: tTop + 240, easing: 'ease-out', fill: 'backwards' });
      play(panelEl.querySelector('.wjc-sheen'), [{ transform: 'translateX(-110%)', opacity: 0 }, { opacity: 1, offset: 0.25 }, { transform: 'translateX(110%)', opacity: 0 }], { duration: 1500, delay: tTop + 420, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'both' });
      const more = panelEl.querySelector('.wjc-more');
      if (more) {
        const tm = tTop + 320;
        play(more.querySelector('.wjc-h'), [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: tm, easing: 'ease-out', fill: 'backwards' });
        more.querySelectorAll('.wjc-xi').forEach((x, j) => play(x, rise(12), { duration: 800, delay: tm + 80 + j * 90, easing: EASE, fill: 'backwards' }));
      }
    }
    let panelToken = 0;
    function renderPanel(animate) {
      const token = ++panelToken;
      anims.forEach((a) => a.cancel());
      anims.clear();
      const swap = () => {
        if (!alive || token !== panelToken) return;
        panelEl.innerHTML = panelHTML(sel);
        panelEl.style.opacity = '';
        if (animate) animateIn();
      };
      if (animate && panelEl.firstElementChild && !reduced() && panelEl.animate) {
        const a = panelEl.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 200, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' });
        a.finished.then(() => { a.cancel(); swap(); }, () => {});
        anims.add(a);
      } else swap();
    }

    /* ----- map ----- */
    const M = { ready: false, W: 0, H: 0, cur: null, flight: null, introDone: false };
    const pins = {};
    let d3, proj, gZoom, blurEl, winePaths, hiPaths;

    function viewFor(bb) {
      const [[w, s], [e, n]] = bb;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        [[w + (e - w) * t, s], [w + (e - w) * t, n], [w, s + (n - s) * t], [e, s + (n - s) * t]].forEach((ll) => {
          const p = proj(ll);
          if (!p) return;
          x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
        });
      }
      // breathing room around the region; more on wide screens so the world around it stays in view
      const pad = M.W >= 600 ? 0.16 : 0.03;
      const dx = (x1 - x0) * pad, dy = (y1 - y0) * pad;
      x0 -= dx; x1 += dx; y0 -= dy; y1 += dy;
      const k = Math.min(M.W / (x1 - x0), M.H / (y1 - y0));
      return { k, x: M.W / 2 - k * (x0 + x1) / 2, y: M.H / 2 - k * (y0 + y1) / 2 };
    }
    const worldView = () => ({ k: 1, x: 0, y: 0 });
    const targetView = () => (M.introDone ? viewFor(VIEW[GROUP_OF[sel]] || VIEW.eu) : worldView());

    function apply() {
      const { k, x, y } = M.cur;
      gZoom.attr('transform', `translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${k.toFixed(4)})`);
      blurEl.attr('stdDeviation', (5 / k).toFixed(3));
    }

    function placeLabels() {
      if (!M.ready) return;
      const { k, x, y } = M.cur;
      keys.forEach((key) => {
        const p = pins[key];
        if (!p) return;
        const xy = proj([p.lon, p.lat]);
        p.sx = k * xy[0] + x; p.sy = k * xy[1] + y;
        p.el.style.transform = `translate(${p.sx.toFixed(1)}px, ${p.sy.toFixed(1)}px)`;
        p.el.classList.toggle('is-on', key === sel);
      });
      // collision: selected label first, then the fixed order; hide what overlaps or leaves the frame
      const mr = mapEl.getBoundingClientRect();
      const placed = [];
      const order = [sel].concat(keys.filter((key) => key !== sel));
      order.forEach((key, i) => {
        const p = pins[key];
        if (!p) return;
        const r = p.tx.getBoundingClientRect();
        const b = { l: r.left - mr.left - 4, t: r.top - mr.top - 3, r: r.right - mr.left + 4, b: r.bottom - mr.top + 3 };
        const inside = b.l >= 2 && b.t >= 2 && b.r <= M.W - 2 && b.b <= M.H - 2 && p.sx > 0 && p.sx < M.W && p.sy > 0 && p.sy < M.H;
        const hit = placed.some((q) => b.l < q.r && b.r > q.l && b.t < q.b && b.b > q.t);
        const hide = !inside || (hit && key !== sel);
        p.el.classList.toggle('is-hidden', hide);
        p.el.style.setProperty('--d', `${i * 60}ms`);
        if (!hide) placed.push(b);
      });
    }

    function stopFlight() { if (M.flight) { M.flight.stop(); M.flight = null; } }
    function flyTo(view, animate) {
      stopFlight();
      if (!animate || reduced() || !M.cur) {
        M.cur = view; apply(); placeLabels();
        labelsEl.classList.remove('is-moving');
        return;
      }
      labelsEl.classList.add('is-moving');
      const W = M.W, H = M.H;
      const toV = (s) => [(W / 2 - s.x) / s.k, (H / 2 - s.y) / s.k, W / s.k];
      const fromV = (v) => { const k = W / v[2]; return { k, x: W / 2 - v[0] * k, y: H / 2 - v[1] * k }; };
      const interp = d3.interpolateZoom.rho(1.25)(toV(M.cur), toV(view));
      const dur = clamp(interp.duration * 0.9, 1100, 2100);
      M.flight = d3.timer((el2) => {
        const t = Math.min(1, el2 / dur);
        M.cur = fromV(interp(d3.easeCubicInOut(t)));
        apply();
        if (t >= 1) {
          stopFlight();
          M.cur = view; apply(); placeLabels();
          requestAnimationFrame(() => labelsEl.classList.remove('is-moving'));
        }
      });
    }

    function syncMap(groupChanged) {
      if (!M.ready) return;
      winePaths.classed('is-on', (d) => d.key === sel).attr('aria-pressed', (d) => String(d.key === sel));
      hiPaths.classed('is-on', (d) => d.key === sel);
      const p = PIN[sel];
      if (p) {
        const lat = p[1], lon = p[0];
        coordEl.innerHTML = `<span>${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'}</span><span>${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'}</span>`;
      }
      if (!M.introDone) { placeLabels(); return; }
      if (groupChanged) flyTo(targetView(), true);
      else placeLabels();
    }

    function layout() {
      const W = mapEl.clientWidth, H = mapEl.clientHeight;
      if (W < 40 || H < 40) return false;
      M.W = W; M.H = H;
      proj = d3.geoNaturalEarth1().rotate([-11, 0]).fitExtent([[0, 0], [W, H]], { type: 'Sphere' });
      d3.select(svgEl).attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
      return true;
    }

    async function buildMap() {
      await loadLibs();
      const world = await loadWorld(opts.geoUrl || 'geo/world-110m.json');
      if (!alive) return;
      d3 = window.d3;
      const objKey = world.objects.countries ? 'countries' : Object.keys(world.objects)[0];
      const fs = window.topojson.feature(world, world.objects[objKey]).features;
      const wine = [];
      const rest = [];
      fs.forEach((f) => {
        const name = f.properties && f.properties.name;
        const key = keys.find((k) => (byKey[k].en && byKey[k].en === name) || ISO[k] === String(f.id));
        if (key) {
          const keep = KEEP[key];
          if (keep && f.geometry.type === 'MultiPolygon') {
            // light up only the wine-growing mainland (France without Guiana, USA without Alaska and Hawaii)
            const polys = f.geometry.coordinates;
            const inP = polys.filter((poly) => keep(poly[0][0]));
            const outP = polys.filter((poly) => !keep(poly[0][0]));
            if (outP.length) rest.push({ type: 'Feature', id: f.id + '-o', properties: {}, geometry: { type: 'MultiPolygon', coordinates: outP } });
            if (inP.length) f = { ...f, geometry: { type: 'MultiPolygon', coordinates: inP } };
          }
          wine.push({ key, f });
        } else if (String(f.id) !== '010') rest.push(f);
      });
      const svg = d3.select(svgEl).attr('focusable', 'false');
      const defs = svg.append('defs');
      const lg = defs.append('linearGradient').attr('id', `${uid}-foil`).attr('x1', '0').attr('y1', '0').attr('x2', '1').attr('y2', '1');
      [[0, '#a9844f'], [0.34, '#f1ddb2'], [0.52, '#c29c63'], [0.74, '#f6e6c2'], [1, '#b38d57']].forEach(([o, c]) => lg.append('stop').attr('offset', o).attr('stop-color', c));
      const flt = defs.append('filter').attr('id', `${uid}-glow`).attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
      blurEl = flt.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', 4).attr('result', 'b');
      flt.append('feComponentTransfer').attr('in', 'b').attr('result', 'g').append('feFuncA').attr('type', 'linear').attr('slope', 0.55);
      const mg = flt.append('feMerge');
      mg.append('feMergeNode').attr('in', 'g');
      mg.append('feMergeNode').attr('in', 'SourceGraphic');

      gZoom = svg.append('g').attr('class', 'wjc-zoom');
      gZoom.append('path').attr('class', 'wjc-grat').datum(d3.geoGraticule10());
      gZoom.append('g').attr('class', 'wjc-land').selectAll('path').data(rest).join('path');
      winePaths = gZoom.append('g').attr('class', 'wjc-wine').selectAll('path').data(wine).join('path')
        .attr('tabindex', 0).attr('role', 'button').attr('focusable', 'true')
        .attr('aria-label', (d) => `${byKey[d.key].ko} 등급 보기`);
      hiPaths = gZoom.append('g').attr('class', 'wjc-hi').selectAll('path').data(wine).join('path')
        .attr('fill', `url(#${uid}-foil)`).attr('filter', `url(#${uid}-glow)`);
      // geoPath reads the GeoJSON; keep key on the datum
      const geo = (d) => d.f;
      const setD = () => {
        const path = d3.geoPath(proj);
        gZoom.select('path.wjc-grat').attr('d', path);
        gZoom.selectAll('.wjc-land path').attr('d', path);
        winePaths.attr('d', (d) => path(geo(d)));
        hiPaths.attr('d', (d) => path(geo(d)));
      };

      // labels
      labelsEl.innerHTML = keys.filter((k) => PIN[k]).map((k) => `<div class="wjc-pin side-${PIN[k][2]}" data-k="${k}"><i class="wjc-dot"></i><span class="wjc-tx">${esc(byKey[k].ko)}</span></div>`).join('');
      labelsEl.querySelectorAll('.wjc-pin').forEach((elp) => {
        const k = elp.dataset.k;
        pins[k] = { el: elp, tx: elp.querySelector('.wjc-tx'), lon: PIN[k][0], lat: PIN[k][1] };
      });

      // events
      winePaths.on('click', (e, d) => select(d.key))
        .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(d.key); } })
        .on('pointerenter', (e, d) => pins[d.key] && pins[d.key].el.classList.add('is-hover'))
        .on('pointerleave', (e, d) => pins[d.key] && pins[d.key].el.classList.remove('is-hover'));
      on(labelsEl, 'click', (e) => { const p = e.target.closest('.wjc-pin'); if (p) select(p.dataset.k); });
      on(labelsEl, 'pointerover', (e) => { const p = e.target.closest('.wjc-pin'); winePaths.classed('is-hover', (d) => !!p && d.key === p.dataset.k); });
      on(labelsEl, 'pointerout', () => winePaths.classed('is-hover', false));

      const relayout = () => {
        if (!layout()) return false;
        setD();
        stopFlight();
        M.cur = targetView();
        apply();
        M.ready = true;
        placeLabels();
        if (M.introDone) labelsEl.classList.remove('is-moving');
        return true;
      };
      let introStarted = false;
      const ok = relayout();
      root.querySelector('.wjc-wait').remove();
      mapEl.classList.add('is-ready');
      syncMap(false);

      let lastW = M.W, lastH = M.H, raf = 0;
      if ('ResizeObserver' in window) {
        const ro = new ResizeObserver(() => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            const W = mapEl.clientWidth, H = mapEl.clientHeight;
            if (Math.abs(W - lastW) < 1 && Math.abs(H - lastH) < 1 && M.ready) { syncTabs(false); return; }
            lastW = W; lastH = H;
            if (relayout() && !introStarted) startIntro();
            syncTabs(false);
          });
        });
        ro.observe(mapEl);
        cleanups.push(() => { ro.disconnect(); cancelAnimationFrame(raf); });
      }

      // signature moment: the camera flies from the whole world to the selected region once the map is seen
      function startIntro() {
        if (introStarted || !M.ready) return;
        introStarted = true;
        const go = () => { M.introDone = true; flyTo(targetView(), !reduced()); };
        if (reduced() || !('IntersectionObserver' in window)) { go(); return; }
        const io = new IntersectionObserver((ents) => {
          if (ents.some((x) => x.isIntersecting)) { io.disconnect(); setTimeout(() => alive && go(), 250); }
        }, { threshold: 0.35 });
        io.observe(mapEl);
        cleanups.push(() => io.disconnect());
      }
      if (ok) startIntro();
    }

    /* ----- select ----- */
    function select(k, force) {
      if (!byKey[k] || !keys.includes(k)) return;
      if (k === sel && !force) return;
      const prevG = GROUP_OF[sel];
      sel = k;
      syncTabs(true);
      renderPanel(true);
      syncMap(prevG !== GROUP_OF[k]);
    }

    // first paint
    syncTabs(false);
    renderPanel(true);
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fontsReady.then(() => alive && syncTabs(false));

    const ready = buildMap().catch((e) => {
      console.warn('[WJClasses] map', e);
      const w = root.querySelector('.wjc-wait');
      if (w) w.textContent = '지도를 불러오지 못했습니다. 위의 나라 이름을 누르면 등급을 볼 수 있습니다.';
      mapEl.classList.add('is-failed');
    });

    return {
      ready,
      select: (k) => select(k),
      setDepth,
      get selected() { return sel; },
      destroy() {
        alive = false;
        stopFlight();
        anims.forEach((a) => a.cancel());
        cleanups.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
        el.innerHTML = '';
      },
    };
  }

  function destroy() {
    if (inst) { inst.destroy(); inst = null; }
  }
  function mount(el, opts) {
    destroy();
    if (!el) return Promise.reject(new Error('WJClasses.mount: no element'));
    inst = create(el, opts || {});
    const api = inst;
    return inst.ready.then(() => api);
  }

  window.WJClasses = {
    mount,
    destroy,
    select: (k) => inst && inst.select(k),
    get instance() { return inst; },
  };
})();
