/* W.J Wine Journey */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const wide = () => matchMedia('(min-width: 900px)').matches;
  document.documentElement.classList.add('js-ready');

  const TYPES = ['레드', '화이트', '샴페인', '스파클링', '로제', '스위트', '주정강화'];
  const ORDER = ['프랑스', '이탈리아', '스페인', '포르투갈', '독일', '오스트리아', '미국', '칠레', '아르헨티나', '호주', '뉴질랜드', '남아공'];
  const WORDS = {
    body: ['아주 가벼움', '가벼움', '중간', '묵직함', '아주 묵직함'],
    acidity: ['부드러움', '순한 편', '적당함', '새콤함', '아주 새콤함'],
    tannin: ['거의 없음', '부드러움', '적당함', '떫은 편', '아주 떫음'],
    sweetness: ['드라이', '거의 드라이', '약간 달콤', '달콤함', '아주 달콤함'],
  };
  const PNAME = { body: ['바디', '묵직함'], acidity: ['산도', '새콤함'], tannin: ['타닌', '떫은맛'], sweetness: ['당도', '단맛'] };
  const PHELP = {
    body: '입안을 채우는 무게감입니다. 물과 우유의 차이처럼, 묵직할수록 입안이 꽉 찹니다.',
    acidity: '침이 고이게 하는 새콤한 정도입니다. 높을수록 상큼하고 음식과 잘 어울립니다.',
    tannin: '포도 껍질과 씨, 오크통에서 오는 떫은 느낌입니다. 진한 홍차를 마셨을 때 입안이 마르는 느낌과 비슷합니다.',
    sweetness: '와인에 남은 단맛입니다. 드라이는 단맛이 거의 없다는 뜻입니다.',
  };
  const AROMA_GROUPS = [
    ['붉고 검은 과일', ['cherry', 'raspberry', 'strawberry', 'plum', 'blackcurrant', 'blackberry', 'fig', 'pomegranate', 'cranberry']],
    ['노란 과일과 시트러스', ['lemon', 'lime', 'grapefruit', 'green_apple', 'pear', 'peach', 'apricot', 'pineapple', 'melon']],
    ['꽃과 풀', ['violet', 'rose', 'orange_blossom', 'lavender', 'mint', 'eucalyptus', 'thyme', 'bell_pepper', 'olive']],
    ['향신료와 숙성', ['vanilla', 'cinnamon', 'clove', 'black_pepper', 'tobacco', 'coffee', 'chocolate', 'leather', 'mushroom']],
    ['빵 · 꿀 · 돌 · 바다', ['honey', 'toast', 'almond', 'butter', 'flint', 'slate', 'oyster', 'licorice', 'cedar']],
  ];

  const S = { wines: [], tiers: [], countries: {}, aromas: {}, grapes: [], basics: null, byId: {},
    filter: { tier: 0, types: new Set(), countries: new Set(), axis: new Set(), q: '', sort: 'rec' } };

  const won = (v) => {
    if (v == null) return '';
    if (v >= 10000) { const m = Math.round(v / 1000) / 10; return `${m % 1 ? m.toFixed(1) : m}만 원`; }
    return `${v.toLocaleString('ko-KR')}원`;
  };
  const priceOf = (w) => (w.price && w.price.v) || null;
  const icon = (key) => `url('img/icons/${key}.webp')`;

  /* ---------------- data ---------------- */
  async function getJSON(p, fallback) {
    try { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw 0; return await r.json(); } catch { return fallback; }
  }
  async function load() {
    const [wines, tiers, countries, aromas, red, white, basics] = await Promise.all([
      getJSON('data/wines.json', []), getJSON('data/tiers.json', []), getJSON('data/countries.json', {}),
      getJSON('data/aromas.json', []), getJSON('data/grapes_red.json', null), getJSON('data/grapes_white.json', null), getJSON('data/basics.json', null),
    ]);
    S.wines = wines; S.tiers = tiers; S.countries = countries; S.basics = basics;
    aromas.forEach((a) => (S.aromas[a.key] = a.ko));
    S.grapes = [...((red && red.items) || []), ...((white && white.items) || [])];
    wines.forEach((w) => (S.byId[w.id] = w));
  }

  /* ---------------- toast ---------------- */
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1900);
  }

  /* ---------------- list ---------------- */
  const saveData = () => !!(navigator.connection && navigator.connection.saveData);
  const two = (n) => String(n).padStart(2, '0');
  const SORT_LABEL = { rec: '나라순', price: '낮은 가격순', rate: '평점 높은 순' };
  function matches(w) {
    const f = S.filter;
    if (f.types.size && !f.types.has(w.type)) return false;
    if (f.countries.size && !f.countries.has(w.country)) return false;
    if (f.axis.size && !(w.axis || []).some((a) => f.axis.has(a))) return false;
    if (f.q) {
      const hay = [w.name, w.en, w.grape, w.country, w.region, w.region_ko, w.hook, w.type].join(' ').toLowerCase();
      if (!f.q.toLowerCase().split(/\s+/).every((t) => hay.includes(t))) return false;
    }
    return true;
  }
  function sorted(list) {
    const s = S.filter.sort;
    const l = [...list];
    if (s === 'price') l.sort((a, b) => (priceOf(a) ?? 1e9) - (priceOf(b) ?? 1e9));
    else if (s === 'rate') l.sort((a, b) => ((b.vivino && b.vivino.r) || 0) - ((a.vivino && a.vivino.r) || 0));
    else l.sort((a, b) => ORDER.indexOf(a.country) - ORDER.indexOf(b.country));
    return l;
  }
  function cardHTML(w) {
    const p = priceOf(w);
    const axis = (w.axis || []).map((a) => `<span>${esc(a)}</span>`).join('');
    const hook = w.hook || w.note;
    return `<article class="card pre" data-id="${esc(w.id)}">
      <div class="card-stage"><span class="spot" aria-hidden="true"></span>
        ${axis ? `<div class="card-axis" aria-label="꼭 마셔 볼 이유">${axis}</div>` : ''}
        ${w.img ? `<img class="card-bottle" src="${esc(w.img.replace('bottles/', 'bottles/s/'))}" alt="" loading="lazy" decoding="async">` : '<span class="card-noimg">병 사진 준비 중</span>'}
      </div>
      <div class="card-info">
        <div class="card-kind"><i class="dot" data-type="${esc(w.type)}"></i><span>${esc(w.country)} · ${esc(w.type)} · ${esc(w.grape)}</span></div>
        <h3 class="card-name">${esc(w.name)}</h3>
        ${hook ? `<p class="card-hook">${esc(hook)}</p>` : ''}
        <div class="card-foot">${p ? `<span class="card-price">${won(p)}</span>` : '<span class="card-price" style="color:var(--muted);font-weight:500">국내가 확인 중</span>'}${w.vivino ? `<span class="card-rate">${w.vivino.r.toFixed(1)}</span>` : ''}</div>
      </div>
      <a class="card-open" href="#/wine/${esc(w.id)}" aria-label="${esc(w.name)} 자세히 보기"></a>
    </article>`;
  }
  function renderList() {
    const box = $('#tiers');
    const shown = S.wines.filter(matches);
    let html = '';
    for (const t of S.tiers) {
      const items = sorted(shown.filter((w) => w.tier === t.tier));
      if (!items.length) continue;
      html += `<section class="tier" id="tier-${t.tier}" data-tier="${t.tier}" aria-labelledby="th-${t.tier}">
        <header class="chapter">
          <div class="chapter-media" data-media="${esc(t.img)}"><img src="media/${esc(t.img)}-s.webp" srcset="media/${esc(t.img)}-s.webp 800w, media/${esc(t.img)}.webp 1600w" sizes="100vw" alt="" loading="lazy" decoding="async"></div>
          <div class="chapter-veil"></div>
          <div class="chapter-copy">
            <span class="chapter-no" aria-hidden="true">${two(t.tier)}</span>
            <p class="chapter-meta"><span>${esc(t.range)}</span><i></i><span>${esc(t.concept)}</span><i></i><span>${items.length}병</span></p>
            <h2 class="chapter-title" id="th-${t.tier}">${esc(t.headline)}</h2>
            <p class="chapter-body">${esc(t.body)}</p>
          </div>
        </header>
        <div class="shelf">
          <div class="shelf-head"><span class="eyebrow" lang="en">Journey ${two(t.tier)}</span><span>${esc(SORT_LABEL[S.filter.sort] || '')} · ${items.length}병</span></div>
          <div class="grid">${items.map(cardHTML).join('')}</div>
        </div>
      </section>`;
    }
    box.innerHTML = html;
    $('#empty').hidden = !!shown.length;
    renderRail(shown);
    renderActiveFilters();
    observeCards();
    if (window.__fxReady) setupScrollFX();
  }
  function renderRail(shown) {
    const counts = {};
    shown.forEach((w) => (counts[w.tier] = (counts[w.tier] || 0) + 1));
    $('#rail-track').innerHTML = S.tiers.map((t) => `<button class="chip" type="button" data-tier="${t.tier}" aria-pressed="false"><em>${two(t.tier)}</em> ${esc(t.range)} <b>${counts[t.tier] || 0}</b></button>`).join('');
    const n = S.filter.types.size + S.filter.countries.size + S.filter.axis.size + (S.filter.q ? 1 : 0);
    const c = $('.filter-count'); c.hidden = !n; c.textContent = n;
  }
  function renderActiveFilters() {
    const f = S.filter; const box = $('#active-filters');
    const chips = [];
    f.types.forEach((v) => chips.push(['types', v, v]));
    f.countries.forEach((v) => chips.push(['countries', v, v]));
    f.axis.forEach((v) => chips.push(['axis', v, `기준 ${v}`]));
    if (f.q) chips.push(['q', f.q, `「${f.q}」`]);
    box.hidden = !chips.length;
    box.innerHTML = chips.map(([k, v, l]) => `<button class="chip" type="button" data-unset="${k}" data-v="${esc(v)}" aria-label="${esc(l)} 조건 지우기">${esc(l)}</button>`).join('');
  }
  let cardIO;
  function observeCards() {
    if (cardIO) cardIO.disconnect();
    if (reduce || !('IntersectionObserver' in window)) { $$('.card.pre').forEach((c) => c.classList.replace('pre', 'in')); return; }
    cardIO = new IntersectionObserver((ents) => {
      const vis = ents.filter((e) => e.isIntersecting).map((e) => e.target);
      vis.forEach((el, i) => { el.style.transitionDelay = `${Math.min(i, 6) * 90}ms`; el.classList.replace('pre', 'in'); cardIO.unobserve(el); });
    }, { rootMargin: '0px 0px -10% 0px' });
    $$('.card.pre').forEach((c) => cardIO.observe(c));
  }
  let railIO;
  function setupRailSpy() {
    if (railIO) railIO.disconnect();
    railIO = new IntersectionObserver((ents) => {
      ents.forEach((e) => {
        if (!e.isIntersecting) return;
        const t = e.target.dataset.tier;
        $$('#rail-track .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.tier === t)));
        const on = $(`#rail-track .chip[data-tier="${t}"]`);
        const track = $('#rail-track');
        if (on && track) track.scrollTo({ left: on.offsetLeft - (track.clientWidth - on.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('.tier').forEach((s) => railIO.observe(s));
  }
  function jumpToTier(n) {
    const sec = $(`#tier-${n}`);
    if (sec) scrollToY(sec.getBoundingClientRect().top + scrollY);
  }

  /* ---------------- the five journeys index ---------------- */
  function renderJourneys() {
    const counts = {};
    S.wines.forEach((w) => (counts[w.tier] = (counts[w.tier] || 0) + 1));
    $('#jlist').innerHTML = S.tiers.map((t) => `<li class="jrow"><a href="#tier-${t.tier}" data-jump="${t.tier}" data-img="${esc(t.img)}">
      <span class="jrow-bg" aria-hidden="true" style="--img:url('media/${esc(t.img)}-s.webp')"></span>
      <span class="jno">${two(t.tier)}</span>
      <span class="jmeta"><span class="jrange">${esc(t.range)}</span><i></i><span>${esc(t.concept)}</span></span>
      <span class="jtitle">${esc(t.headline)}</span>
      <span class="jcount">${counts[t.tier] || 0}<small>병</small></span>
      <i class="cta-ic jarrow" aria-hidden="true"></i></a></li>`).join('');
    setupPeek();
  }
  // the tier picture rises softly behind the list; variant chosen with ?peek=a|b|c|d
  const PEEK = (new URLSearchParams(location.search).get('peek') || 'c').toLowerCase(); // owner chose C (2026-10-06)
  document.documentElement.dataset.peek = PEEK;
  let peekBound = false;
  function setupPeek() {
    const sec = $('#journeys');
    if (!sec || peekBound) return;
    peekBound = true;
    const back = document.createElement('div');
    back.className = 'jback'; back.setAttribute('aria-hidden', 'true');
    back.innerHTML = S.tiers.map((t) => `<img src="media/${esc(t.img)}.webp" data-img="${esc(t.img)}" alt="" loading="lazy" decoding="async">`).join('');
    sec.prepend(back);
    const list = $('#jlist');
    const show = (img) => $$('img', back).forEach((im) => im.classList.toggle('on', im.dataset.img === img));
    list.addEventListener('pointerover', (e) => { const a = e.target.closest('a[data-img]'); if (a) show(a.dataset.img); });
    list.addEventListener('focusin', (e) => { const a = e.target.closest('a[data-img]'); if (a) show(a.dataset.img); });
    list.addEventListener('pointerleave', () => show(''));
    list.addEventListener('focusout', (e) => { if (!list.contains(e.relatedTarget)) show(''); });
  }

  /* ---------------- hero ---------------- */
  function heroVideo() {
    const v = $('.hero-video');
    if (!v || reduce || saveData()) return;
    const portrait = matchMedia('(max-aspect-ratio: 1/1)').matches;
    v.src = portrait ? 'media/hero_grape-m.mp4' : `media/hero_grape-${innerWidth >= 1100 ? 'd' : 'dm'}.mp4`;
    v.addEventListener('playing', () => v.classList.add('on'), { once: true });
    v.play().catch(() => {});
    new IntersectionObserver((e) => (e[0].isIntersecting ? v.play().catch(() => {}) : v.pause())).observe($('#hero'));
  }
  let heroTL = null;
  function setupHero() {
    const counts = { wines: S.wines.length, countries: Object.keys(S.countries).length || 12 };
    $$('[data-count]').forEach((el) => (el.textContent = counts[el.dataset.count]));
    heroVideo();
    if (!window.gsap || reduce) return;
    gsap.registerPlugin(ScrollTrigger);
    heroTL = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } });
    heroTL.fromTo('.hero-media', { scale: 1.16 }, { scale: 1, duration: 3.4, ease: 'power2.out' }, 0)
      .from('.hero-copy .eyebrow', { autoAlpha: 0, x: -24, duration: 1.4 }, 0.5)
      .from('.hero-title .ln > span', { yPercent: 118, duration: 1.8, stagger: 0.14 }, 0.6)
      .from('.hero-ko', { autoAlpha: 0, y: 20, duration: 1.4 }, 1.3)
      .from('.hero-foot > *', { autoAlpha: 0, y: 12, duration: 1.2, stagger: 0.08 }, 1.7)
      .from('#topbar', { autoAlpha: 0, duration: 1.2, clearProps: 'opacity,visibility' }, 1.2);
    $$('[data-count]').forEach((el) => {
      const end = +el.textContent; const o = { v: 0 };
      heroTL.to(o, { v: end, duration: 1.8, ease: 'power2.out', onUpdate: () => (el.textContent = Math.round(o.v)) }, 1.7);
    });
    gsap.to('.hero-poster, .hero-video', { yPercent: 9, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } });
  }
  const playIntro = () => heroTL && heroTL.play();

  /* ---------------- age gate ---------------- */
  // age gate is off for now (owner, 2026-10-06); flip to true when the site needs it again
  const AGE_GATE = false;
  function setupGate() {
    const g = $('#gate');
    if (!AGE_GATE || localStorageGet('wj-age') === '1') return Promise.resolve();
    g.hidden = false;
    document.documentElement.classList.add('locked');
    lenis && lenis.stop();
    requestAnimationFrame(() => { const y = $('[data-gate="yes"]', g); y && y.focus({ preventScroll: true }); });
    return new Promise((res) => {
      g.addEventListener('click', (e) => {
        const b = e.target.closest('[data-gate]'); if (!b) return;
        if (b.dataset.gate === 'no') { $('.gate-actions', g).hidden = true; $('.gate-bye', g).hidden = false; return; }
        localStorageSet('wj-age', '1');
        const done = () => { g.hidden = true; document.documentElement.classList.remove('locked'); lenis && lenis.start(); };
        if (window.gsap && !reduce) {
          g.classList.add('leaving');
          gsap.timeline({ onComplete: done })
            .to('.gate-card', { autoAlpha: 0, y: -24, duration: 0.6, ease: 'power2.in' })
            .to(g, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.3, ease: 'expo.inOut' }, 0.35);
          setTimeout(res, 700);
        } else { done(); res(); }
      });
    });
  }

  /* ---------------- curtain between views ---------------- */
  let curtainBusy = false;
  function curtain(swap) {
    const c = $('.curtain');
    if (!window.gsap || reduce || curtainBusy) { swap(); return; }
    curtainBusy = true;
    const logo = $('.logo', c);
    gsap.timeline({ onComplete: () => (curtainBusy = false) })
      .set(c, { transformOrigin: '50% 100%' })
      .to(c, { scaleY: 1, duration: 0.75, ease: 'expo.inOut' })
      .to(logo, { autoAlpha: 1, duration: 0.35 }, '-=0.2')
      .add(() => { swap(); if (lenis) lenis.scrollTo(0, { immediate: true }); else window.scrollTo(0, 0); })
      .set(c, { transformOrigin: '50% 0%' }, '+=0.2')
      .to(logo, { autoAlpha: 0, duration: 0.3 })
      .to(c, { scaleY: 0, duration: 0.85, ease: 'expo.inOut' }, '<0.05');
  }

  /* ---------------- menu (phones) ---------------- */
  function toggleMenu(open) {
    const m = $('#menu'), b = $('.menu-btn');
    open = open ?? m.hidden;
    if (open === !m.hidden) return;
    m.hidden = !open; b.setAttribute('aria-expanded', String(open)); b.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    document.documentElement.classList.toggle('locked', open);
    lenis && (open ? lenis.stop() : lenis.start());
    $('#topbar').classList.remove('hide');
    if (open && window.gsap && !reduce) gsap.from('#menu nav > *, .menu-slogan', { yPercent: 50, autoAlpha: 0, duration: 1.1, stagger: 0.07, ease: 'expo.out' });
  }

  /* ---------------- scroll FX ---------------- */
  let lenis = null;
  let fxTriggers = [];
  function setupSmoothScroll() {
    if (!fine || reduce || !window.Lenis || !window.gsap || lenis) return;
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true, virtualScroll: (d) => sceneWheel(d), prevent: (node) => !!(node.closest && node.closest('#sheet, .rail-track, .study-tabs, #map-host, .menu, .gate')) });
    lenis.on('scroll', () => { window.ScrollTrigger && ScrollTrigger.update(); settleScene(); });
    gsap.ticker.add((t) => lenis && lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  function scrollToY(y) {
    if (lenis) lenis.scrollTo(y, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  }
  function splitLines(el) {
    if (!window.SplitText || !el) return null;
    if (el._split) return el._split;
    el._split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'sl' });
    return el._split;
  }
  function splitWords(el) {
    if (!el) return [];
    if (!el.dataset.split) {
      el.innerHTML = el.textContent.trim().split(/\s+/).map((w) => `<span class="w">${esc(w)}</span>`).join(' ');
      el.dataset.split = 1;
    }
    return $$('.w', el);
  }
  function chapterVideo(media, on) {
    if (reduce || saveData()) return;
    let v = $('video', media);
    if (on && !v) {
      v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true'); v.tabIndex = -1;
      v.src = `media/${media.dataset.media}-${innerWidth >= 900 ? 'd' : 'm'}.mp4`;
      v.addEventListener('playing', () => v.classList.add('on'), { once: true });
      media.append(v);
    }
    if (!v) return;
    if (on) v.play().catch(() => {}); else v.pause();
  }
  function setupScrollFX() {
    if (!window.gsap || !window.ScrollTrigger || reduce) {
      // still give the chapters their motion pictures when GSAP is missing
      if (!reduce && 'IntersectionObserver' in window) {
        const io = new IntersectionObserver((ents) => ents.forEach((e) => chapterVideo(e.target, e.isIntersecting)));
        $$('.chapter-media').forEach((m) => io.observe(m));
      }
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    if (window.SplitText) gsap.registerPlugin(SplitText);
    fxTriggers.forEach((t) => t && t.kill()); fxTriggers = [];
    const add = (tw) => { if (!tw) return; if (tw.scrollTrigger) fxTriggers.push(tw.scrollTrigger); else if (tw.kill) fxTriggers.push(tw); };
    // every scene plays its whole entrance once it is clearly on screen; nothing waits half done
    const scene = (trigger, start = 'top 62%') => gsap.timeline({ defaults: { ease: 'expo.out' }, scrollTrigger: { trigger, start, once: true } });

    // manifesto: the label photo opens like a curtain, then the words rise
    const mf = $('#manifesto');
    if (mf) {
      const sp = splitLines($('.mf-lead', mf));
      const tl = scene(mf, 'top 55%');
      tl.fromTo($('.mf-media', mf), { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'expo.inOut' })
        .fromTo($('.mf-media img', mf), { scale: 1.18 }, { scale: 1, duration: 2.6, ease: 'power3.out' }, 0)
        .from($('.eyebrow', mf), { autoAlpha: 0, x: -20, duration: 1.1 }, 0.7)
        .from(sp ? sp.lines : $('.mf-lead', mf), { yPercent: 110, duration: 1.4, stagger: 0.09 }, 0.8)
        .from($$('.mf-body, .mf-ask', mf), { autoAlpha: 0, y: 24, duration: 1.2, stagger: 0.12 }, 1.2);
      add(tl);
    }

    // section heads
    $$('.sec-head').forEach((h) => {
      const sp = splitLines($('h2', h));
      const tl = scene(h, 'top 78%');
      tl.from($('.eyebrow', h), { autoAlpha: 0, x: -20, duration: 1.1 })
        .from(sp ? sp.lines : $('h2', h), { yPercent: 110, duration: 1.4, stagger: 0.09 }, 0.1)
        .from($('p', h) || [], { autoAlpha: 0, y: 20, duration: 1.2 }, 0.4);
      add(tl);
    });
    add(gsap.from('.jrow', { autoAlpha: 0, y: 30, duration: 1.2, stagger: 0.08, ease: 'expo.out', clearProps: 'transform', scrollTrigger: { trigger: '#jlist', start: 'top 80%', once: true } }));

    // chapters: the scene settles in one move; when the shelf arrives the copy steps aside in one move
    $$('.tier').forEach((sec) => {
      const media = $('.chapter-media', sec), shelf = $('.shelf', sec), copy = $('.chapter-copy', sec);
      const sp = splitLines($('.chapter-title', sec));
      const tl = scene(sec, 'top 60%');
      tl.fromTo(media, { scale: 1.14 }, { scale: 1, duration: 2.8, ease: 'power3.out' })
        .from($('.chapter-meta', sec), { autoAlpha: 0, x: -18, duration: 1.1 }, 0.35)
        .from(sp ? sp.lines : $('.chapter-title', sec), { yPercent: 112, duration: 1.4, stagger: 0.09 }, 0.4)
        .from($('.chapter-body', sec), { autoAlpha: 0, y: 22, duration: 1.2 }, 0.7)
        .from($('.chapter-no', sec), { autoAlpha: 0, y: 40, duration: 1.6 }, 0.5);
      add(tl);
      const away = gsap.to(copy, { autoAlpha: 0, y: -36, duration: 0.7, ease: 'power2.inOut', paused: true });
      add(ScrollTrigger.create({ trigger: shelf, start: 'top 72%', onEnter: () => away.play(), onLeaveBack: () => away.reverse() }));
      add(ScrollTrigger.create({ trigger: sec, start: 'top bottom', endTrigger: shelf, end: 'top top', onToggle: (self) => chapterVideo(media, self.isActive) }));
    });

    // explore + footer
    add(gsap.from('.tile', { autoAlpha: 0, y: 50, duration: 1.4, stagger: 0.12, ease: 'expo.out', clearProps: 'transform', scrollTrigger: { trigger: '.bento', start: 'top 82%', once: true } }));
    const fl = $('.foot-brand .logo-xl');
    if (fl) add(gsap.from(fl, { yPercent: 30, autoAlpha: 0, duration: 1.8, ease: 'expo.out', scrollTrigger: { trigger: fl, start: 'top 92%', once: true } }));
    ScrollTrigger.refresh();
    setupSnap();
  }

  /* scrolling with a few soft stops: the opening trio moves scene by scene, the rest scrolls freely
     and glides onto a chapter cover only when it comes to rest close to one */
  const SC = { steps: [], magnets: [], busy: false, acc: 0, accT: 0, settleT: 0 };
  function buildAnchors() {
    SC.steps = []; SC.magnets = [];
    if (currentView !== 'list') return;
    const top = (el) => (el && !el.hidden ? Math.round(el.getBoundingClientRect().top + scrollY) : null);
    SC.steps = [0, top($('#manifesto')), top($('#journeys'))].filter((v) => v != null);
    SC.magnets = [...SC.steps, ...$$('.tier').map(top)].filter((v) => v != null).sort((x, y) => x - y);
  }
  function sceneTo(target, duration = 1.2) {
    // never wait on a move that will not happen, and never stay blocked if a move is cut short
    if (Math.abs(target - lenis.scroll) < 2) return;
    SC.busy = true;
    clearTimeout(SC.busyT);
    SC.busyT = setTimeout(() => (SC.busy = false), duration * 1000 + 700);
    lenis.scrollTo(target, { duration, easing: (t) => 1 - Math.pow(1 - t, 4), onComplete: () => { clearTimeout(SC.busyT); SC.busyT = setTimeout(() => (SC.busy = false), 300); } });
  }
  function sceneWheel(data) {
    const e = data.event;
    if (!e || !e.type.includes('wheel') || e.ctrlKey || currentView !== 'list' || SC.steps.length < 2) return true;
    if (e.target && e.target.closest && e.target.closest('#sheet, .menu, #map-host, .rail-track, .study-tabs, .gate')) return true;
    const dy = data.deltaY;
    if (!dy) return true;
    if (SC.busy) { e.preventDefault(); return false; }
    const y = lenis.targetScroll, dir = dy > 0 ? 1 : -1;
    const i = SC.steps.findIndex((v) => Math.abs(v - y) < 6);
    // only the opening scenes step: hero <-> manifesto <-> journeys
    const stepping = i >= 0 && ((dir > 0 && i < SC.steps.length - 1) || (dir < 0 && i > 0));
    if (!stepping) return true;
    e.preventDefault();
    SC.acc += dy; clearTimeout(SC.accT); SC.accT = setTimeout(() => (SC.acc = 0), 220);
    if (Math.abs(SC.acc) < 20) return false;
    SC.acc = 0;
    sceneTo(SC.steps[i + dir]);
    return false;
  }
  // when scrolling comes to rest near a scene, glide onto it; far from one, leave it alone
  function settleScene() {
    clearTimeout(SC.settleT);
    SC.settleT = setTimeout(() => {
      if (!lenis || SC.busy || currentView !== 'list' || !SC.magnets.length || sheet.open) return;
      // only pull forward, in the direction the reader was already going; never drag them back
      const y = lenis.scroll, reach = innerHeight * 0.22, dir = lenis.direction || 0;
      if (!dir) return;
      const ahead = SC.magnets.filter((v) => (dir > 0 ? v > y + 3 : v < y - 3));
      if (!ahead.length) return;
      const near = dir > 0 ? Math.min(...ahead) : Math.max(...ahead);
      if (Math.abs(near - y) < reach) sceneTo(near, 0.8);
    }, 320);
  }
  function setupSnap() {
    buildAnchors();
    if (window.ScrollTrigger && !SC.bound) { SC.bound = true; ScrollTrigger.addEventListener('refresh', buildAnchors); }
  }

  /* ---------------- sheet ---------------- */
  const sheet = $('#sheet');
  let sheetReturn = null;
  function openSheet(html, { label = '', onOpen } = {}) {
    $('#sheet-body').innerHTML = html;
    sheet.setAttribute('aria-label', label);
    if (!sheet.open) { sheet.showModal(); document.documentElement.classList.add('locked'); lenis && lenis.stop(); }
    $('#sheet-body').scrollTop = 0;
    const hd = $('#sheet-body h2'); if (hd) { hd.setAttribute('tabindex', '-1'); hd.focus({ preventScroll: true }); }
    onOpen && onOpen();
  }
  function closeSheet() {
    if (!sheet.open) return;
    sheet.close();
  }
  sheet.addEventListener('close', () => {
    document.documentElement.classList.remove('locked'); lenis && lenis.start();
    if (location.hash.startsWith('#/wine/')) history.replaceState(null, '', sheetReturn || '#/list');
    sheetReturn = null;
  });
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
  // drag to dismiss (phones)
  (() => {
    let y0 = null, dy = 0;
    const inner = $('.sheet-inner', sheet);
    const start = (e) => {
      if (wide()) return;
      const body = $('#sheet-body');
      if (!e.target.closest('.sheet-grip') && body.scrollTop > 0) return;
      y0 = e.clientY; dy = 0; sheet.style.transition = 'none';
    };
    const move = (e) => {
      if (y0 == null) return;
      dy = Math.max(0, e.clientY - y0);
      if (dy > 4) sheet.style.transform = `translateY(${dy}px)`;
    };
    const end = () => {
      if (y0 == null) return;
      sheet.style.transition = ''; sheet.style.transform = '';
      if (dy > 120) closeSheet();
      y0 = null;
    };
    inner.addEventListener('pointerdown', start);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  })();

  /* ---------------- wine detail ---------------- */
  function profileHTML(p) {
    if (!p) return '';
    return `<div class="profile">${['body', 'acidity', 'tannin', 'sweetness'].map((k) => {
      const v = p[k];
      if (v == null) return '';
      return `<div class="prow"><button class="pname" type="button" data-help="${k}" aria-expanded="false">${PNAME[k][1]}<small>${PNAME[k][0]} <span class="qmark" aria-hidden="true">?</span></small></button><span class="pdots" aria-label="${PNAME[k][1]} 5단계 중 ${v}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</span><span class="pword">${WORDS[k][v - 1]}</span><p class="phelp" hidden>${PHELP[k]}</p></div>`;
    }).join('')}</div>`;
  }
  function wineHTML(w) {
    const p = w.price || {};
    const viv = w.vivino;
    const t = S.tiers.find((x) => x.tier === w.tier) || {};
    const country = S.countries[w.ck] || {};
    const region = (country.regions || []).find((r) => r.key === w.rkey);
    const aromas = (w.aromas || []).map((k) => `<span class="aroma"><i style="--icon:${icon(k)}"></i>${esc(S.aromas[k] || k)}</span>`).join('');
    const pairing = (w.pairing || '').split(/\s*[·,]\s*/).filter(Boolean).map((x) => `<span class="chip">${esc(x)}</span>`).join('');
    const sec = (title, body) => (body ? `<div class="sec"><h3>${title}</h3><p>${esc(body)}</p></div>` : '');
    return `<article class="wd">
      <div class="wd-stage" style="--wd-bg:url('media/tier${w.tier}-s.webp')">${w.img ? `<img class="wd-bottle" src="${esc(w.img)}" alt="${esc(w.name)} 병 사진">` : ''}</div>
      <div class="wd-content">
        <header>
          <div class="wd-kind"><i class="dot" data-type="${esc(w.type)}"></i>${esc(w.type)}<span>·</span>${esc(w.grape)}<span>·</span>${esc(w.country)}${w.region_ko || w.region ? ` ${esc(w.region_ko || w.region)}` : ''}</div>
          <h2 class="wd-name" id="sheet-title">${esc(w.name)}</h2>
          ${w.en ? `<p class="wd-en" lang="en">${esc(w.en)}</p>` : ''}
          ${w.axis ? `<div class="axis-badges">${w.axis.map((a) => `<span class="axis-badge">꼭 마셔 볼 이유 · ${esc(a)}</span>`).join('')}</div>` : ''}
          ${w.hook ? `<p class="wd-hook">${esc(w.hook)}</p>` : w.note ? `<p class="wd-hook">${esc(w.note)}</p>` : ''}
        </header>
        <dl class="facts">
          <div class="fact"><dt>국내 판매가</dt><dd>${p.v ? `${p.v.toLocaleString('ko-KR')}원` : '확인 중'}</dd><small>${esc([p.src, p.checked].filter(Boolean).join(' · '))}</small></div>
          <div class="fact"><dt>Vivino 평점</dt><dd>${viv ? `${viv.r.toFixed(1)} / 5` : '확인 중'}</dd><small>${viv && viv.c ? `평가 ${viv.c.toLocaleString('ko-KR')}개 · ` : ''}${viv && viv.url ? `<a href="${esc(viv.url)}" target="_blank" rel="noopener">Vivino 에서 보기</a>` : ''}</small></div>
          <div class="fact"><dt>가격대</dt><dd>${esc(t.range || '')}</dd><small>${esc(t.concept || '')}</small></div>
          <div class="fact"><dt>스타일</dt><dd>${esc(w.type)}</dd><small>${esc(w.grape)}</small></div>
        </dl>
        ${w.why ? `<div class="why"><h3>꼭 마셔 봐야 하는 이유</h3><p>${esc(w.why)}</p></div>` : ''}
        ${w.profile ? `<div class="sec"><h3>맛의 생김새</h3>${profileHTML(w.profile)}</div>` : ''}
        ${aromas ? `<div class="sec"><h3>잔에서 만나는 향</h3><div class="aroma-row">${aromas}</div></div>` : ''}
        ${pairing ? `<div class="sec"><h3>어울리는 음식</h3><div class="pairing">${pairing}</div></div>` : ''}
        <details class="more">
          <summary>자세히 보기</summary>
          <div class="more-body">
            ${sec('색과 모습', w.look)}${sec('향', w.aroma)}${sec('맛', w.taste)}${sec('뉘앙스', w.nuance)}
            ${sec('열기 좋은 순간', w.moment)}${sec('이야기', w.story)}${sec('마시는 법', w.serve)}
            ${w.tier_reason && !w.tier_reason_stale ? sec('이 가격대에 고른 이유', w.tier_reason) : ''}
            ${w.lat != null ? `<div class="sec"><h3>산지</h3><div class="mini-map" id="mini-map"><svg aria-label="${esc(w.country)} 지도 위 산지 위치"></svg><span class="mm-label">${esc(w.country)}${region ? ` · ${esc(region.ko)}` : ''}</span><a class="btn btn-ghost" href="#/map/${esc(w.ck)}${region ? `/${esc(region.key)}` : ''}">지도에서 보기</a></div></div>` : ''}
            <p class="src">${w.img_src ? `병 사진 출처 <a href="${esc(w.img_src)}" target="_blank" rel="noopener">${esc(new URL(w.img_src).hostname.replace('www.', ''))}</a>. ` : ''}${p.url ? `가격 출처 <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.src || '판매처')}</a>. ` : ''}${p.checked ? `${esc(p.checked)} 확인.` : ''}${p.memo ? ` ${esc(p.memo)}` : ''}</p>
          </div>
        </details>
        <div class="wd-actions"><button class="btn btn-ghost" type="button" data-action="share" data-id="${esc(w.id)}">이 와인 공유하기</button></div>
      </div>
    </article>`;
  }
  function openWine(id) {
    const w = S.byId[id];
    if (!w) return;
    if (!sheetReturn && !sheet.open) sheetReturn = lastViewHash;
    const run = () => openSheet(wineHTML(w), {
      label: w.name,
      onOpen: () => {
        if (window.gsap && !reduce) {
          const d = wide() ? 0.45 : 0.2;
          gsap.from('#sheet-body .wd-bottle', { yPercent: 9, autoAlpha: 0, duration: 1.6, ease: 'expo.out', delay: d });
          gsap.from('#sheet-body .wd-content > *', { y: 26, autoAlpha: 0, duration: 1.2, stagger: 0.07, ease: 'expo.out', delay: d + 0.1, clearProps: 'transform,opacity,visibility' });
          gsap.from('#sheet-body .pdots i.on', { scaleX: 0, duration: 0.6, stagger: 0.03, ease: 'power3.out', delay: d + 0.6 });
        }
        const det = $('#sheet-body details.more');
        if (det) det.addEventListener('toggle', () => det.open && drawMiniMap(w), { once: true });
      },
    });
    run();
  }

  /* ---------------- d3 + topo loader ---------------- */
  let d3p;
  function loadD3() {
    if (window.d3 && window.topojson) return Promise.resolve();
    d3p = d3p || new Promise((res, rej) => {
      const a = document.createElement('script'); a.src = 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js';
      const b = document.createElement('script'); b.src = 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js';
      let n = 0; const ok = () => ++n === 2 && res();
      a.onload = ok; b.onload = ok; a.onerror = rej; b.onerror = rej;
      document.head.append(a, b);
    });
    return d3p;
  }
  const topoCache = {};
  async function topo(name) {
    if (!topoCache[name]) topoCache[name] = fetch(`geo/${name}.json`).then((r) => r.json());
    return topoCache[name];
  }
  function feats(t) { const k = Object.keys(t.objects)[0]; return topojson.feature(t, t.objects[k]).features; }

  async function drawMiniMap(w) {
    const box = $('#mini-map svg'); if (!box || w.lat == null) return;
    await loadD3();
    const fc = { type: 'FeatureCollection', features: feats(await topo(w.ck)) };
    const W = box.clientWidth || 400, H = 220;
    const proj = d3.geoMercator().fitExtent([[16, 16], [W - 16, H - 36]], fc);
    const path = d3.geoPath(proj);
    const svg = d3.select(box).attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('g').selectAll('path').data(fc.features).join('path').attr('d', path)
      .attr('fill', (f) => (d3.geoContains(f, [w.lon, w.lat]) ? 'rgba(205,176,132,.30)' : 'rgba(242,236,227,.05)'))
      .attr('stroke', 'rgba(242,236,227,.14)').attr('stroke-width', 0.6);
    const [x, y] = proj([w.lon, w.lat]);
    const g = svg.append('g').attr('transform', `translate(${x},${y})`);
    g.append('circle').attr('r', 14).attr('fill', 'rgba(205,176,132,.22)');
    g.append('circle').attr('r', 5).attr('fill', '#e6d3ad').attr('stroke', '#0b0a09').attr('stroke-width', 2);
    if (window.gsap && !reduce) gsap.from(g.node(), { scale: 0, transformOrigin: '50% 50%', duration: 0.7, ease: 'back.out(2.2)' });
  }

  /* ---------------- map (module in map.js) ---------------- */
  let mapApi = null;
  async function showMap(country, region) {
    const host = $('#map-host');
    if (!window.WJMap) { if (!host.firstChild) host.innerHTML = '<p class="map-wait">지도를 준비하고 있습니다.</p>'; return; }
    try {
      if (!mapApi) {
        host.innerHTML = '';
        mapApi = await WJMap.mount(host, {
          wines: S.wines, countries: S.countries,
          onOpenWine: (id) => { location.hash = `#/wine/${id}`; },
          onRoute: (h) => { if (location.hash !== h) history.pushState(null, '', h); lastViewHash = h; },
        });
      }
      await mapApi.show(country, region);
      requestAnimationFrame(() => mapApi.resize && mapApi.resize());
    } catch (e) { console.warn('map', e); host.innerHTML = '<p class="map-wait">지도를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</p>'; }
  }

  /* ---------------- study ---------------- */
  function renderStudy() {
    const secs = [['aromas', '향 사전'], ['grapes', '품종 사전'], ['classes', '나라와 등급'], ['basics', '마시는 법'], ['quiz', '퀴즈']];
    $('#study-tabs').innerHTML = secs.map(([k, l]) => `<a class="chip" href="#/study/${k}" data-sec="${k}">${l}</a>`).join('');
    const pending = '<p class="lead">자료를 정리하고 있습니다.</p>';
    const aromaHTML = AROMA_GROUPS.map(([g, keys]) => `<div class="aroma-group"><h3>${g}</h3><div class="aroma-grid">${keys.map((k) => {
      const n = S.wines.filter((w) => (w.aromas || []).includes(k)).length;
      return `<button class="aroma-tile" type="button" data-aroma="${k}" aria-label="${esc(S.aromas[k] || k)} 향, 와인 ${n}병"><i style="--icon:${icon(k)}"></i>${esc(S.aromas[k] || k)}</button>`;
    }).join('')}</div></div>`).join('');
    const grapeHTML = S.grapes.length ? `<div class="grape-filter"><button class="chip" aria-pressed="true" data-gcolor="all">전체</button><button class="chip" aria-pressed="false" data-gcolor="red">레드</button><button class="chip" aria-pressed="false" data-gcolor="white">화이트</button></div>
      <div class="grape-grid">${S.grapes.map((g) => `<article class="grape-card" data-color="${esc(g.color)}"><h3>${esc(g.ko)}<small lang="en">${esc(g.en)}${(g.synonyms || []).length ? ` · ${esc(g.synonyms.join(', '))}` : ''}</small></h3>
        ${profileHTML(g.profile)}
        ${(g.aromas || []).length ? `<p>${esc(g.aromas.join(' · '))}</p>` : ''}
        <p class="easy-only">${esc(g.easy)}</p><p class="expert-only">${esc(g.expert)}</p>
        ${g.pairing ? `<p><b style="color:var(--accent);font-weight:600">어울리는 음식</b> ${esc(g.pairing)}</p>` : ''}
        ${(g.homes || []).length ? `<div class="homes">${g.homes.map((h) => { const c = Object.values(S.countries).find((x) => x.ko === h.country); return c ? `<a class="chip" href="#/map/${c.key}">${esc(h.country)} ${esc(h.region || '')}</a>` : `<span class="chip">${esc(h.country)} ${esc(h.region || '')}</span>`; }).join('')}</div>` : ''}
      </article>`).join('')}</div>` : pending;
    const cls = ORDER.map((ko) => Object.values(S.countries).find((c) => c.ko === ko)).filter((c) => c && (c.classification || []).length);
    const clsList = cls.length ? `<div class="cls-list">${cls.map((c) => `<details class="cls-country"><summary>${esc(c.ko)}</summary><div class="cls-body">${c.classification.map((x) => `<div class="cls-row"><strong>${esc(x.name)}</strong><p class="easy-only">${esc(x.easy)}</p><p class="expert-only">${esc(x.expert)}</p></div>`).join('')}</div></details>`).join('')}</div>` : pending;
    const clsHTML = cls.length && window.WJClasses ? '<div id="wjc-host"></div>' : clsList;
    const b = S.basics && S.basics.sections;
    const basicsHTML = b ? `<div class="basics">${b.map((s) => `<article class="basic-card"><h3>${esc(s.title)}</h3><p class="easy-only">${esc(s.easy)}</p><p class="expert-only">${esc(s.expert)}</p>${(s.items || []).map((t) => `<div class="term"><strong>${esc(t.term)}${t.plain ? `<em>${esc(t.plain)}</em>` : ''}</strong><p class="easy-only">${esc(t.easy)}</p><p class="expert-only">${esc(t.expert)}</p></div>`).join('')}</article>`).join('')}</div>` : pending;
    const quizzes = ORDER.map((ko) => Object.values(S.countries).find((c) => c.ko === ko)).filter(Boolean).flatMap((c) => (c.quiz || []).map((q, i) => ({ c, q, i })));
    const quizHTML = quizzes.length ? `<div class="quiz-wrap">${quizzes.map(({ c, q, i }) => `<article class="quiz" data-answer="${q.answer}"><span class="q-country">${esc(c.ko)}</span><h3>${esc(q.q)}</h3><div class="opts">${q.choices.map((ch, j) => `<button class="opt" type="button" data-j="${j}">${esc(ch)}</button>`).join('')}</div><p class="explain" hidden>${esc(q.explain)}</p></article>`).join('')}</div>` : pending;
    $('#study-body').innerHTML = `
      <section class="s-sec" id="s-aromas"><h2>향 사전</h2><p class="lead">와인 설명에 자주 나오는 향 마흔다섯 가지입니다. 그림을 누르면 그 향이 나는 와인을 보여 드립니다.</p><div class="aroma-groups">${aromaHTML}</div></section>
      <section class="s-sec" id="s-grapes"><h2>품종 사전</h2><p class="lead">포도 품종마다 맛의 생김새와 대표 산지를 모았습니다. 산지를 누르면 지도로 이동합니다.</p>${grapeHTML}</section>
      <section class="s-sec" id="s-classes"><h2>나라와 등급</h2><p class="lead">라벨에 적힌 등급 표기가 무엇을 뜻하는지 나라별로 정리했습니다.</p>${clsHTML}</section>
      <section class="s-sec" id="s-basics"><h2>마시는 법</h2><p class="lead">맛 읽는 법, 라벨 읽는 법, 만드는 방식, 온도와 잔, 고르는 요령, 보관하는 법입니다.</p>${basicsHTML}</section>
      <section class="s-sec" id="s-quiz"><h2>퀴즈</h2><p class="lead">나라마다 세 문제씩 준비했습니다. 처음 두 문제는 쉽고 마지막은 어렵습니다.</p>${quizHTML}</section>`;
    const wjcHost = $('#wjc-host');
    if (wjcHost && window.WJClasses) {
      Promise.resolve(WJClasses.mount(wjcHost, {
        countries: S.countries,
        depthGetter: () => (document.body.classList.contains('depth-expert') ? 'expert' : 'easy'),
      })).catch((e) => console.warn('classes', e));
    }
    setDepth(localStorageGet('depth') || 'easy');
  }
  function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
  function setDepth(d) {
    document.body.classList.toggle('depth-expert', d === 'expert');
    document.body.classList.toggle('depth-easy', d !== 'expert');
    const t = $('.depth-toggle'); const btns = $$('button', t);
    btns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.depth === d)));
    const on = btns.find((b) => b.dataset.depth === d);
    if (on) { t.style.setProperty('--pw', `${on.offsetWidth}px`); t.style.setProperty('--px', `${on.offsetLeft - 4}px`); }
    localStorageSet('depth', d);
  }
  function aromaSheet(k) {
    const list = S.wines.filter((w) => (w.aromas || []).includes(k));
    openSheet(`<div class="ps"><div class="aroma" style="width:auto;justify-items:start"><i style="--icon:${icon(k)};width:72px;height:72px"></i></div><h2>${esc(S.aromas[k] || k)} 향이 나는 와인</h2><p class="lead">${list.length}병입니다. 와인 설명의 향 · 맛 문장에서 찾았습니다.</p><div class="mini-wines">${list.map((w) => `<a class="mini-wine" href="#/wine/${w.id}">${w.img ? `<img src="${esc(w.img.replace('bottles/', 'bottles/s/'))}" alt="" loading="lazy">` : '<span></span>'}<span><strong>${esc(w.name)}</strong><span>${esc(w.country)} · ${esc(w.type)}</span></span><b>${priceOf(w) ? won(priceOf(w)) : ''}</b></a>`).join('')}</div></div>`, { label: `${S.aromas[k]} 향` });
  }
  function quizAnswer(btn) {
    const q = btn.closest('.quiz'); if (q.dataset.done) return;
    q.dataset.done = 1;
    const ans = +q.dataset.answer, j = +btn.dataset.j;
    $$('.opt', q).forEach((b) => { if (+b.dataset.j === ans) b.classList.add('right'); });
    if (j !== ans) {
      btn.classList.add('wrong');
      if (window.gsap && !reduce) gsap.fromTo(btn, { x: -6 }, { x: 0, duration: 0.42, ease: 'elastic.out(1, 0.3)' });
    } else if (window.gsap && !reduce) gsap.fromTo(btn, { scale: 0.96 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' });
    const ex = $('.explain', q); ex.hidden = false;
    if (window.gsap && !reduce) gsap.from(ex, { y: 8, autoAlpha: 0, duration: 0.4 });
  }

  /* ---------------- picker & filter ---------------- */
  function pickerSheet() {
    const st = { color: null, weight: null };
    const COL = [['레드', '레드'], ['화이트', '화이트'], ['스파클링', '거품 있는'], ['스위트', '달콤한']];
    const WEI = [['light', '가볍게'], ['bold', '진하게']];
    openSheet(`<div class="ps"><h2>처음이라면, 취향으로 세 병</h2><p class="lead">두 가지만 고르시면 6만 원대 와인 가운데 평이 좋은 세 병을 골라 드립니다.</p>
      <div class="q-block"><h3>어떤 와인이 끌리세요?</h3><div class="choice-row">${COL.map(([v, l]) => `<button class="choice" type="button" data-q="color" data-v="${v}" aria-pressed="false"><i class="dot" data-type="${v}"></i>${l}</button>`).join('')}</div></div>
      <div class="q-block"><h3>어떤 느낌이 좋으세요?</h3><div class="choice-row">${WEI.map(([v, l]) => `<button class="choice" type="button" data-q="weight" data-v="${v}" aria-pressed="false">${l}</button>`).join('')}</div></div>
      <div class="pick-results" id="pick-results"></div></div>`, { label: '취향으로 고르기' });
    const box = $('#sheet-body');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.choice'); if (!b) return;
      st[b.dataset.q] = b.dataset.v;
      $$(`.choice[data-q="${b.dataset.q}"]`, box).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (st.color && st.weight) {
        const okType = (w) => w.type === st.color || (st.color === '스파클링' && w.type === '샴페인');
        let list = S.wines.filter((w) => w.tier === 1 && okType(w));
        if (!list.length) list = S.wines.filter(okType);
        const bodyOf = (w) => (w.profile && w.profile.body) || 3;
        list.sort((a, b) => (st.weight === 'light' ? bodyOf(a) - bodyOf(b) : bodyOf(b) - bodyOf(a)) || (((b.vivino || {}).r || 0) - ((a.vivino || {}).r || 0)));
        $('#pick-results').innerHTML = `<h3 style="margin:0 0 4px;font-size:15px">이 세 병부터 시작해 보세요</h3>` + list.slice(0, 3).map((w) => `<a class="mini-wine" href="#/wine/${w.id}">${w.img ? `<img src="${esc(w.img.replace('bottles/', 'bottles/s/'))}" alt="">` : '<span></span>'}<span><strong>${esc(w.name)}</strong><span>${esc(w.hook || w.note || w.grape)}</span></span><b>${priceOf(w) ? won(priceOf(w)) : ''}</b></a>`).join('');
        if (window.gsap && !reduce) gsap.from('#pick-results > *', { y: 14, autoAlpha: 0, stagger: 0.06, duration: 0.5, ease: 'power3.out' });
      }
    });
  }
  function filterSheet(focusSearch) {
    const f = S.filter;
    const tmp = { types: new Set(f.types), countries: new Set(f.countries), axis: new Set(f.axis), q: f.q, sort: f.sort };
    const group = (title, key, opts) => `<div class="q-block"><h3>${title}</h3><div class="choice-row">${opts.map(([v, l, dot]) => `<button class="choice" type="button" data-k="${key}" data-v="${esc(v)}" aria-pressed="${tmp[key].has(v)}">${dot ? `<i class="dot" data-type="${esc(v)}"></i>` : ''}${esc(l)}</button>`).join('')}</div></div>`;
    openSheet(`<div class="ps"><h2>와인 찾기</h2>
      <label class="search-box"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input id="q" type="search" enterkeyhint="search" placeholder="이름, 품종, 산지로 찾기" value="${esc(tmp.q)}" autocomplete="off"></label>
      ${group('스타일', 'types', TYPES.map((t) => [t, t, 1]))}
      <p class="f-note">샴페인은 프랑스 샹파뉴 지방에서 병 속 2차 발효로 만든 스파클링만 쓸 수 있는 이름입니다. 스페인 카바 · 이탈리아 프로세코는 스파클링으로 나눴습니다.</p>
      ${group('나라', 'countries', ORDER.map((c) => [c, c]))}
      ${group('꼭 마셔 볼 기준', 'axis', [['맛', '맛이 뛰어난 병'], ['스토리', '이야기가 있는 병']])}
      <div class="q-block"><h3>정렬</h3><div class="choice-row">${[['rec', '나라순'], ['price', '낮은 가격순'], ['rate', '평점 높은 순']].map(([v, l]) => `<button class="choice" type="button" data-sort="${v}" aria-pressed="${tmp.sort === v}">${l}</button>`).join('')}</div></div>
      <div class="sheet-actions"><button class="btn btn-ghost" type="button" data-f="reset">모두 지우기</button><button class="btn btn-primary" type="button" data-f="apply">결과 보기 <span class="num" id="f-n"></span></button></div></div>`, { label: '와인 찾기' });
    const box = $('#sheet-body');
    const preview = () => {
      const save = S.filter; S.filter = tmp; const n = S.wines.filter(matches).length; S.filter = save;
      $('#f-n').textContent = `${n}병`;
    };
    preview();
    if (focusSearch) setTimeout(() => $('#q').focus(), 350);
    $('#q').addEventListener('input', (e) => { tmp.q = e.target.value.trim(); preview(); });
    $('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') box.querySelector('[data-f="apply"]').click(); });
    box.addEventListener('click', (e) => {
      const c = e.target.closest('.choice[data-k]');
      if (c) { const set = tmp[c.dataset.k]; set.has(c.dataset.v) ? set.delete(c.dataset.v) : set.add(c.dataset.v); c.setAttribute('aria-pressed', String(set.has(c.dataset.v))); preview(); return; }
      const s = e.target.closest('.choice[data-sort]');
      if (s) { tmp.sort = s.dataset.sort; $$('.choice[data-sort]', box).forEach((x) => x.setAttribute('aria-pressed', String(x === s))); return; }
      const a = e.target.closest('[data-f]');
      if (!a) return;
      if (a.dataset.f === 'reset') { tmp.types.clear(); tmp.countries.clear(); tmp.axis.clear(); tmp.q = ''; tmp.sort = 'rec'; $('#q').value = ''; $$('.choice', box).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.sort === 'rec'))); preview(); return; }
      S.filter = tmp; closeSheet();
      if (location.hash !== '#/list') location.hash = '#/list';
      renderList(); setupRailSpy();
      $('#tier-rail').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    });
  }

  /* ---------------- share ---------------- */
  async function share(id) {
    const w = S.byId[id]; const url = `${location.origin}${location.pathname}#/wine/${id}`;
    if (navigator.share) { try { await navigator.share({ title: w.name, text: w.hook || w.name, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('링크를 복사했습니다'); } catch { toast(url); }
  }

  /* ---------------- router ---------------- */
  let lastViewHash = '#/list';
  let currentView = null;
  let booted = false;
  function setView(v) {
    if (currentView === v) return;
    currentView = v;
    document.body.dataset.view = v;
    $$('.view').forEach((s) => (s.hidden = s.dataset.view !== v));
    $$('[data-tab]').forEach((a) => (a.dataset.tab === v ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    $('#site-foot').hidden = v === 'map';
    updateTopbar();
    if (window.ScrollTrigger) requestAnimationFrame(() => ScrollTrigger.refresh());
    if (lenis) (v === 'map' ? lenis.stop() : lenis.start());
    if (window.__fxReady) requestAnimationFrame(setupSnap);
  }
  function route() {
    const h = location.hash || '#/';
    const parts = h.replace(/^#\/?/, '').split('/').filter(Boolean);
    const [a, b, c] = parts;
    if (/^#tier-\d$/.test(h)) { history.replaceState(null, '', '#/'); if (!currentView) setView('list'); return jumpToTier(h.slice(6)); }
    if (a === 'wine') {
      if (!currentView) setView('list');
      return openWine(b);
    }
    if (sheet.open) closeSheet();
    toggleMenu(false);
    lastViewHash = h;
    const target = a === 'map' ? 'map' : a === 'study' ? 'study' : 'list';
    const go = () => {
      if (target === 'map') { setView('map'); return showMap(b, c); }
      if (target === 'study') {
        setView('study');
        requestAnimationFrame(() => setDepth(localStorageGet('depth') || 'easy'));
        if (b) { const el = $(`#s-${b}`); el && requestAnimationFrame(() => scrollToY(el.getBoundingClientRect().top + scrollY - 120)); }
        return;
      }
      setView('list');
      if (a === 'list') { const t = $('#journeys'); t && requestAnimationFrame(() => scrollToY(t.getBoundingClientRect().top + scrollY)); }
    };
    if (booted && currentView && target !== currentView) curtain(go); else go();
  }

  /* ---------------- top bar ---------------- */
  let heroVisible = true;
  function updateTopbar() { $('#topbar').classList.toggle('solid', currentView !== 'list' || !heroVisible); }
  new IntersectionObserver((e) => { heroVisible = e[0].isIntersecting; updateTopbar(); }, { rootMargin: '-80px 0px 0px 0px' }).observe($('#hero'));
  function setupNavHide() {
    if (!window.ScrollTrigger) return;
    const tb = $('#topbar');
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => {
      const hide = self.direction === 1 && self.scroll() > innerHeight * 0.7 && currentView !== 'map' && $('#menu').hidden;
      if (hide === tb.classList.contains('hide')) return;
      tb.classList.toggle('hide', hide);
      document.documentElement.classList.toggle('nav-hidden', hide);
    } });
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action],[data-tier],[data-jump],[data-unset],[data-aroma],[data-gcolor],[data-depth],[data-go],[data-help],.opt');
    if (!t) return;
    if (t.dataset.help) {
      const help = t.parentElement.querySelector('.phelp'); const open = help.hidden;
      help.hidden = !open; t.setAttribute('aria-expanded', String(open));
      if (open && window.gsap && !reduce) gsap.from(help, { y: -6, autoAlpha: 0, duration: 0.35, ease: 'power2.out' });
      return;
    }
    if (t.matches('.opt')) return quizAnswer(t);
    if (t.dataset.go) { location.hash = t.dataset.go; return; }
    if (t.dataset.jump) { e.preventDefault(); jumpToTier(t.dataset.jump); return; }
    if (t.dataset.depth && t.closest('.depth-toggle')) return setDepth(t.dataset.depth);
    if (t.dataset.aroma) return aromaSheet(t.dataset.aroma);
    if (t.dataset.gcolor) {
      $$('[data-gcolor]').forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
      $$('.grape-card').forEach((c) => (c.hidden = t.dataset.gcolor !== 'all' && c.dataset.color !== t.dataset.gcolor));
      return;
    }
    if (t.dataset.tier && t.closest('#rail-track')) {
      const sec = $(`#tier-${t.dataset.tier} .shelf`);
      if (sec) scrollToY(sec.getBoundingClientRect().top + scrollY - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--top-h')) || 64) - 54);
      return;
    }
    if (t.dataset.unset) {
      const k = t.dataset.unset; if (k === 'q') S.filter.q = ''; else S.filter[k].delete(t.dataset.v);
      renderList(); setupRailSpy(); return;
    }
    const a = t.dataset.action;
    if (a === 'close-sheet') closeSheet();
    else if (a === 'menu') toggleMenu();
    else if (a === 'picker') { toggleMenu(false); pickerSheet(); }
    else if (a === 'filter') filterSheet(false);
    else if (a === 'search') { toggleMenu(false); filterSheet(true); }
    else if (a === 'clear-filters') { S.filter = { tier: 0, types: new Set(), countries: new Set(), axis: new Set(), q: '', sort: 'rec' }; renderList(); setupRailSpy(); }
    else if (a === 'share') share(t.dataset.id);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#menu').hidden) toggleMenu(false); });
  $$('[data-scroll="journeys"]').forEach((el) => el.addEventListener('click', (e) => { if (location.hash === '#/list') { e.preventDefault(); route(); } }));
  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', () => { if (currentView === 'map' && location.hash.startsWith('#/map')) route(); });

  /* ---------------- boot ---------------- */
  load().then(() => {
    renderJourneys(); renderList(); setupRailSpy(); renderStudy();
    const boot = async () => {
      setupSmoothScroll(); setupHero();
      // lay the list out and wait for the serif fonts before splitting headlines into lines
      setView('list');
      if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]);
      setupScrollFX(); setupNavHide(); window.__fxReady = true;
      await setupGate();
      route(); booted = true; playIntro();
    };
    if (window.gsap) boot(); else window.addEventListener('load', boot, { once: true });
  });
})();
