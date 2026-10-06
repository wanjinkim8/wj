/* Wine Atlas map module.
   MapLibre GL JS 5 (lazy loaded) + OpenFreeMap dark, restyled at runtime.
   API: window.WJMap = { mount(el, opts), show(ck, rk), resize(), destroy() } */
(() => {
  'use strict';
  if (window.WJMap) return;

  const ML_V = '5.24.0';
  const ML_JS = `https://cdn.jsdelivr.net/npm/maplibre-gl@${ML_V}/dist/maplibre-gl.js`;
  const ML_CSS = `https://cdn.jsdelivr.net/npm/maplibre-gl@${ML_V}/dist/maplibre-gl.css`;
  const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
  const LOCAL_FONT = "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";

  // warm black, ivory, champagne gold (matches the site tokens)
  const PAL = {
    land: '#1b1815', water: '#0a0908', river: '#0e0c0b',
    border: 'rgba(242, 236, 227, 0.15)', acc: '#cdb084', accHi: '#e6d3ad', gold: '#cdb084',
    label: '#8f877c', labelDim: '#635c53', halo: '#0a0908', core: '#fbf3e3',
  };
  const ORDER = ['france', 'italy', 'spain', 'portugal', 'germany', 'austria', 'usa', 'chile', 'argentina', 'australia', 'newzealand', 'southafrica'];
  const ANCHOR = {
    france: [2.6, 46.7], italy: [12.4, 42.9], spain: [-3.7, 40.1], portugal: [-8.1, 39.8], germany: [10.3, 51.0], austria: [14.4, 47.6],
    usa: [-99, 39.3], chile: [-71.2, -31.8], argentina: [-65.4, -35.6], australia: [134, -25.6], newzealand: [172.4, -41.6], southafrica: [23.6, -30.6],
  };
  const LOCALE = {
    'AttributionControl.ToggleAttribution': '지도 출처 보기',
    'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl 키를 누른 채 스크롤하면 지도를 확대할 수 있습니다',
    'CooperativeGesturesHandler.MacHelpText': '⌘ 키를 누른 채 스크롤하면 지도를 확대할 수 있습니다',
    'CooperativeGesturesHandler.MobileHelpText': '두 손가락으로 지도를 움직일 수 있습니다',
    'Map.Title': '와인 산지 지도. 화살표 키로 움직일 수 있습니다',
  };
  const PANEL_W = 420, IDX_W = 300, EDGE = 24, WIDE = 900;
  const RAD = Math.PI / 180;

  const MQ = {
    reduce: matchMedia('(prefers-reduced-motion: reduce)'),
    fine: matchMedia('(hover: hover) and (pointer: fine)'),
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const won = (v) => {
    if (v == null) return '';
    if (v >= 10000) { const m = Math.round(v / 1000) / 10; return `${m % 1 ? m.toFixed(1) : m}만 원`; }
    return `${v.toLocaleString('ko-KR')}원`;
  };
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const angDist = (lon1, lat1, lon2, lat2) => {
    const c = Math.sin(lat1 * RAD) * Math.sin(lat2 * RAD) + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.cos((lon2 - lon1) * RAD);
    return Math.acos(clamp(c, -1, 1)) / RAD;
  };
  const mercY = (lat) => (1 - Math.log(Math.tan(Math.PI / 4 + clamp(lat, -85, 85) * RAD / 2)) / Math.PI) / 2;
  const unMercY = (y) => (2 * Math.atan(Math.exp(Math.PI * (1 - 2 * y))) - Math.PI / 2) / RAD;

  const thumb = (base, w) => (w && w.img ? base + String(w.img).replace(/^bottles\/(?!s\/)/, 'bottles/s/') : '');
  const ICON = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5v11M6.5 12h11"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12h11"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/></svg>',
    bottle: '<svg class="wj-ph-bottle" viewBox="0 0 40 120" aria-hidden="true"><path d="M16 4h8v26c0 6 8 9 8 22v60a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V52c0-13 8-16 8-22z"/><path d="M8 70h24M8 96h24" opacity=".5"/></svg>',
  };

  /* ---------- shared loaders ---------- */
  let mlP = null, styleP = null;
  const jsonP = {};
  function loadMapLibre() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (mlP) return mlP;
    mlP = new Promise((res, rej) => {
      if (!document.querySelector('link[data-wjmap-ml]')) {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = ML_CSS; l.dataset.wjmapMl = '';
        document.head.prepend(l); // map.css comes later and wins at equal specificity
      }
      const s = document.createElement('script');
      s.src = ML_JS; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = () => (window.maplibregl ? res(window.maplibregl) : rej(new Error('maplibre missing')));
      s.onerror = () => { mlP = null; s.remove(); rej(new Error('maplibre load failed')); };
      document.head.appendChild(s);
    });
    return mlP;
  }
  function getJSON(url) {
    if (!jsonP[url]) {
      jsonP[url] = fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); })
        .catch((e) => { delete jsonP[url]; throw e; });
    }
    return jsonP[url];
  }
  function getStyle() {
    if (!styleP) styleP = getJSON(STYLE_URL).catch((e) => { styleP = null; throw e; });
    return styleP;
  }

  /* ---------- TopoJSON (enough of it) ---------- */
  function topo(t) {
    const tf = t.transform;
    const arcs = t.arcs.map((a) => {
      if (!tf) return a.map((p) => [p[0], p[1]]);
      let x = 0, y = 0;
      return a.map((p) => { x += p[0]; y += p[1]; return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]]; });
    });
    const arc = (i) => (i >= 0 ? arcs[i] : arcs[~i].slice().reverse());
    const ring = (ids) => {
      const out = [];
      ids.forEach((i, k) => { const a = arc(i); for (let j = k ? 1 : 0; j < a.length; j++) out.push(a[j]); });
      if (out.length > 2) { const f = out[0], l = out[out.length - 1]; if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0], f[1]]); }
      return out;
    };
    const geom = (g) => {
      if (g.type === 'Polygon') return { type: 'Polygon', coordinates: g.arcs.map(ring) };
      if (g.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: g.arcs.map((p) => p.map(ring)) };
      return null;
    };
    const geoms = (name) => { const o = t.objects[name || Object.keys(t.objects)[0]]; return o.geometries || [o]; };
    return {
      features(name) {
        return geoms(name).map((g) => ({ type: 'Feature', properties: g.properties || {}, geometry: geom(g) })).filter((f) => f.geometry);
      },
      // arcs used by one polygon only: the outer edge of the whole object
      edge(name) {
        const use = new Map();
        const walk = (ids) => ids.forEach((i) => { const k = i < 0 ? ~i : i; use.set(k, (use.get(k) || 0) + 1); });
        geoms(name).forEach((g) => {
          if (g.type === 'Polygon') g.arcs.forEach(walk);
          else if (g.type === 'MultiPolygon') g.arcs.forEach((p) => p.forEach(walk));
        });
        const lines = [];
        use.forEach((n, k) => { if (n === 1) lines.push(arcs[k]); });
        return { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } };
      },
    };
  }

  /* ---------- data ---------- */
  function prep(wines, countries) {
    const byId = {};
    wines.forEach((w) => { if (w && w.id != null) byId[w.id] = w; });
    const keys = [...ORDER.filter((k) => countries[k]), ...Object.keys(countries).filter((k) => !ORDER.includes(k))];
    const out = {};
    let total = 0, max = 1;
    for (const key of keys) {
      const c = countries[key] || {};
      const seen = new Set();
      const regions = [];
      for (const r of c.regions || []) {
        const ws = (r.wines || []).map((id) => byId[id]).filter(Boolean);
        if (!ws.length) continue;
        let lat = r.lat, lon = r.lon;
        if (lat == null || lon == null) { const w0 = ws.find((w) => w.lat != null); if (!w0) continue; lat = w0.lat; lon = w0.lon; }
        ws.forEach((w) => seen.add(w.id));
        regions.push({ key: r.key, ck: key, ko: r.ko || r.en || r.key, en: r.en || '', parent: r.parent || '', lat, lon, grapes: r.grapes || [], style: r.style || '', desc: r.desc || '', wines: ws, n: ws.length });
      }
      const groups = {};
      wines.filter((w) => w.ck === key && !seen.has(w.id) && w.lat != null).forEach((w) => { const k = w.rkey || w.region_ko || w.region || w.id; (groups[k] = groups[k] || []).push(w); });
      Object.entries(groups).forEach(([k, ws]) => regions.push({ key: `${k}`, ck: key, ko: ws[0].region_ko || ws[0].region || c.ko, en: '', parent: '', lat: ws[0].lat, lon: ws[0].lon, grapes: [], style: '', desc: '', wines: ws, n: ws.length }));
      const n = regions.reduce((a, r) => a + r.n, 0);
      if (!n) continue;
      regions.sort((a, b) => b.n - a.n || b.lat - a.lat);
      const anchor = ANCHOR[key] || [regions.reduce((a, r) => a + r.lon, 0) / regions.length, regions.reduce((a, r) => a + r.lat, 0) / regions.length];
      out[key] = { key, ko: c.ko || key, en: c.en || '', headline: c.headline || '', art: c.art || '', regions, n, anchor };
      total += n; max = Math.max(max, n);
    }
    return { byId, countries: out, list: Object.values(out), total, max };
  }

  /* ---------- base style ---------- */
  function restyle(src, mini) {
    const s = JSON.parse(JSON.stringify(src));
    const nameKo = ['coalesce', ['get', 'name:ko'], ['get', 'name']];
    const keep = new Set(['background', 'water', 'waterway', 'landcover_ice_shelf', 'landcover_glacier', 'boundary_country_z0-4', 'boundary_country_z5-',
      'water_name', 'place_town', 'place_city', 'place_city_large', 'place_country_other', 'place_country_minor', 'place_country_major']);
    s.layers = s.layers.filter((l) => keep.has(l.id));
    const label = (l, size, color, minzoom, koOnly) => {
      l.minzoom = minzoom;
      l.layout = { ...l.layout, 'text-field': koOnly ? ['coalesce', ['get', 'name:ko'], ''] : nameKo, 'text-size': size, 'text-letter-spacing': 0.02, 'text-max-width': 8 };
      ['icon-image', 'icon-size', 'text-offset', 'text-anchor', 'text-justify', 'text-variable-anchor', 'text-transform'].forEach((k) => delete l.layout[k]);
      l.paint = { 'text-color': color, 'text-halo-color': PAL.halo, 'text-halo-width': 1.4, 'text-halo-blur': 0.6 };
    };
    for (const l of s.layers) {
      l.layout = l.layout || {};
      switch (l.id) {
        case 'background': l.paint = { 'background-color': PAL.land }; break;
        case 'water': l.paint = { 'fill-color': PAL.water, 'fill-antialias': true }; break;
        case 'waterway':
          l.minzoom = 5.5;
          l.paint = { 'line-color': PAL.river, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 10, 1.6], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 5.5, 0, 7, 1] };
          break;
        case 'landcover_ice_shelf': case 'landcover_glacier': l.paint = { 'fill-color': PAL.land, 'fill-opacity': 0.6 }; break;
        case 'boundary_country_z0-4': case 'boundary_country_z5-':
          l.paint = { 'line-color': PAL.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 5, 0.8, 9, 1.2], 'line-blur': 0.3 };
          break;
        case 'water_name':
          label(l, 11, 'rgba(176, 166, 150, 0.34)', mini ? 3 : 1);
          l.layout['text-letter-spacing'] = 0.3;
          l.paint['text-halo-width'] = 0;
          break;
        case 'place_town': label(l, 10.5, PAL.labelDim, 7.2, true); break;
        case 'place_city': label(l, 11, PAL.label, 5.6); break;
        case 'place_city_large': label(l, 12, PAL.label, 4.4); break;
        case 'place_country_other': case 'place_country_minor': case 'place_country_major':
          label(l, 11.5, 'rgba(165, 155, 140, 0.55)', mini ? 0 : 3.4);
          l.layout['text-letter-spacing'] = 0.12;
          break;
        default: break;
      }
    }
    // faint shaded relief from Natural Earth for depth, gone before it gets blurry
    if (s.sources.ne2_shaded) {
      const at = s.layers.findIndex((l) => l.id === 'water');
      s.layers.splice(at, 0, {
        id: 'wj-relief', type: 'raster', source: 'ne2_shaded', maxzoom: 8,
        paint: {
          'raster-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.42, 5, 0.34, 7.5, 0],
          'raster-saturation': -1, 'raster-contrast': 0.35, 'raster-brightness-min': 0.0, 'raster-brightness-max': 0.17, 'raster-fade-duration': 240,
        },
      });
    }
    s.projection = { type: mini ? 'mercator' : 'globe' };
    s.sky = { 'atmosphere-blend': 0 };
    s.transition = { duration: 300, delay: 0 };
    return s;
  }

  // MapLibre opens the compact attribution once its text arrives; fold it the first time on small maps
  function foldAttribution(root) {
    const a = root.querySelector('.maplibregl-ctrl-attrib');
    if (!a) return;
    const fold = () => { a.classList.remove('maplibregl-compact-show'); a.removeAttribute('open'); };
    if (a.classList.contains('maplibregl-compact-show')) { fold(); return; }
    const mo = new MutationObserver(() => { if (a.classList.contains('maplibregl-compact-show')) { mo.disconnect(); fold(); } });
    mo.observe(a, { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => mo.disconnect(), 8000);
  }
  function graticule() {
    const f = [];
    for (let lon = -180; lon < 180; lon += 30) { const c = []; for (let lat = -80; lat <= 80; lat += 2) c.push([lon, lat]); f.push(c); }
    for (let lat = -60; lat <= 60; lat += 30) { const c = []; for (let lon = -180; lon <= 180; lon += 2) c.push([lon, lat]); f.push(c); }
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: f } }] };
  }
  const EMPTY = { type: 'FeatureCollection', features: [] };

  function addCustom(st, D, worldTopo, mini) {
    const regionPts = [];
    D.list.forEach((c) => c.regions.forEach((r) => regionPts.push({ type: 'Feature', properties: { ck: c.key, rk: r.key, n: r.n }, geometry: { type: 'Point', coordinates: [r.lon, r.lat] } })));
    st.sources['wj-regions'] = { type: 'geojson', data: { type: 'FeatureCollection', features: regionPts } };
    st.sources['wj-country'] = { type: 'geojson', data: EMPTY };
    st.sources['wj-country-edge'] = { type: 'geojson', data: EMPTY };
    if (!mini) {
      const enToKey = {}; D.list.forEach((c) => (enToKey[c.en] = c.key));
      const feats = worldTopo ? topo(worldTopo).features('countries').filter((f) => enToKey[f.properties.name]) : [];
      feats.forEach((f, i) => { f.id = i + 1; f.properties = { key: enToKey[f.properties.name], n: D.countries[enToKey[f.properties.name]].n }; });
      st.sources['wj-world'] = { type: 'geojson', data: { type: 'FeatureCollection', features: feats } };
      st.sources['wj-grat'] = { type: 'geojson', data: graticule() };
    }
    const below = st.layers.findIndex((l) => l.id === 'water');
    const under = [];
    if (!mini) under.push({ id: 'wj-world-fill', type: 'fill', source: 'wj-world', paint: { 'fill-color': PAL.acc, 'fill-opacity': 0, 'fill-antialias': false } });
    under.push({ id: 'wj-country-fill', type: 'fill', source: 'wj-country', paint: { 'fill-color': PAL.acc, 'fill-opacity': 0, 'fill-antialias': false } });
    st.layers.splice(below, 0, ...under);
    const firstLabel = st.layers.findIndex((l) => l.type === 'symbol');
    const over = [];
    if (!mini) {
      over.push({ id: 'wj-grat', type: 'line', source: 'wj-grat', paint: { 'line-color': PAL.gold, 'line-opacity': 0, 'line-width': 0.6 } });
      over.push({ id: 'wj-world-glow', type: 'line', source: 'wj-world', layout: { 'line-join': 'round' }, paint: { 'line-color': PAL.acc, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 5, 5, 12], 'line-blur': ['interpolate', ['linear'], ['zoom'], 1, 5, 5, 11], 'line-opacity': 0 } });
      over.push({ id: 'wj-world-line', type: 'line', source: 'wj-world', layout: { 'line-join': 'round' }, paint: { 'line-color': PAL.accHi, 'line-width': 0.7, 'line-opacity': 0 } });
    }
    over.push({ id: 'wj-country-glow', type: 'line', source: 'wj-country-edge', layout: { 'line-join': 'round' }, paint: { 'line-color': PAL.acc, 'line-width': 12, 'line-blur': 11, 'line-opacity': 0 } });
    over.push({ id: 'wj-country-edge', type: 'line', source: 'wj-country-edge', layout: { 'line-join': 'round' }, paint: { 'line-color': PAL.accHi, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 8, 1.3], 'line-opacity': 0 } });
    over.push({
      id: 'wj-terroir', type: 'circle', source: 'wj-regions',
      paint: {
        'circle-color': PAL.acc, 'circle-blur': 1, 'circle-pitch-alignment': 'map', 'circle-opacity': 0,
        'circle-radius': ['interpolate', ['exponential', 1.6], ['zoom'], 1, ['+', 2, ['*', 0.7, ['get', 'n']]], 2.5, ['+', 4, ['*', 1.4, ['get', 'n']]], 4, ['+', 12, ['*', 4, ['get', 'n']]], 7, ['+', 40, ['*', 10, ['get', 'n']]], 10, ['+', 140, ['*', 26, ['get', 'n']]]],
      },
    });
    if (!mini) {
      over.push({ id: 'wj-terroir-core', type: 'circle', source: 'wj-regions', paint: { 'circle-color': PAL.core, 'circle-blur': 0.5, 'circle-pitch-alignment': 'map', 'circle-opacity': 0, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 0.5, 1, 3, 1.8, 5, 2.2] } });
    }
    st.layers.splice(firstLabel < 0 ? st.layers.length : firstLabel, 0, ...over);
  }

  /* ---------- instance ---------- */
  let uidN = 0;
  function createInstance(root, opts) {
    const mini = !!opts.mini;
    const base = opts.base || '';
    const D = prep(opts.wines || [], opts.countries || {});
    const uid = `wjm${++uidN}`;
    const S = { level: 'world', ck: null, rk: null, ready: false, dead: false, userMoved: false, kbd: false, flying: false, hot: null, revealed: false, sheet: 'closed', failed: false };
    const cleanups = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); cleanups.push(() => t.removeEventListener(ev, fn, o)); };
    const reduce = () => MQ.reduce.matches;
    let map = null, ml = null;
    const size = { w: root.clientWidth || 1, h: root.clientHeight || 1 };
    const isWide = () => size.w >= WIDE;
    const route = (h) => {
      if (opts.onRoute) opts.onRoute(h);
      const p = h.replace(/^#\/?/, '').split('/');
      if (p[0] === 'map') show(p[1] || null, p[2] || null);
    };

    root.classList.add('wjmap');
    root.classList.toggle('wjmap--mini', mini);
    root.classList.add('is-loading');

    if (mini) return createMini();

    root.innerHTML = `
      <div class="wj-stage">
        <div class="wj-canvas"></div>
        <div class="wj-halo" aria-hidden="true"></div>
        <div class="wj-vignette" aria-hidden="true"></div>
        <svg class="wj-leaders" aria-hidden="true"><path class="wj-ld"/><path class="wj-ld wj-ld--hot"/></svg>
        <div class="wj-dots" aria-hidden="true"></div>
        <div class="wj-pins" role="group" aria-label="지도 위 나라와 산지"></div>
      </div>
      <div class="wj-loader" role="status"><span class="wj-loader-ring" aria-hidden="true"></span><span class="wj-loader-text">지도를 불러오고 있습니다</span></div>
      <nav class="wj-crumbs" aria-label="지도 위치"><button class="wj-back" type="button" aria-label="한 단계 위로" hidden>${ICON.back}</button><ol></ol></nav>
      <section class="wj-index" aria-labelledby="${uid}-it"><div class="wj-index-in"></div></section>
      <div class="wj-ctrl" role="group" aria-label="지도 확대와 축소">
        <button type="button" data-zoom="in" aria-label="확대">${ICON.plus}</button>
        <button type="button" data-zoom="out" aria-label="축소">${ICON.minus}</button>
        <button type="button" data-zoom="home" aria-label="이 화면 처음 위치로">${ICON.home}</button>
      </div>
      <div class="wj-tip" role="tooltip" id="${uid}-tip" hidden></div>
      <div class="wj-wipe" aria-hidden="true"><i></i></div>
      <section class="wj-panel" aria-labelledby="${uid}-pt" inert>
        <div class="wj-grip" aria-hidden="true"><span></span></div>
        <div class="wj-panel-scroll" data-lenis-prevent><div class="wj-panel-body"></div></div>
      </section>
      <p class="wj-sr" aria-live="polite"></p>
      <div class="wj-probe" aria-hidden="true"></div>`;
    const $ = (s) => root.querySelector(s);
    const el = {
      stage: $('.wj-stage'), canvas: $('.wj-canvas'), halo: $('.wj-halo'), leaders: $('.wj-leaders'), ld: $('.wj-ld'), ldHot: $('.wj-ld--hot'),
      dots: $('.wj-dots'), pins: $('.wj-pins'), loader: $('.wj-loader'), crumbs: $('.wj-crumbs ol'), back: $('.wj-back'),
      index: $('.wj-index'), indexIn: $('.wj-index-in'), ctrl: $('.wj-ctrl'), tip: $('.wj-tip'), wipe: $('.wj-wipe'),
      probe: $('.wj-probe'), panel: $('.wj-panel'), scroll: $('.wj-panel-scroll'), body: $('.wj-panel-body'), grip: $('.wj-grip'), sr: $('.wj-sr'),
    };

    /* ----- chrome: crumbs, index, panel ----- */
    function crumbs() {
      const c = S.ck && D.countries[S.ck];
      const r = c && S.rk && c.regions.find((x) => x.key === S.rk);
      const items = [['세계', '#/map']];
      if (c) items.push([c.ko, `#/map/${c.key}`]);
      if (r) items.push([r.ko, `#/map/${c.key}/${r.key}`]);
      el.crumbs.innerHTML = items.map(([l, h], i) => {
        const last = i === items.length - 1;
        return `<li>${i ? '<span class="wj-sep" aria-hidden="true">›</span>' : ''}${last ? `<span class="wj-crumb" aria-current="location">${esc(l)}</span>` : `<button class="wj-crumb" type="button" data-go="${h}">${esc(l)}</button>`}</li>`;
      }).join('');
      el.back.hidden = !c;
    }
    function indexHTML() {
      if (!S.ck) {
        return `<div class="wj-idx-head wj-stag" style="--i:0"><h2 id="${uid}-it">나라를 골라 보세요</h2><p>${D.list.length}개 나라 · 와인 ${D.total}병</p></div>
          <ol class="wj-idx-list">${D.list.map((c, i) => `<li class="wj-stag" style="--i:${i + 1}"><button class="wj-row" type="button" data-go="#/map/${c.key}" data-hot="${c.key}"><span class="wj-row-nm">${esc(c.ko)}</span><span class="wj-row-bar" aria-hidden="true"><i style="--v:${(c.n / D.max).toFixed(3)}"></i></span><span class="wj-row-ct"><span class="wj-vh">와인 </span>${c.n}<span class="wj-vh">병</span></span></button></li>`).join('')}</ol>
          <p class="wj-idx-hint wj-stag" style="--i:${D.list.length + 1}">나라를 누르면 산지가 펼쳐집니다.</p>`;
      }
      const c = D.countries[S.ck];
      return `${c.art ? `<div class="wj-idx-art" style="--art:url('${esc(base + c.art)}')" aria-hidden="true"></div>` : ''}
        <div class="wj-idx-head wj-stag" style="--i:0"><h2 id="${uid}-it">${esc(c.ko)}</h2>${c.headline ? `<p class="wj-idx-hl">${esc(c.headline)}</p>` : ''}<p>산지 ${c.regions.length}곳 · 와인 ${c.n}병</p></div>
        <ol class="wj-idx-list">${c.regions.map((r, i) => `<li class="wj-stag" style="--i:${i + 1}"><button class="wj-row" type="button" data-go="#/map/${c.key}/${r.key}" data-hot="${r.key}"${r.key === S.rk ? ' aria-current="true"' : ''}><span class="wj-row-nm">${esc(r.ko)}${r.parent ? `<small>${esc(r.parent)}</small>` : ''}</span><span class="wj-row-ct"><span class="wj-vh">와인 </span>${r.n}<span class="wj-vh">병</span></span></button></li>`).join('')}</ol>
        <p class="wj-idx-hint wj-stag" style="--i:${c.regions.length + 1}">산지를 누르면 와인이 나옵니다.</p>`;
    }
    let indexKey = '';
    function renderIndex() {
      const key = S.ck || '_world';
      if (key !== indexKey) {
        indexKey = key;
        el.indexIn.innerHTML = indexHTML();
        el.indexIn.scrollTop = 0; el.indexIn.scrollLeft = 0;
        replay(el.indexIn);
      } else {
        el.indexIn.querySelectorAll('[data-hot]').forEach((b) => (b.dataset.hot === S.rk ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')));
      }
      const cur = S.rk && el.indexIn.querySelector(`[data-hot="${CSS.escape(S.rk)}"]`);
      if (cur && !isWide()) cur.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce() ? 'auto' : 'smooth' });
    }
    function replay(box) {
      box.classList.remove('is-in');
      void box.offsetWidth;
      box.classList.add('is-in');
    }
    const priceOf = (w) => (w.price && w.price.v) || null;
    function cardHTML(w, i) {
      const p = priceOf(w), v = w.vivino, axis = (w.axis || []).join(' · ');
      const label = [w.name, w.type, p ? won(p) : '가격 확인 중', v ? `Vivino ${v.r.toFixed(1)}` : '', axis ? `꼭 마셔 볼 이유 ${axis}` : ''].filter(Boolean).join(', ');
      return `<li class="wj-stag" style="--i:${i}"><button class="wj-card" type="button" data-wine="${esc(w.id)}" aria-label="${esc(label)}">
        <span class="wj-card-stage">${w.img ? `<img src="${esc(thumb(base, w))}" alt="" loading="lazy" decoding="async">` : ICON.bottle}</span>
        <span class="wj-card-body">
          <span class="wj-card-kind"><i class="wj-type" data-type="${esc(w.type)}"></i>${esc(w.type)}${w.grape ? ` · ${esc(w.grape)}` : ''}</span>
          <strong class="wj-card-name">${esc(w.name)}</strong>
          ${w.hook ? `<span class="wj-card-hook">${esc(w.hook)}</span>` : ''}
          <span class="wj-card-meta"><span class="wj-price">${p ? won(p) : '가격 확인 중'}</span>${v ? `<span class="wj-viv">Vivino <b>${v.r.toFixed(1)}</b></span>` : ''}${axis ? `<span class="wj-axis">꼭 마셔 볼 이유 · ${esc(axis)}</span>` : ''}</span>
        </span>
      </button></li>`;
    }
    function panelHTML(c, r) {
      const grapes = (r.grapes || []).slice(0, 3).join(' · ');
      let i = 0;
      return `<header class="wj-ph wj-stag" style="--i:${i++}">
          <p class="wj-ph-kicker">${esc(c.ko)}${r.parent ? ` · ${esc(r.parent)}` : ''}</p>
          <h2 class="wj-ph-title" id="${uid}-pt" tabindex="-1">${esc(r.ko)}</h2>
          ${r.en ? `<p class="wj-ph-en" lang="en">${esc(r.en)}</p>` : ''}
          <button class="wj-x" type="button" data-act="close" aria-label="산지 창 닫기">${ICON.close}</button>
        </header>
        <p class="wj-facts wj-stag" style="--i:${i++}"><span>와인 <b>${r.n}</b>병</span>${grapes ? `<span>${esc(grapes)}</span>` : ''}</p>
        ${r.style ? `<p class="wj-note-lead wj-stag" style="--i:${i++}">${esc(r.style)}</p>` : ''}
        ${r.desc ? `<p class="wj-note wj-stag" style="--i:${i++}">${esc(r.desc)}</p>` : ''}
        <h3 class="wj-sub wj-stag" style="--i:${i++}">이 산지의 와인 ${r.n}병</h3>
        <ul class="wj-cards">${r.wines.map((w, k) => cardHTML(w, i + k)).join('')}</ul>
        <button class="wj-more wj-stag" style="--i:${i + r.n}" type="button" data-go="#/map/${c.key}">${esc(c.ko)} 산지 모두 보기</button>`;
    }
    function openPanel(c, r) {
      const was = root.classList.contains('has-panel');
      el.body.innerHTML = panelHTML(c, r);
      el.scroll.scrollTop = 0;
      el.panel.inert = false;
      root.classList.add('has-panel');
      if (!was) { el.wipe.classList.remove('is-run'); void el.wipe.offsetWidth; el.wipe.classList.add('is-run'); }
      replay(el.body);
      if (!isWide()) setSheet(S.sheet === 'full' && was ? 'full' : 'half', !was);
      if (S.kbd) requestAnimationFrame(() => { const t = el.body.querySelector('.wj-ph-title'); t && t.focus({ preventScroll: true }); });
    }
    function closePanel() {
      if (!root.classList.contains('has-panel')) return;
      const hadFocus = el.panel.contains(document.activeElement);
      root.classList.remove('has-panel');
      el.panel.inert = true;
      if (!isWide()) setSheet('closed');
      return hadFocus;
    }

    /* ----- phone sheet ----- */
    const sheetPos = () => {
      const top = 0, h = el.panel.offsetHeight || size.h;
      return { full: top, half: Math.round(h * 0.44), closed: h + 24 };
    };
    function setSheet(state, fromBelow, recam) {
      const was = S.sheet;
      S.sheet = state;
      if (isWide()) { el.panel.style.removeProperty('--sy'); return; }
      const pos = sheetPos();
      if (fromBelow) { el.panel.classList.add('is-snap-off'); el.panel.style.setProperty('--sy', `${pos.closed}px`); void el.panel.offsetWidth; el.panel.classList.remove('is-snap-off'); }
      el.panel.style.setProperty('--sy', `${pos[state]}px`);
      el.panel.dataset.sheet = state;
      measureUI();
      if (recam && was !== state && S.level === 'region' && map && S.ready && state === 'half') camera(false, 700);
    }
    (function sheetDrag() {
      let d = null;
      const start = (y) => { d = { y0: y, base: sheetPos()[S.sheet] || 0, last: y, t: performance.now(), v: 0, moved: false }; };
      const move = (y) => {
        if (!d) return;
        const dy = y - d.y0;
        if (!d.moved && Math.abs(dy) < 6) return;
        if (!d.moved) { d.moved = true; el.panel.classList.add('is-dragging'); }
        const now = performance.now();
        d.v = (y - d.last) / Math.max(1, now - d.t); d.last = y; d.t = now;
        const pos = sheetPos();
        let ny = d.base + dy;
        if (ny < pos.full) ny = pos.full - Math.sqrt(pos.full - ny) * 2;
        el.panel.style.setProperty('--sy', `${ny}px`);
      };
      const end = () => {
        if (!d) return;
        const moved = d.moved, v = d.v;
        const pos = sheetPos();
        const y = parseFloat(el.panel.style.getPropertyValue('--sy')) || 0;
        el.panel.classList.remove('is-dragging');
        d = null;
        if (!moved) return;
        let next;
        if (v > 0.55) next = S.sheet === 'full' && y < pos.half ? 'half' : 'closed';
        else if (v < -0.55) next = 'full';
        else next = y < (pos.full + pos.half) / 2 ? 'full' : y < (pos.half + pos.closed) / 2 ? 'half' : 'closed';
        if (next === 'closed') { setSheet('closed'); route(`#/map/${S.ck}`); } else setSheet(next, false, true);
      };
      on(el.grip, 'pointerdown', (e) => { if (isWide()) return; el.grip.setPointerCapture(e.pointerId); start(e.clientY); });
      on(el.grip, 'pointermove', (e) => move(e.clientY));
      on(el.grip, 'pointerup', end); on(el.grip, 'pointercancel', end);
      // content: in half state any vertical drag moves the sheet, in full state only a pull down from the top
      let ty = null, owned = false;
      on(el.scroll, 'touchstart', (e) => { if (isWide() || e.touches.length > 1) return; ty = e.touches[0].clientY; owned = false; }, { passive: true });
      on(el.scroll, 'touchmove', (e) => {
        if (ty == null || isWide()) return;
        const y = e.touches[0].clientY, dy = y - ty;
        if (!owned) {
          const want = S.sheet === 'half' ? Math.abs(dy) > 6 : (el.scroll.scrollTop <= 0 && dy > 6);
          if (!want) return;
          owned = true; start(ty);
        }
        e.preventDefault(); move(y);
      }, { passive: false });
      const tend = () => { if (owned) end(); ty = null; owned = false; };
      on(el.scroll, 'touchend', tend); on(el.scroll, 'touchcancel', tend);
      on(el.scroll, 'wheel', (e) => { if (!isWide() && S.sheet === 'half' && e.deltaY > 0) { e.preventDefault(); setSheet('full'); } }, { passive: false });
    })();

    /* ----- pins ----- */
    let pins = [];
    let pinsKey = '';
    function pinItems() {
      if (!S.ck) return D.list.map((c) => ({ id: c.key, kind: 'country', lon: c.anchor[0], lat: c.anchor[1], name: c.ko, n: c.n, r: 3.2 + Math.sqrt(c.n) * 0.85, base: c.n }));
      const c = D.countries[S.ck];
      return c.regions.slice().sort((a, b) => b.lat - a.lat).map((r) => ({ id: r.key, kind: 'region', ck: c.key, lon: r.lon, lat: r.lat, name: r.ko, n: r.n, r: 3.8 + Math.sqrt(r.n) * 1.25, base: r.n * 10 + r.lat / 100 }));
    }
    function buildPins() {
      const key = S.ck || '_world';
      if (key === pinsKey) return;
      pinsKey = key;
      tipHide(true);
      el.pins.textContent = ''; el.dots.textContent = '';
      pins = pinItems();
      pins.forEach((p, i) => {
        const dot = document.createElement('span');
        dot.className = `wj-dot wj-dot--${p.kind}`;
        dot.style.setProperty('--r', `${p.r.toFixed(1)}px`);
        dot.innerHTML = '<i></i>';
        dot.dataset.id = p.id;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `wj-pin wj-pin--${p.kind} is-new`;
        b.dataset.id = p.id;
        b.style.setProperty('--i', i);
        b.setAttribute('aria-label', p.kind === 'country' ? `${p.name}, 와인 ${p.n}병, 산지 ${D.countries[p.id].regions.length}곳` : `${p.name}, 와인 ${p.n}병`);
        b.setAttribute('aria-describedby', `${uid}-tip`);
        b.innerHTML = `<span class="wj-pin-nm">${esc(p.name)}</span><span class="wj-pin-ct">${p.n}</span>`;
        el.dots.appendChild(dot); el.pins.appendChild(b);
        p.dot = dot; p.el = b; p.cand = -1; p.tx = ''; p.dx = '';
      });
      measurePins();
      el.pins.classList.add('is-pre');
      el.leaders.classList.add('is-pre');
    }
    function measurePins() { pins.forEach((p) => { p.w = p.el.offsetWidth || 60; p.h = p.el.offsetHeight || 24; }); }
    function revealPins() {
      el.pins.classList.add('is-revealing');
      el.pins.classList.remove('is-pre');
      el.leaders.classList.remove('is-pre');
      pins.forEach((p) => p.el.classList.remove('is-new'));
      clearTimeout(revealPins.t);
      revealPins.t = setTimeout(() => el.pins.classList.remove('is-revealing'), 1400);
    }

    // label candidates: 8 near positions, then callouts with a leader line
    const NEAR = ['R', 'L', 'T', 'B', 'TR', 'BR', 'TL', 'BL'];
    const CALL = [];
    [36, 60, 88].forEach((dd) => [0, 180, -32, 32, 148, -148, -90, 90].forEach((a) => CALL.push([dd, a])));
    function candRect(k, ax, ay, r, w, h) {
      if (k < NEAR.length) {
        const g = r + 7, gd = (r + 5) * 0.72;
        switch (NEAR[k]) {
          case 'R': return { x: ax + g, y: ay - h / 2 };
          case 'L': return { x: ax - g - w, y: ay - h / 2 };
          case 'T': return { x: ax - w / 2, y: ay - g - h };
          case 'B': return { x: ax - w / 2, y: ay + g };
          case 'TR': return { x: ax + gd, y: ay - gd - h };
          case 'BR': return { x: ax + gd, y: ay + gd };
          case 'TL': return { x: ax - gd - w, y: ay - gd - h };
          default: return { x: ax - gd - w, y: ay + gd };
        }
      }
      const [dd, a] = CALL[k - NEAR.length];
      const cx = Math.cos(a * RAD), sy = Math.sin(a * RAD);
      const px = ax + dd * cx, py = ay + dd * sy;
      if (cx > 0.35) return { x: px, y: py - h / 2, lx: px, ly: py };
      if (cx < -0.35) return { x: px - w, y: py - h / 2, lx: px, ly: py };
      return sy < 0 ? { x: px - w / 2, y: py - h, lx: px, ly: py } : { x: px - w / 2, y: py, lx: px, ly: py };
    }
    const hit = (a, b, pad) => !(a.x + a.w + pad <= b.x || b.x + b.w + pad <= a.x || a.y + a.h + pad <= b.y || b.y + b.h + pad <= a.y);
    let ui = [];
    function measureUI() {
      const rr = root.getBoundingClientRect();
      const rect = (n) => { if (!n || n.hidden || n.offsetParent === null) return null; const b = n.getBoundingClientRect(); return b.width ? { x: b.left - rr.left, y: b.top - rr.top, w: b.width, h: b.height } : null; };
      ui = [rect(root.querySelector('.wj-crumbs')), rect(el.ctrl)];
      if (!root.classList.contains('no-index')) ui.push(rect(el.index));
      if (root.classList.contains('has-panel')) ui.push(isWide() ? { x: size.w - PANEL_W, y: 0, w: PANEL_W, h: size.h } : { x: 0, y: el.panel.offsetTop + (sheetPos()[S.sheet] || 0), w: size.w, h: size.h });
      ui = ui.filter(Boolean);
    }

    function layout() {
      if (!map || !pins.length || S.dead) return;
      const W = size.w, H = size.h;
      const z = map.getZoom(), cen = map.getCenter();
      const globe = z < 5.6;
      let cap = 90;
      if (globe) {
        const R = 512 * 2 ** z / (2 * Math.PI) / Math.cos(cen.lat * RAD);
        const d = map.transform.cameraToCenterDistance || 0.5 * H / Math.tan(18.4 * RAD);
        cap = Math.acos(R / (R + d)) / RAD;
      }
      const occl = map.transform.isLocationOccluded ? (ll) => map.transform.isLocationOccluded(ll) : () => false;
      for (const p of pins) {
        const pt = map.project([p.lon, p.lat]);
        p.x = pt.x; p.y = pt.y;
        let a = 1;
        if (globe) {
          a = clamp((cap - 4 - angDist(cen.lng, cen.lat, p.lon, p.lat)) / 9, 0, 1);
          if (a > 0 && occl({ lng: p.lon, lat: p.lat })) a = 0;
        }
        if (p.x < -30 || p.x > W + 30 || p.y < -30 || p.y > H + 30) a = 0;
        p.a = a;
        p.prio = p.base + (p.id === S.rk ? 1e5 : 0);
      }
      const live = pins.filter((p) => p.a > 0.05).sort((a, b) => b.prio - a.prio);
      // dots closer than a few px collapse into one
      const shown = [];
      for (const p of live) {
        p.host = null;
        for (const q of shown) if (Math.hypot(p.x - q.x, p.y - q.y) < Math.max(p.r, q.r) + 3) { p.host = q; break; }
        if (!p.host) { shown.push(p); p.multi = 0; } else p.host.multi++;
      }
      const dotRects = shown.map((q) => ({ x: q.x - q.r - 2, y: q.y - q.r - 2, w: 2 * q.r + 4, h: 2 * q.r + 4, q }));
      const placed = [];
      const leaders = [];
      let hotLeader = '';
      const fits = (rc, p) => {
        if (rc.x < 6 || rc.y < 6 || rc.x + rc.w > W - 6 || rc.y + rc.h > H - 6) return false;
        for (const o of placed) if (hit(rc, o, 4)) return false;
        for (const o of dotRects) if (o.q !== (p.host || p) && hit(rc, o, 1)) return false;
        for (const o of ui) if (hit(rc, o, 6)) return false;
        return true;
      };
      for (const p of live) {
        const anc = p.host || p;
        const ax = anc.x, ay = anc.y, r = anc.r;
        let best = -1, rc = null;
        const tryK = (k) => { const c = candRect(k, ax, ay, r, p.w, p.h); c.w = p.w; c.h = p.h; return fits(c, p) ? c : null; };
        if (p.cand >= 0 && p.cand < NEAR.length) { rc = tryK(p.cand); if (rc) best = p.cand; }
        if (best < 0) for (let k = 0; k < NEAR.length; k++) { rc = tryK(k); if (rc) { best = k; break; } }
        if (best < 0 && p.cand >= NEAR.length) { rc = tryK(p.cand); if (rc) best = p.cand; }
        const callN = isWide() ? CALL.length : 16;
        if (best < 0) for (let k = NEAR.length; k < NEAR.length + callN; k++) { rc = tryK(k); if (rc) { best = k; break; } }
        p.cand = best; p.rect = rc;
        if (rc) {
          placed.push(rc);
          if (best >= NEAR.length) {
            const ux = rc.lx - ax, uy = rc.ly - ay, L = Math.hypot(ux, uy) || 1;
            const seg = `M${(ax + ux / L * (r + 3)).toFixed(1)} ${(ay + uy / L * (r + 3)).toFixed(1)}L${rc.lx.toFixed(1)} ${rc.ly.toFixed(1)}`;
            if (p.id === S.hot || p.id === S.rk) hotLeader += seg; else leaders.push(seg);
          }
        }
      }
      for (const p of pins) {
        const vis = p.a > 0.05;
        const dt = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0)`;
        if (dt !== p.dx) { p.dot.style.transform = dt; p.dx = dt; }
        p.dot.style.setProperty('--a', vis && !p.host ? p.a.toFixed(2) : 0);
        p.dot.classList.toggle('is-multi', !!p.multi);
        let lx, ly;
        if (vis && p.rect) { lx = p.rect.x; ly = p.rect.y; } else { lx = p.x + p.r + 7; ly = p.y - p.h / 2; }
        const lt = `translate3d(${lx.toFixed(1)}px,${ly.toFixed(1)}px,0)`;
        if (lt !== p.tx) { p.el.style.transform = lt; p.tx = lt; }
        p.el.style.setProperty('--a', vis ? p.a.toFixed(2) : 0);
        p.el.classList.toggle('is-off', !vis || !p.rect);
        p.el.classList.toggle('is-far', p.a < 0.3);
        p.el.classList.toggle('is-sel', p.id === S.rk);
        p.dot.classList.toggle('is-sel', p.id === S.rk);
      }
      el.ld.setAttribute('d', leaders.join(''));
      el.ldHot.setAttribute('d', hotLeader);
      if (tipPin) placeTip();
      halo(z);
    }
    let layoutQueued = false;
    const queueLayout = () => { if (layoutQueued) return; layoutQueued = true; requestAnimationFrame(() => { layoutQueued = false; layout(); }); };

    /* ----- globe halo ----- */
    function halo(z) {
      const pad = map.getPadding();
      const cx = pad.left + (size.w - pad.left - pad.right) / 2, cy = pad.top + (size.h - pad.top - pad.bottom) / 2;
      const lat = map.getCenter().lat;
      const R = 512 * 2 ** z / (2 * Math.PI) / Math.cos(lat * RAD);
      const d = map.transform.cameraToCenterDistance || 1000;
      const rs = d * R / Math.sqrt(d * d + 2 * R * d);
      const s = (rs * 1.42) / 100;
      el.halo.style.transform = `translate3d(${(cx - 100).toFixed(1)}px,${(cy - 100).toFixed(1)}px,0) scale(${s.toFixed(3)})`;
      el.halo.style.opacity = clamp((3.2 - z) / 1.2, 0, 1).toFixed(2);
    }
    function apparentR(z, lat) {
      const R = 512 * 2 ** z / (2 * Math.PI) / Math.cos(lat * RAD);
      const d = (map && map.transform.cameraToCenterDistance) || 0.5 * size.h / Math.tan(18.43 * RAD);
      return d * R / Math.sqrt(d * d + 2 * R * d);
    }

    /* ----- tooltip ----- */
    let tipPin = null, tipT = 0;
    function tipHTML(p) {
      if (p.kind === 'country') {
        const c = D.countries[p.id];
        return `<p class="wj-tip-nm"><strong>${esc(c.ko)}</strong><span lang="en">${esc(c.en)}</span></p>${c.headline ? `<p class="wj-tip-hl">${esc(c.headline)}</p>` : ''}<p class="wj-tip-meta">산지 ${c.regions.length}곳 · 와인 ${c.n}병</p>`;
      }
      const r = D.countries[p.ck].regions.find((x) => x.key === p.id);
      const imgs = r.wines.filter((w) => w.img).slice(0, 4);
      const grapes = (r.grapes || []).slice(0, 2).join(' · ');
      return `<p class="wj-tip-nm"><strong>${esc(r.ko)}</strong>${r.en ? `<span lang="en">${esc(r.en)}</span>` : ''}</p>
        <p class="wj-tip-meta">와인 ${r.n}병${grapes ? ` · ${esc(grapes)}` : ''}</p>
        ${imgs.length ? `<div class="wj-tip-bottles">${imgs.map((w) => `<span class="wj-thumb"><img src="${esc(thumb(base, w))}" alt="" decoding="async"></span>`).join('')}</div>` : ''}`;
    }
    function tipShow(p, now) {
      clearTimeout(tipT);
      tipT = setTimeout(() => {
        if (S.dead) return;
        if (tipPin !== p) { el.tip.innerHTML = tipHTML(p); }
        tipPin = p;
        el.tip.hidden = false;
        placeTip();
        requestAnimationFrame(() => el.tip.classList.add('is-on'));
        setHot(p.id);
      }, now ? 0 : 90);
    }
    function tipHide(now) {
      clearTimeout(tipT);
      const done = () => { el.tip.classList.remove('is-on'); tipPin = null; setHot(null); if (now) el.tip.hidden = true; else setTimeout(() => { if (!tipPin) el.tip.hidden = true; }, 200); };
      if (now) done(); else tipT = setTimeout(done, 110);
    }
    function placeTip() {
      const p = tipPin; if (!p) return;
      const tw = el.tip.offsetWidth, th = el.tip.offsetHeight;
      const lab = p.rect && p.a > 0.05 ? p.rect : { x: p.x + p.r + 7, y: p.y - p.h / 2, w: p.w, h: p.h };
      let x = lab.x + lab.w / 2 - tw / 2;
      let y = lab.y - th - 10;
      const topLimit = (ui[0] ? ui[0].y + ui[0].h : 0) + 8;
      if (y < topLimit) y = lab.y + lab.h + 10;
      x = clamp(x, 10, size.w - tw - 10 - (root.classList.contains('has-panel') && isWide() ? PANEL_W : 0));
      y = clamp(y, 10, size.h - th - 10);
      el.tip.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    }

    /* ----- hover highlight ----- */
    function setHot(id) {
      if (S.hot === id) return;
      S.hot = id;
      fx.tau = 170;
      pins.forEach((p) => { const h = p.id === id; p.el.classList.toggle('is-hot', h); p.dot.classList.toggle('is-hot', h); });
      el.indexIn.querySelectorAll('[data-hot]').forEach((b) => b.classList.toggle('is-hot', b.dataset.hot === id));
      targets();
      queueLayout();
    }

    /* ----- paint tweening (smooth fades for data driven paint) ----- */
    const fx = { cur: {}, tgt: {}, raf: 0, last: 0 };
    function tween(ch, v) { fx.tgt[ch] = v; if (!(ch in fx.cur)) fx.cur[ch] = 0; }
    function targets() {
      const lvl = S.level;
      D.list.forEach((c) => {
        const k = c.key, hot = S.hot === k && lvl === 'world', foc = S.ck === k;
        const base = 0.1 + 0.17 * Math.pow(c.n / D.max, 0.6);
        if (lvl === 'world') {
          tween(`f:${k}`, base + (hot ? 0.16 : 0)); tween(`g:${k}`, hot ? 0.55 : 0.24); tween(`l:${k}`, hot ? 0.75 : 0.32); tween(`t:${k}`, 1);
        } else {
          const ho = S.hot === k && !foc;
          tween(`f:${k}`, foc ? 0 : ho ? 0.12 : 0.045); tween(`g:${k}`, foc ? 0 : 0.05); tween(`l:${k}`, foc ? 0 : ho ? 0.4 : 0.14); tween(`t:${k}`, foc ? 1 : 0.07);
        }
      });
      tween('cf', lvl === 'world' ? 0 : lvl === 'region' ? 0.075 : 0.1);
      tween('ce', lvl === 'world' ? 0 : 1);
      tween('gr', lvl === 'world' ? 1 : 0);
      tween('core', lvl === 'world' ? 1 : 0);
      kick();
    }
    function kick() {
      if (!S.ready) return;
      if (reduce()) { Object.assign(fx.cur, fx.tgt); paint(); return; }
      if (!fx.raf) { fx.last = performance.now(); fx.raf = requestAnimationFrame(step); }
    }
    function step(now) {
      fx.raf = 0;
      if (S.dead || !map) return;
      const dt = Math.min(220, now - fx.last); fx.last = now;
      let moving = false;
      const tau = fx.tau || 520;
      for (const ch in fx.tgt) {
        const t = fx.tgt[ch], c = fx.cur[ch];
        let n = c + (t - c) * (1 - Math.exp(-dt / tau));
        if (Math.abs(t - n) < 0.003) n = t; else moving = true;
        fx.cur[ch] = n;
      }
      paint();
      if (moving) fx.raf = requestAnimationFrame(step);
    }
    const match = (prop, pre, mul) => {
      const e = ['match', ['get', prop]];
      D.list.forEach((c) => e.push(c.key, +(fx.cur[`${pre}:${c.key}`] * mul || 0).toFixed(3)));
      e.push(0);
      return e.length > 3 ? e : 0;
    };
    function paint() {
      if (!map || !S.ready) return;
      const sp = (l, p, v) => { if (map.getLayer(l)) map.setPaintProperty(l, p, v); };
      sp('wj-world-fill', 'fill-opacity', match('key', 'f', 1));
      sp('wj-world-glow', 'line-opacity', match('key', 'g', 1));
      sp('wj-world-line', 'line-opacity', match('key', 'l', 1));
      sp('wj-terroir', 'circle-opacity', match('ck', 't', 0.55));
      sp('wj-terroir-core', 'circle-opacity', ['*', match('ck', 't', 0.95), +(fx.cur.core || 0).toFixed(3)]);
      sp('wj-country-fill', 'fill-opacity', +(fx.cur.cf || 0).toFixed(3));
      sp('wj-country-edge', 'line-opacity', +((fx.cur.ce || 0) * 0.55).toFixed(3));
      sp('wj-country-glow', 'line-opacity', +((fx.cur.ce || 0) * 0.3).toFixed(3));
      sp('wj-grat', 'line-opacity', +((fx.cur.gr || 0) * 0.09).toFixed(3));
    }

    /* ----- camera ----- */
    function pads(level) {
      const top = el.probe.offsetTop || 0, bot = Math.max(0, size.h - top - el.probe.offsetHeight);
      const idxOn = !root.classList.contains('no-index');
      if (isWide()) {
        const left = idxOn ? EDGE + IDX_W + 16 : EDGE;
        if (level === 'world') return { top: top + 40, bottom: bot + 24, left, right: 24 };
        if (level === 'country') return { top: top + 96, bottom: bot + 64, left: left + 24, right: 96 };
        return { top: top + 96, bottom: bot + 64, left: left + 24, right: PANEL_W + 72 };
      }
      const dockH = el.index.offsetHeight || 140;
      if (level === 'region') { const vis = Math.max(160, size.h - (el.panel.offsetTop + (sheetPos().half || 0))); return { top: top + 64, bottom: bot + vis + 12, left: 24, right: 24 }; }
      return { top: top + 60, bottom: bot + dockH + 20, left: level === 'world' ? 12 : 10, right: level === 'world' ? 12 : 10 };
    }
    function worldCam(fromCk) {
      const pad = pads('world');
      const aw = size.w - pad.left - pad.right, ah = size.h - pad.top - pad.bottom;
      const target = Math.min(aw, ah) * (isWide() ? 0.47 : 0.5);
      const lat = isWide() ? 24 : 20;
      let lo = -1, hi = 6;
      for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (apparentR(m, lat) < target) lo = m; else hi = m; }
      const c = fromCk && D.countries[fromCk];
      const lng = c ? c.anchor[0] : map ? map.getCenter().lng : 12;
      return { center: [lng, lat], zoom: lo, pitch: 0, bearing: 0, padding: pad };
    }
    function countryBounds(c) {
      let w = 180, e = -180, s = 90, n = -90;
      c.regions.forEach((r) => { w = Math.min(w, r.lon); e = Math.max(e, r.lon); s = Math.min(s, r.lat); n = Math.max(n, r.lat); });
      const cx = (w + e) / 2, cy = (s + n) / 2;
      const sx = Math.max((e - w) * 1.3 + 1.4, 6.5), sy = Math.max((n - s) * 1.3 + 1.1, 4.6);
      return [cx - sx / 2, cy - sy / 2, cx + sx / 2, cy + sy / 2];
    }
    function fit(b, pad, maxZ) {
      const aw = Math.max(80, size.w - pad.left - pad.right), ah = Math.max(80, size.h - pad.top - pad.bottom);
      const x0 = (b[0] + 180) / 360, x1 = (b[2] + 180) / 360, y0 = mercY(b[3]), y1 = mercY(b[1]);
      const z = Math.log2(Math.min(aw / ((x1 - x0) * 512), ah / ((y1 - y0) * 512)));
      return { center: [(b[0] + b[2]) / 2, unMercY((y0 + y1) / 2)], zoom: Math.min(maxZ, z) };
    }
    function countryCam(ck) {
      const pad = pads('country');
      const f = fit(countryBounds(D.countries[ck]), pad, 7.4);
      return { center: f.center, zoom: f.zoom - 0.12, pitch: reduce() ? 0 : 28, bearing: 0, padding: pad };
    }
    function regionCam(ck, rk) {
      const c = D.countries[ck], r = c.regions.find((x) => x.key === rk);
      let dmin = Infinity;
      c.regions.forEach((q) => { if (q !== r) dmin = Math.min(dmin, Math.hypot((q.lon - r.lon) * Math.cos(r.lat * RAD), q.lat - r.lat)); });
      const z = Number.isFinite(dmin) ? clamp(Math.log2(70 * 360 * Math.cos(r.lat * RAD) / (512 * dmin)), 6.6, 9.4) : 7.4;
      return { center: [r.lon, r.lat], zoom: z, pitch: reduce() ? 0 : 40, bearing: 0, padding: pads('region') };
    }
    function camFor(fromCk) {
      if (S.level === 'world') return worldCam(fromCk);
      if (S.level === 'country') return countryCam(S.ck);
      return regionCam(S.ck, S.rk);
    }
    let flyT = 0;
    function camera(fly, dur) {
      if (!map) return;
      const cam = camFor(S.prevCk);
      clearTimeout(flyT);
      if (reduce() || dur === 0) { map.jumpTo(cam); queueLayout(); if (S.revealed) revealPins(); return; }
      S.flying = true;
      root.classList.add('is-flying');
      const o = { ...cam, duration: dur, easing: easeIO, essential: true };
      if (fly) map.flyTo({ ...o, curve: 1.3 }); else map.easeTo(o);
      // safety net in case the camera had nowhere to go and no moveend arrives
      flyT = setTimeout(() => { if (S.flying && !map.isMoving()) { S.flying = false; root.classList.remove('is-flying'); if (S.revealed) revealPins(); } }, dur + 400);
    }

    /* ----- globe spin ----- */
    const spin = { raf: 0, on: false, paused: false, stopped: false, last: 0 };
    function spinStart() {
      if (spin.on || spin.stopped || reduce() || S.level !== 'world') return;
      spin.on = true; spin.last = performance.now();
      const tick = (now) => {
        if (!spin.on) return;
        const dt = Math.min(50, now - spin.last); spin.last = now;
        if (!spin.paused && !S.flying && visible && map && !map.isMoving()) {
          const c = map.getCenter();
          map.jumpTo({ center: [((c.lng + dt * 0.0032 + 540) % 360) - 180, c.lat] });
        }
        spin.raf = requestAnimationFrame(tick);
      };
      spin.raf = requestAnimationFrame(tick);
    }
    function spinStop(forever) { spin.on = false; cancelAnimationFrame(spin.raf); if (forever) spin.stopped = true; }

    /* ----- map ----- */
    async function init() {
      try {
        const [lib, style, world] = await Promise.all([loadMapLibre(), getStyle(), getJSON(`${base}geo/world-110m.json`).catch(() => null)]);
        if (S.dead) return;
        ml = lib;
        const st = restyle(style, false);
        addCustom(st, D, world, false);
        const cam0 = worldCam(S.ck);
        map = new ml.Map({
          container: el.canvas, style: st, center: S.ck ? D.countries[S.ck].anchor : cam0.center, zoom: cam0.zoom, minZoom: 0.4, maxZoom: 12,
          attributionControl: false, localIdeographFontFamily: LOCAL_FONT, renderWorldCopies: false, locale: LOCALE,
          cooperativeGestures: !!opts.cooperative, dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 50,
          fadeDuration: 220, canvasContextAttributes: { antialias: true },
        });
        map.setPadding(cam0.padding);
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
        map.addControl(new ml.AttributionControl({ compact: true, customAttribution: 'Natural Earth' }), 'bottom-right');
        map.on('render', layout);
        map.on('resize', () => { measureUI(); queueLayout(); });
        map.on('movestart', (e) => { if (e.originalEvent) { S.userMoved = true; spinStop(true); } });
        map.on('moveend', () => {
          if (S.flying) { S.flying = false; root.classList.remove('is-flying'); }
          if (S.revealed) revealPins();
          layout();
        });
        map.on('error', (e) => { if (!S.ready && e && e.error && /style/i.test(String(e.error.message))) fail(e.error); });
        map.on('mousemove', 'wj-world-fill', (e) => {
          const f = e.features && e.features[0];
          const k = f && f.properties.key;
          map.getCanvas().style.cursor = k && k !== S.ck ? 'pointer' : '';
          if (!tipPin && k !== S.hot) setHot(k && k !== S.ck ? k : null);
        });
        map.on('mouseleave', 'wj-world-fill', () => { map.getCanvas().style.cursor = ''; if (!tipPin) setHot(null); });
        map.on('click', 'wj-world-fill', (e) => {
          const f = e.features && e.features[0];
          const k = f && f.properties.key;
          if (k && k !== S.ck && (S.level === 'world' || S.level === 'country')) route(`#/map/${k}`);
        });
        map.once('load', onLoad);
      } catch (e) { fail(e); }
    }
    function onLoad() {
      if (S.dead) return;
      S.ready = true;
      const t0 = performance.now();
      let done = false;
      const reveal = () => {
        if (done || S.dead) return; done = true;
        root.classList.remove('is-loading');
        root.classList.add('is-ready');
        el.canvas.setAttribute('aria-hidden', 'false');
        if (!isWide()) foldAttribution(root);
        applyMap(null, true);
        setTimeout(() => { S.revealed = true; if (!S.flying) revealPins(); }, reduce() ? 0 : 700);
        setTimeout(() => { if (S.level === 'world' && !S.userMoved) spinStart(); }, reduce() ? 0 : 1600);
      };
      map.once('idle', reveal);
      setTimeout(reveal, 2600);
      if (S.ck) loadCountryGeo(S.ck);
      targets();
      void t0;
    }
    async function loadCountryGeo(ck) {
      try {
        const t = await getJSON(`${base}geo/${ck}.json`);
        if (S.dead || !map || S.ck !== ck) return;
        const tp = topo(t);
        map.getSource('wj-country').setData({ type: 'FeatureCollection', features: tp.features() });
        map.getSource('wj-country-edge').setData({ type: 'FeatureCollection', features: [tp.edge()] });
      } catch (e) { /* country outline is decoration, keep going */ }
    }
    const LOADER = el.loader.innerHTML;
    function fail() {
      if (S.failed || S.dead) return;
      S.failed = true;
      root.classList.remove('is-loading');
      root.classList.add('is-failed');
      el.loader.innerHTML = `<span class="wj-loader-text">지도를 불러오지 못했습니다. 목록에서 산지를 찾아보실 수 있습니다.</span><button type="button" class="wj-retry">다시 불러오기</button>`;
    }
    function retry() {
      if (map) { try { map.remove(); } catch (e) { /* gone */ } }
      map = null; S.ready = false; S.failed = false; S.revealed = false;
      el.canvas.innerHTML = '';
      el.loader.innerHTML = LOADER;
      root.classList.remove('is-failed', 'is-ready');
      root.classList.add('is-loading');
      init();
    }

    /* ----- state ----- */
    function applyMap(prev, first) {
      if (!map || !S.ready) return;
      fx.tau = first ? 900 : 600;
      targets();
      if (S.level !== 'world') spinStop(true);
      const p = prev || { level: 'world', ck: null };
      if (first) {
        if (S.level === 'world') { camera(false, 0); return; }
        camera(true, S.level === 'region' ? 2200 : 1900);
        return;
      }
      if (S.level === 'world') camera(true, 1700);
      else if (S.level === 'country') camera(p.ck === S.ck ? false : true, p.ck === S.ck ? 1200 : 1700);
      else camera(p.ck !== S.ck, p.ck === S.ck ? 1400 : 2100);
    }
    function show(ck, rk) {
      if (S.dead) return;
      ck = ck && D.countries[ck] ? ck : null;
      rk = ck && rk && D.countries[ck].regions.some((r) => r.key === rk) ? rk : null;
      const prev = { level: S.level, ck: S.ck, rk: S.rk };
      if (prev.ck === ck && prev.rk === rk && api._shown) return;
      api._shown = true;
      S.prevCk = prev.ck;
      S.ck = ck; S.rk = rk;
      S.level = rk ? 'region' : ck ? 'country' : 'world';
      root.dataset.level = S.level;
      root.classList.toggle('no-index', S.level === 'region' && isWide() && size.w < 1280);
      crumbs(); renderIndex(); buildPins();
      let refocus = false;
      if (S.level === 'region') openPanel(D.countries[ck], D.countries[ck].regions.find((r) => r.key === rk));
      else refocus = closePanel();
      measureUI();
      if (ck !== prev.ck && map && S.ready) {
        if (ck) loadCountryGeo(ck);
      }
      const c = ck && D.countries[ck];
      el.sr.textContent = S.level === 'world' ? `세계 지도입니다. 와인이 있는 나라 ${D.list.length}곳이 표시되어 있습니다.`
        : S.level === 'country' ? `${c.ko} 지도입니다. 산지 ${c.regions.length}곳, 와인 ${c.n}병이 있습니다.`
          : `${c.regions.find((r) => r.key === rk).ko} 산지의 와인 ${c.regions.find((r) => r.key === rk).n}병을 열었습니다.`;
      if (refocus || (S.kbd && prev.level === 'region' && S.level === 'country')) {
        requestAnimationFrame(() => { const b = el.pins.querySelector(`[data-id="${CSS.escape(prev.rk || '')}"]`); if (b) b.focus({ preventScroll: true }); });
      }
      applyMap(prev, false);
      if (!S.ready) return;
      if (S.level === 'world' && !S.userMoved) setTimeout(() => spinStart(), reduce() ? 0 : 1900);
    }

    /* ----- events ----- */
    on(root, 'click', (e) => {
      const t = e.target.closest('[data-go],[data-wine],[data-act],[data-zoom],.wj-pin,.wj-back,.wj-retry');
      if (!t || !root.contains(t)) return;
      if (t.classList.contains('wj-retry')) { retry(); return; }
      if (t.dataset.wine) { if (opts.onOpenWine) opts.onOpenWine(t.dataset.wine); return; }
      if (t.dataset.go) { route(t.dataset.go); return; }
      if (t.dataset.act === 'close') { route(`#/map/${S.ck}`); return; }
      if (t.classList.contains('wj-back')) { route(S.rk ? `#/map/${S.ck}` : '#/map'); return; }
      if (t.dataset.zoom) {
        if (!map) return;
        spinStop(true);
        if (t.dataset.zoom === 'home') camera(false, 1100);
        else map.easeTo({ zoom: map.getZoom() + (t.dataset.zoom === 'in' ? 1 : -1), duration: reduce() ? 0 : 420, easing: easeIO });
        return;
      }
      if (t.classList.contains('wj-pin')) {
        const p = pins.find((x) => x.id === t.dataset.id);
        if (!p) return;
        if (p.kind === 'country') route(`#/map/${p.id}`);
        else if (p.id !== S.rk) route(`#/map/${S.ck}/${p.id}`);
        else if (!isWide() && S.sheet !== 'full') setSheet('half');
      }
    });
    on(root, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') S.kbd = true;
      if (e.key === 'Tab') S.kbd = true;
      if (e.key === 'Escape') {
        if (tipPin) { tipHide(true); return; }
        if (S.level === 'region') { e.preventDefault(); S.kbd = true; route(`#/map/${S.ck}`); }
      }
      if (S.level === 'world' && !e.target.closest('.wj-panel')) spinStop(true);
    });
    on(root, 'pointerdown', (e) => { S.kbd = false; if (e.target.closest('.wj-stage')) { spinStop(true); } });
    on(root, 'wheel', () => spinStop(true), { passive: true });
    // proximity: dots grow a little as the cursor comes near
    let near = { x: -999, y: -999, raf: 0 };
    const nearUpdate = () => {
      near.raf = 0;
      for (const p of pins) {
        if (p.x == null) continue;
        const d = Math.hypot(p.x - near.x, p.y - near.y);
        let k = clamp(1 - d / 130, 0, 1) || 0; k = k * k * (3 - 2 * k);
        const v = k.toFixed(2);
        if (p.nv !== v) { p.nv = v; p.dot.style.setProperty('--near', v); p.el.style.setProperty('--near', v); }
      }
    };
    on(root, 'pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const rr = root.getBoundingClientRect();
      near.x = e.clientX - rr.left; near.y = e.clientY - rr.top;
      if (!near.raf) near.raf = requestAnimationFrame(nearUpdate);
    });
    on(root, 'pointerleave', () => { near.x = near.y = -999; if (!near.raf) near.raf = requestAnimationFrame(nearUpdate); });
    // hover preview, keyboard focus preview
    on(el.pins, 'pointerover', (e) => { const b = e.target.closest('.wj-pin'); if (!b || e.pointerType !== 'mouse') return; const p = pins.find((x) => x.id === b.dataset.id); if (p) { spin.paused = true; tipShow(p); } });
    on(el.pins, 'pointerout', (e) => { const b = e.target.closest('.wj-pin'); if (!b || (e.relatedTarget && b.contains(e.relatedTarget))) return; spin.paused = false; tipHide(); });
    on(el.pins, 'focusin', (e) => {
      const b = e.target.closest('.wj-pin'); if (!b) return;
      const p = pins.find((x) => x.id === b.dataset.id); if (!p) return;
      if (map && (p.a < 0.6)) { spinStop(true); map.easeTo({ center: [p.lon, S.level === 'world' ? clamp(p.lat, -30, 40) : p.lat], duration: reduce() ? 0 : 900, easing: easeIO }); }
      if (b.matches(':focus-visible')) tipShow(p, true);
    });
    on(el.pins, 'focusout', () => tipHide());
    on(el.index, 'pointerover', (e) => { const b = e.target.closest('[data-hot]'); spin.paused = true; if (b) setHot(b.dataset.hot); });
    on(el.index, 'pointerleave', () => { spin.paused = false; setHot(null); });
    on(el.index, 'focusin', (e) => { const b = e.target.closest('[data-hot]'); if (b) setHot(b.dataset.hot); });
    on(el.index, 'focusout', () => setHot(null));
    // dots: a click on a collapsed group zooms in, a single dot opens like its label
    let downAt = null;
    on(el.stage, 'pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
    on(el.stage, 'click', (e) => {
      if (!map || e.target.closest('.wj-pin')) return;
      if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
      const rr = root.getBoundingClientRect();
      const x = e.clientX - rr.left, y = e.clientY - rr.top;
      let best = null, bd = 18;
      pins.forEach((p) => { if (p.a > 0.3 && !p.host) { const d = Math.hypot(p.x - x, p.y - y); if (d < Math.max(bd, p.r + 8) && d < (best ? best.d : 99)) best = { p, d }; } });
      if (!best) return;
      const p = best.p;
      if (p.multi) { spinStop(true); map.easeTo({ center: [p.lon, p.lat], zoom: map.getZoom() + 1.6, duration: reduce() ? 0 : 900, easing: easeIO }); return; }
      if (p.kind === 'country') route(`#/map/${p.id}`); else route(`#/map/${S.ck}/${p.id}`);
    });

    // visibility: stop work while the map is hidden
    let visible = true;
    const io = new IntersectionObserver((ents) => { visible = ents[0].isIntersecting; }, { threshold: 0 });
    io.observe(root);
    let roT = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(roT); roT = requestAnimationFrame(() => resize()); });
    ro.observe(root);
    const mqs = () => { targets(); };
    MQ.reduce.addEventListener('change', mqs);
    cleanups.push(() => MQ.reduce.removeEventListener('change', mqs));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!S.dead) { measurePins(); queueLayout(); } });

    function resize() {
      if (S.dead) return;
      const w = root.clientWidth, h = root.clientHeight;
      if (!w || !h) return;
      const changed = w !== size.w || h !== size.h;
      size.w = w; size.h = h;
      root.classList.toggle('is-wide', isWide());
      root.classList.toggle('no-index', S.level === 'region' && isWide() && size.w < 1280);
      if (root.classList.contains('has-panel') && !isWide()) setSheet(S.sheet === 'closed' ? 'half' : S.sheet);
      else if (isWide()) el.panel.style.removeProperty('--sy');
      measurePins(); measureUI();
      if (map) {
        map.resize();
        if (changed && !S.userMoved && !S.flying) map.jumpTo(camFor(null));
      }
      queueLayout();
    }

    const api = {
      _shown: false,
      show(ck, rk) { show(ck || null, rk || null); return Promise.resolve(); },
      resize,
      destroy() {
        if (S.dead) return;
        S.dead = true;
        spinStop(true);
        cancelAnimationFrame(fx.raf); cancelAnimationFrame(near.raf); cancelAnimationFrame(roT);
        clearTimeout(tipT); clearTimeout(revealPins.t);
        io.disconnect(); ro.disconnect();
        cleanups.forEach((f) => f());
        if (map) { try { map.remove(); } catch (e) { /* already gone */ } }
        map = null;
        root.innerHTML = '';
        root.classList.remove('wjmap', 'is-loading', 'is-ready', 'is-failed', 'has-panel', 'is-flying', 'is-wide', 'no-index');
        delete root.dataset.level;
      },
      get map() { return map; },
    };

    root.classList.toggle('is-wide', isWide());
    el.canvas.setAttribute('aria-hidden', 'true');
    show(opts.country || null, opts.region || null);
    api._shown = false;
    init();
    return api;

    /* ---------- mini: one wine on a small, quiet map ---------- */
    function createMini() {
      const w = opts.wine && typeof opts.wine === 'object' ? opts.wine : D.byId[opts.wine || opts.wineId];
      const c = w && D.countries[w.ck];
      const r = c && c.regions.find((x) => x.key === w.rkey);
      const place = [r ? r.ko : (w && (w.region_ko || w.region)) || '', c ? c.ko : (w && w.country) || ''].filter(Boolean).join(' · ');
      root.innerHTML = `
        <div class="wj-stage"><div class="wj-canvas" role="img" aria-label="${esc(place)} 산지 위치 지도"></div><div class="wj-vignette" aria-hidden="true"></div>
          <span class="wj-mini-pin" aria-hidden="true"><i></i></span></div>
        <div class="wj-mini-cap"><span class="wj-mini-place">${esc(place)}</span>${opts.onRoute && c ? `<button type="button" class="wj-mini-go">지도에서 보기</button>` : ''}</div>`;
      const stage = root.querySelector('.wj-canvas'), pin = root.querySelector('.wj-mini-pin');
      const goBtn = root.querySelector('.wj-mini-go');
      if (goBtn) on(goBtn, 'click', () => opts.onRoute(`#/map/${c.key}${r ? `/${r.key}` : ''}`));
      if (!w || w.lat == null) { root.classList.remove('is-loading'); root.classList.add('is-failed'); return { show() {}, resize() {}, destroy() { cleanups.forEach((f) => f()); root.innerHTML = ''; } }; }
      let m = null, dead = false;
      const placePin = () => { if (!m) return; const p = m.project([w.lon, w.lat]); pin.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0)`; };
      (async () => {
        try {
          const [lib, style] = await Promise.all([loadMapLibre(), getStyle()]);
          if (dead) return;
          const st = restyle(style, true);
          addCustom(st, D, null, true);
          st.sources['wj-regions'].data = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { ck: w.ck, n: 3 }, geometry: { type: 'Point', coordinates: [w.lon, w.lat] } }] };
          const interactive = !!opts.interactive;
          m = new lib.Map({
            container: stage, style: st, center: [w.lon, w.lat], zoom: opts.zoom || 4.8, interactive, cooperativeGestures: interactive,
            attributionControl: false, localIdeographFontFamily: LOCAL_FONT, renderWorldCopies: false, locale: LOCALE, fadeDuration: 0,
            dragRotate: false, pitchWithRotate: false, touchPitch: false,
          });
          m.addControl(new lib.AttributionControl({ compact: true }), 'bottom-right');
          if (interactive) { m.touchZoomRotate.disableRotation(); m.on('move', placePin); }
          m.on('resize', placePin);
          m.once('load', async () => {
            if (dead) return;
            m.setPaintProperty('wj-terroir', 'circle-opacity', 0.5);
            try {
              const t = await getJSON(`${base}geo/${w.ck}.json`);
              if (dead) return;
              const tp = topo(t);
              m.getSource('wj-country').setData({ type: 'FeatureCollection', features: tp.features() });
              m.getSource('wj-country-edge').setData({ type: 'FeatureCollection', features: [tp.edge()] });
              m.setPaintProperty('wj-country-fill', 'fill-opacity', 0.08);
              m.setPaintProperty('wj-country-edge', 'line-opacity', 0.45);
              m.setPaintProperty('wj-country-glow', 'line-opacity', 0.22);
            } catch (e) { /* outline is optional */ }
            placePin();
            const done = () => { root.classList.remove('is-loading'); root.classList.add('is-ready'); foldAttribution(root); };
            m.once('idle', done); setTimeout(done, 1800);
          });
        } catch (e) { root.classList.remove('is-loading'); root.classList.add('is-failed'); }
      })();
      const ro2 = new ResizeObserver(() => { if (m) m.resize(); placePin(); });
      ro2.observe(root);
      return {
        show() {},
        resize() { if (m) m.resize(); placePin(); },
        destroy() {
          if (dead) return; dead = true;
          ro2.disconnect(); cleanups.forEach((f) => f());
          if (m) { try { m.remove(); } catch (e) { /* gone */ } }
          m = null; root.innerHTML = '';
          root.classList.remove('wjmap', 'wjmap--mini', 'is-loading', 'is-ready', 'is-failed');
        },
        get map() { return m; },
      };
    }
  }

  /* ---------- public ---------- */
  let main = null;
  window.WJMap = {
    version: '1.0.0',
    mount(el, opts = {}) {
      if (!el) throw new Error('WJMap.mount: container element is required');
      if (!opts.mini && main) main.destroy();
      const inst = createInstance(el, opts);
      if (!opts.mini) main = inst;
      return inst;
    },
    show(ck, rk) { if (main) main.show(ck, rk); },
    resize() { if (main) main.resize(); },
    destroy() { if (main) main.destroy(); main = null; },
  };
})();
