/* ==========================================================================
 * VectorPulse Studio — 前端重构版（风格不变）
 * 结构：工具 / 状态 / 预设 / 动效编排 / 视口引擎 / 输入 / 描摹 / 视图 /
 *       播放器 / 导出 / 弹窗 / 快捷键 / 启动
 * 约束：file:// 可直接运行，无 fetch / 无 ESM，保持全部元素 ID 兼容
 * ========================================================================== */
(() => {
'use strict';

/* ---------- 0. 工具 ---------- */
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const debounce = (fn, ms) => {
  let t = 0;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

/* ---------- 1. 状态 ---------- */
const Store = {
  src: null,          // { canvas, w, h, rgba }
  svg: '',
  view: 'split',      // split | side | svg
  busy: false,        // 描摹中
  playing: false,
  paused: false,
  animTimer: 0,
  resizeRaf: 0,
};

const BodyState = {
  set(busy) {
    Store.busy = busy;
    document.body.dataset.state = busy ? 'busy' : (Store.src ? 'ready' : 'idle');
    $('retrace').disabled = busy || !Store.src;
  },
};

function log(msg, spin = false) {
  $('log').innerHTML = spin ? `<span class="spin"></span>${msg}` : msg;
}

/* ---------- 2. 预设 ---------- */
const PRESETS = {
  balanced: { hier: 'stacked', mode: 'spline', cp: 7, fs: 4, ld: 16, upscale: 2, anim: 'paint', layers: 36, stagger: 14, sketch: true },
  logo:     { hier: 'cutout', mode: 'polygon', cp: 4, fs: 8, ld: 32, upscale: 2, anim: 'bloom', layers: 16, stagger: 18, sketch: false },
  anime:    { hier: 'stacked', mode: 'spline', cp: 8, fs: 2, ld: 10, upscale: 2, anim: 'paint', layers: 48, stagger: 12, sketch: true },
  photo:    { hier: 'stacked', mode: 'spline', cp: 5, fs: 12, ld: 24, upscale: 1, anim: 'beam', layers: 24, stagger: 10, sketch: false },
  lineart:  { hier: 'stacked', mode: 'spline', cp: 2, fs: 6, ld: 48, upscale: 2, anim: 'paint', layers: 20, stagger: 15, sketch: true },
};

function readParams() {
  return {
    hier: $('hier').value,
    mode: $('mode').value,
    cp: Number($('cp').value),
    fs: Number($('fs').value),
    ld: Number($('ld').value),
    upscale: Number($('upscale').value),
  };
}

function readAnimOpts() {
  return {
    style: $('animStyle').value,
    layers: Number($('layers').value),
    stagger: Number($('stagger').value) / 100,
    sketch: $('sketch').checked,
  };
}

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  $('hier').value = p.hier;
  $('mode').value = p.mode;
  $('cp').value = p.cp;         $('cpv').textContent = p.cp;
  $('fs').value = p.fs;         $('fsv').textContent = p.fs;
  $('ld').value = p.ld;         $('ldv').textContent = p.ld;
  $('upscale').value = String(p.upscale);
  $('animStyle').value = p.anim;
  $('layers').value = p.layers; $('layersv').textContent = p.layers;
  $('stagger').value = p.stagger;
  $('staggerv').textContent = '.' + String(p.stagger).padStart(2, '0');
  $('sketch').checked = p.sketch;
}

function markCustom() {
  if ($('presetSelect').value !== 'custom') $('presetSelect').value = 'custom';
}

function initParams() {
  const bind = (id, outId, fmt = (v) => v) => {
    $(id).addEventListener('input', () => {
      $(outId).textContent = fmt($(id).value);
      markCustom();
    });
  };
  bind('cp', 'cpv');
  bind('fs', 'fsv');
  bind('ld', 'ldv');
  bind('layers', 'layersv');
  bind('stagger', 'staggerv', (v) => '.' + String(v).padStart(2, '0'));
  ['hier', 'mode', 'upscale', 'animStyle', 'layers', 'stagger', 'sketch'].forEach((id) => {
    $(id).addEventListener('change', markCustom);
  });
  $('presetSelect').addEventListener('change', (e) => {
    if (e.target.value === 'custom') return;
    applyPreset(e.target.value);
    if (Store.src) void triggerTrace();
  });
}

/* ---------- 3. 动效编排（逻辑与旧版一致） ---------- */
function buildAnimationData(svgText, opts) {
  const paths = svgText.match(/<path\b.*?\/>/gs) || [];
  const weights = paths.map((p) => (p.match(/d="([^"]*)"/) || ['', ''])[1].length);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const perLayerWeight = Math.max(1, totalWeight / opts.layers);

  const layers = [];
  let cur = [], acc = 0;
  for (let i = 0; i < paths.length; i++) {
    cur.push(paths[i]);
    acc += weights[i];
    if (acc >= perLayerWeight && layers.length < opts.layers - 1) {
      layers.push(cur); cur = []; acc = 0;
    }
  }
  if (cur.length) layers.push(cur);

  const timing = {};
  let sketchHtml = '';
  if (opts.sketch && opts.style !== 'beam') {
    const N = 46;
    const perBatch = Math.max(1, totalWeight / N);
    const batches = [];
    let bCur = [], bAcc = 0;
    paths.forEach((p, i) => {
      bCur.push(p.replace('<path ', '<path pathLength="1" ', 1));
      bAcc += weights[i];
      if (bAcc >= perBatch && batches.length < N - 1) { batches.push(bCur); bCur = []; bAcc = 0; }
    });
    if (bCur.length) batches.push(bCur);
    sketchHtml = batches.map((b, i) => `<g class="skb" style="--i:${i}">\n${b.join('\n')}\n</g>`).join('\n');
    const drawDuration = 0.2 + (batches.length - 1) * 0.04 + 0.7;
    timing.tone = drawDuration - 0.3;
    timing.ink = timing.tone + 0.8;
    timing.T0 = timing.ink + 0.5;
  } else {
    timing.T0 = 0.25;
  }

  const paintClasses = ['wipe-r', 'wipe-l', 'wipe-d', 'dab'];
  let colorBody = '';
  layers.forEach((group, i) => {
    let cls = 'wipe-r';
    if (opts.style === 'bloom') cls = 'bloom';
    else if (opts.style === 'paint') cls = i < 6 ? paintClasses[(i * 3 + 1) % 4] : paintClasses[Math.floor(Math.random() * 4)];
    colorBody += `<g class="pg ${cls}" style="--i:${i};--d:calc(${timing.T0}s + var(--i) * ${opts.stagger}s)">\n${group.join('\n')}\n</g>\n`;
  });

  timing.end = timing.T0 + (layers.length - 1) * opts.stagger + 0.55;
  timing.out = Math.max(0, timing.end - 0.9);
  timing.settle = timing.end;
  timing.total = timing.end + 1.2;

  return { colorBody, sketchHtml, timing, layerCount: layers.length, pathCount: paths.length };
}

function ensureViewBox(svgText, w, h) {
  if (/viewBox=/i.test(svgText)) return svgText;
  return svgText.replace('<svg ', `<svg viewBox="0 0 ${w} ${h}" `);
}

/* ---------- 4. 视口引擎：一屏等比适配 ---------- */
function getViewportSize() {
  const vp = $('stageViewport');
  if (vp && vp.clientWidth > 40 && vp.clientHeight > 40) {
    return { vw: vp.clientWidth - 4, vh: vp.clientHeight - 4 };
  }
  const mainEl = document.querySelector('main.rack-center');
  return {
    vw: clamp(mainEl ? mainEl.clientWidth - 32 : 800, 260, 880),
    vh: clamp(window.innerHeight * 0.5, 240, 640),
  };
}

function computePreviewBox() {
  if (!Store.src) return { w: 480, h: 320 };
  const { vw, vh } = getViewportSize();
  const dual = Store.view === 'side' && !$('sideWrap').hidden;
  const availW = dual ? (vw - 12) / 2 : vw;
  const scale = Math.min(availW / Store.src.w, vh / Store.src.h);
  return {
    w: Math.max(80, Math.round(Store.src.w * scale)),
    h: Math.max(60, Math.round(Store.src.h * scale)),
  };
}

function paintCanvas(cv, w, h) {
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(Store.src.canvas, 0, 0, w, h);
}

function updatePreviewGeometry() {
  if (!Store.src) return;
  const box = computePreviewBox();
  const diffBox = $('diffBox');
  diffBox.style.width = box.w + 'px';
  diffBox.style.height = box.h + 'px';
  paintCanvas($('diffCv'), box.w, box.h);
  ['pvSrc', 'pvOut'].forEach((id) => {
    $(id).style.width = box.w + 'px';
    $(id).style.height = box.h + 'px';
  });
  paintCanvas($('cvSrc'), box.w, box.h);
}

const schedulePreviewResize = () => {
  if (!Store.src || $('stageWrap').hidden) return;
  cancelAnimationFrame(Store.resizeRaf);
  Store.resizeRaf = requestAnimationFrame(updatePreviewGeometry);
};
const schedulePreviewResizeDebounced = debounce(schedulePreviewResize, 80);

/* ---------- 5. 图片输入 ---------- */
async function processFile(file) {
  if (!file || Store.busy) return;
  try {
    BodyState.set(true);
    log('DECODING SOURCE BITMAP...', true);
    const bmp = await createImageBitmap(file);
    await wait(20);

    const upscale = Number($('upscale').value);
    let tw = bmp.width * upscale, th = bmp.height * upscale;
    const MAX = 2048;
    if (Math.max(tw, th) > MAX) {
      const k = MAX / Math.max(tw, th);
      tw = Math.round(tw * k); th = Math.round(th * k);
    }
    const cv = document.createElement('canvas');
    cv.width = tw; cv.height = th;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, tw, th);
    const imgData = ctx.getImageData(0, 0, tw, th);

    Store.src = { canvas: cv, w: tw, h: th, rgba: imgData.data };
    try { bmp.close && bmp.close(); } catch (_) {}

    $('stageWrap').hidden = false;
    $('stageEmpty').hidden = true;
    $('viewTabs').hidden = false;
    requestAnimationFrame(() => { updatePreviewGeometry(); requestAnimationFrame(updatePreviewGeometry); });

    log(`SOURCE LOADED: ${bmp.width}×${bmp.height}px → ${tw}×${th}`);
    BodyState.set(false);
    await triggerTrace();
  } catch (err) {
    BodyState.set(false);
    log(`INPUT ERROR: ${err.message}`);
    console.error(err);
  }
}

function initUploadChannels() {
  const drop = $('drop');
  const empty = $('stageEmpty');
  const input = $('file');
  const pick = () => input.click();
  const zones = [drop, empty].filter(Boolean);

  drop.addEventListener('click', (e) => { if (e.target !== input) pick(); });
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
  });
  // 空状态即入口：点击 / 回车 / 拖放都直达选择器
  if (empty) {
    empty.addEventListener('click', pick);
    empty.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
    });
  }
  input.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) void processFile(e.target.files[0]);
    input.value = '';
  });
  zones.forEach((z) => {
    ['dragover', 'dragenter'].forEach((ev) => z.addEventListener(ev, (e) => { e.preventDefault(); z.classList.add('over'); }));
    z.addEventListener('dragleave', () => z.classList.remove('over'));
    z.addEventListener('drop', (e) => {
      e.preventDefault();
      z.classList.remove('over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) void processFile(e.dataTransfer.files[0]);
    });
  });
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const f = item.getAsFile();
        if (f) { void processFile(f); break; }
      }
    }
  });
}

/* ---------- 6. 描摹 ---------- */
function setExportEnabled(on) {
  ['dlsvg', 'dlpng', 'dlstatic', 'dlanim', 'btnViewCode', 'replay'].forEach((id) => { $(id).disabled = !on; });
}

async function triggerTrace() {
  if (!Store.src || Store.busy) return;
  if (hasGsap()) GsapEngine.kill(); // 重算时废弃旧时间轴，避免写分离 DOM
  $('stageWrap').classList.remove('playing');
  BodyState.set(true);
  setExportEnabled(false);
  log('VTRACER CORE RUNNING...', true);
  await wait(30);
  try {
    const t0 = performance.now();
    const cfg = {
      mode: $('mode').value,
      hierarchical: $('hier').value,
      colorPrecision: Number($('cp').value),
      filterSpeckle: Number($('fs').value),
      layerDifference: Number($('ld').value),
      pathPrecision: 2,
    };
    const raw = window.VTracer.convertPixels(Store.src.rgba, Store.src.w, Store.src.h, cfg);
    const ms = Math.round(performance.now() - t0);
    Store.svg = ensureViewBox(raw, Store.src.w, Store.src.h);

    const pathCount = (Store.svg.match(/<path/g) || []).length;
    const kb = (new Blob([Store.svg]).size / 1024).toFixed(1);
    $('stats').innerHTML =
      `<span class="chip">PATHS <b>${pathCount}</b></span>` +
      `<span class="chip">SIZE <b>${kb}</b>KB</span>` +
      `<span class="chip">CYCLE <b>${ms}</b>ms</span>` +
      `<span class="chip">ENG <b>${document.body.dataset.engine === 'gsap' ? 'GSAP' : 'CSS'}</b></span>` +
      `<span class="chip hide-sm">CANVAS <b>${Store.src.w}×${Store.src.h}</b></span>`;

    renderSvgToContainers(Store.svg);
    setExportEnabled(true);
    log('TRACE COMPLETE // 拖动卷帘对比或触发动效');
  } catch (err) {
    log(`COMPUTE FAULT: ${err.message}`);
    console.error(err);
  } finally {
    BodyState.set(false);
    if (Store.svg) setExportEnabled(true);
  }
}

function renderSvgToContainers(svg) {
  $('diffSvg').innerHTML = svg;
  $('pvOut').innerHTML = '<span class="tag" id="pvOutTag">SVG</span>' + svg;
}

/* ---------- 7. 视图 ---------- */
function setView(view) {
  Store.view = view;
  document.body.dataset.view = view;
  $$('#viewTabs .tab-btn').forEach((b) => {
    const on = b.dataset.view === view;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const diffBox = $('diffBox');
  if (view === 'split') {
    diffBox.hidden = false;
    $('sideWrap').hidden = true;
    diffBox.style.setProperty('--split', '50');
    $('diffRange').value = 50;
  } else if (view === 'side') {
    diffBox.hidden = true;
    $('sideWrap').hidden = false;
    $('pvSrc').hidden = false;
  } else {
    diffBox.hidden = true;
    $('sideWrap').hidden = false;
    $('pvSrc').hidden = true;
  }
  schedulePreviewResize();
}

function initViews() {
  const diffBox = $('diffBox');
  $('diffRange').addEventListener('input', (e) => diffBox.style.setProperty('--split', e.target.value));
  $('viewTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (btn) setView(btn.dataset.view);
  });
}

/* ---------- 7b. GSAP 时间轴引擎（CDN 缺席时自动降级 CSS 路径） ---------- */
const hasGsap = () => typeof window.gsap !== 'undefined';
const LAYER_DUR = 0.55; // 与 CSS .pg .55s 对齐，保证双路径观感一致

// 按类别把局部进度 p∈[0,1] 映射为行内 clip/opacity，复刻 CSS 关键帧语义
function applyLayerFrame(el, cls, p) {
  if (p <= 0) { el.style.opacity = '0'; el.style.clipPath = 'none'; el.style.filter = ''; el.style.transform = ''; return; }
  if (p >= 1) { el.style.opacity = '1'; el.style.clipPath = 'none'; el.style.filter = ''; el.style.transform = ''; return; }
  el.style.opacity = clamp(p / 0.35, 0, 1).toFixed(3);
  if (cls === 'dab') {
    el.style.clipPath = `circle(${(p * 120).toFixed(1)}% at 50% 50%)`;
  } else if (cls === 'wipe-l') {
    const lx = (100 - p * 103).toFixed(1);
    el.style.clipPath = `polygon(${lx}% 0, 103% 0, 103% 100%, ${lx}% 100%)`;
  } else if (cls === 'wipe-d') {
    const my = (p * 113).toFixed(1);
    el.style.clipPath = `polygon(0 -3%, 100% -3%, 100% ${my}%, 0 ${my}%)`;
  } else if (cls === 'bloom') {
    el.style.clipPath = 'none';
    el.style.filter = `blur(${((1 - p) * 8).toFixed(1)}px)`;
    el.style.transform = `scale(${(1.04 - 0.04 * p).toFixed(3)})`;
  } else {
    const mx = (p * 113).toFixed(1);
    el.style.clipPath = `polygon(-3% 0, ${mx}% 0, ${mx}% 100%, -3% 100%)`;
  }
}

const GsapEngine = {
  tween: null,
  layers: [], // { els:[diffG, outG], cls, start, path, len, cx, cy, p }
  svgEls: [],
  total: 0,
  isBeam: false,
  scrubbing: false,

  kill() {
    if (this.tween) { try { this.tween.kill(); } catch (_) {} this.tween = null; }
    this.layers = [];
    this.svgEls = [];
    const pen = $('penTip');
    if (pen) pen.hidden = true;
  },

  build(anim, opts) {
    this.kill();
    this.isBeam = opts.style === 'beam';
    this.total = this.isBeam ? 3.4 : anim.timing.total;
    const hosts = [$('diffSvg'), $('pvOut')];
    this.svgEls = hosts.map((h) => h.querySelector('svg')).filter(Boolean);
    const perHost = hosts.map((h) => Array.from(h.querySelectorAll('.pg')));
    const n = Math.min(...perHost.map((g) => g.length));
    const T0 = anim.timing.T0 || 0;
    for (let i = 0; i < n; i++) {
      const els = perHost.map((g) => g[i]);
      const cls = ['wipe-r', 'wipe-l', 'wipe-d', 'dab', 'bloom'].find((c) => els[0].classList.contains(c)) || 'wipe-r';
      const entry = { els, cls, start: T0 + i * opts.stagger, path: null, len: 0, cx: 0.5, cy: 0.5, p: 0 };
      try {
        const p0 = els[0].querySelector('path');
        if (p0) {
          entry.path = p0;
          entry.len = p0.getTotalLength();
          const bb = p0.getBBox();
          if (bb.width > 0 && bb.height > 0) {
            entry.cx = (bb.x + bb.width / 2) / Store.src.w;
            entry.cy = (bb.y + bb.height / 2) / Store.src.h;
          }
        }
      } catch (_) { /* 几何不可用则用中心兜底 */ }
      this.layers.push(entry);
    }
    this.frame(0);
    const proxy = { t: 0 };
    this.tween = window.gsap.to(proxy, {
      t: this.total,
      duration: this.total,
      ease: 'none',
      onUpdate: () => this.frame(proxy.t),
      onComplete: () => this.finish(),
    });
    this.tween.timeScale(Number($('animSpeed').value) || 1);
  },

  frame(t) {
    for (let i = 0; i < this.layers.length; i++) {
      const L = this.layers[i];
      L.p = clamp((t - L.start) / LAYER_DUR, 0, 1);
      if (!this.isBeam) {
        for (const el of L.els) applyLayerFrame(el, L.cls, L.p);
      } else {
        for (const el of L.els) el.style.opacity = L.p >= 1 ? '1' : '0';
      }
    }
    if (this.isBeam) {
      const q = clamp(t / this.total, 0, 1);
      const pos = `${(100 - q * 100).toFixed(1)}% 0`;
      for (const svg of this.svgEls) {
        svg.style.webkitMaskPosition = pos;
        svg.style.maskPosition = pos;
      }
    }
    const ratio = clamp(t / this.total, 0, 1);
    $('progressBar').style.width = (ratio * 100).toFixed(1) + '%';
    if (!this.scrubbing) $('scrub').value = String(Math.round(ratio * 1000));
    this.followPen(t);
  },

  followPen(t) {
    const pen = $('penTip');
    const wantPen = $('penFollow') && $('penFollow').checked;
    let active = -1;
    for (let i = 0; i < this.layers.length; i++) {
      if (t >= this.layers[i].start) active = i;
    }
    if (!wantPen || active < 0 || t >= this.total) { pen.hidden = true; return; }
    const layer = this.layers[active];
    const box = !$('diffBox').hidden ? $('diffBox') : $('pvOut');
    const vr = $('stageViewport').getBoundingClientRect();
    const br = box.getBoundingClientRect();
    let fx = layer.cx, fy = layer.cy;
    if (layer.path && layer.len > 0) {
      try {
        const e = 1 - Math.pow(1 - clamp(layer.p, 0, 1), 2); // easeOutQuad，落笔感
        const pt = layer.path.getPointAtLength(layer.len * clamp(e, 0, 1));
        fx = pt.x / Store.src.w;
        fy = pt.y / Store.src.h;
      } catch (_) { /* 保持中心兜底 */ }
    }
    const w = parseFloat(box.style.width) || br.width;
    const h = parseFloat(box.style.height) || br.height;
    const x = (br.left - vr.left) + fx * w;
    const y = (br.top - vr.top) + fy * h;
    pen.hidden = false;
    pen.classList.toggle('beam', this.isBeam);
    pen.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  },

  finish() {
    this.frame(this.total);
    $('penTip').hidden = true;
    if ($('animLoop').checked) { this.replay(); return; }
    Store.playing = false;
    Store.paused = true;
    setPlayIcon(false);
    log(`TIMELINE DONE [GSAP] // ${this.layers.length} LAYERS`);
  },

  replay() {
    if (!this.tween) return;
    Store.playing = true;
    Store.paused = false;
    setPlayIcon(true);
    this.tween.restart();
  },
};

// 双路径共用的动效 DOM 装配（GSAP 与 CSS 播放器共用，保证导出与预览同构）
function renderAnimHosts(opts, anim, isBeam) {
  const inner = isBeam
    ? anim.colorBody
    : (opts.sketch
        ? `<g class="skst">\n${anim.sketchHtml}\n</g>\n<use href="#art" class="sketch"/>\n`
        : '') + `<g id="art">\n${anim.colorBody}\n</g>`;
  const extra = isBeam ? '<div class="glow"></div>' : '';
  [$('diffSvg'), $('pvOut')].forEach((host) => {
    const keepTag = host.id === 'pvOut' ? '<span class="tag" id="pvOutTag">SVG</span>' : '';
    host.innerHTML = keepTag +
      `<svg version="1.1" viewBox="0 0 ${Store.src.w} ${Store.src.h}" xmlns="http://www.w3.org/2000/svg" class="${isBeam ? 'beam-svg' : ''}">${inner}</svg>${extra}`;
    const svgEl = host.querySelector('svg');
    if (svgEl && !isBeam && anim.timing.tone != null) {
      svgEl.style.setProperty('--tone', `${anim.timing.tone.toFixed(2)}s`);
      svgEl.style.setProperty('--ink', `${anim.timing.ink.toFixed(2)}s`);
      svgEl.style.setProperty('--out', `${anim.timing.out.toFixed(2)}s`);
      svgEl.style.setProperty('--settle', `${anim.timing.settle.toFixed(2)}s`);
    }
  });
}

function gsapPlay() {
  const opts = readAnimOpts();
  const anim = buildAnimationData(Store.svg, opts);
  renderAnimHosts(opts, anim, opts.style === 'beam');

  const wrap = $('stageWrap');
  wrap.style.setProperty('--play-state', 'running');
  wrap.classList.remove('playing');
  void wrap.offsetWidth;
  wrap.classList.add('playing'); // 素描 CSS 照跑；.pg 由引擎逐帧驱动（样式层已禁用 CSS 动画）

  GsapEngine.build(anim, opts);
  Store.playing = true;
  Store.paused = false;
  setPlayIcon(true);
  stopTimer();

  const eff = GsapEngine.total / (Number($('animSpeed').value) || 1);
  log(`TIMELINE RUNNING [GSAP] // ${anim.layerCount} LAYERS · ${eff.toFixed(1)}s · scrub可用`);
}

/* ---------- 8. 播放器 ---------- */
function stopTimer() { if (Store.animTimer) { clearTimeout(Store.animTimer); Store.animTimer = 0; } }

function setPlayIcon(playing) {
  $('playIcon').style.display = playing ? 'none' : 'block';
  $('pauseIcon').style.display = playing ? 'block' : 'none';
}

function playAnimation() {
  if (!Store.svg || !Store.src || Store.busy) return;
  if (hasGsap()) { gsapPlay(); return; }
  const opts = readAnimOpts();
  const anim = buildAnimationData(Store.svg, opts);
  const isBeam = opts.style === 'beam';

  renderAnimHosts(opts, anim, isBeam);

  const duration = isBeam ? 3.4 : anim.timing.total;
  const effective = duration / Number($('animSpeed').value);
  const wrap = $('stageWrap');
  wrap.style.setProperty('--total-duration', `${effective}s`);
  wrap.style.setProperty('--play-state', 'running');
  wrap.classList.remove('playing');
  void wrap.offsetWidth;
  wrap.classList.add('playing');

  Store.playing = true;
  Store.paused = false;
  setPlayIcon(true);
  stopTimer();
  Store.animTimer = setTimeout(() => {
    if ($('animLoop').checked) playAnimation();
    else { Store.playing = false; Store.paused = true; setPlayIcon(false); }
  }, effective * 1000);

  log(`TIMELINE RUNNING // ${anim.layerCount} LAYERS · ${effective.toFixed(1)}s`);
}

function togglePlay() {
  // GSAP 主路径：真暂停/真恢复/播完重播
  if (hasGsap() && GsapEngine.tween) {
    const tw = GsapEngine.tween;
    if (tw.progress() >= 1) { GsapEngine.replay(); return; }
    if (tw.paused()) { tw.play(); Store.playing = true; Store.paused = false; setPlayIcon(true); }
    else { tw.pause(); Store.playing = false; Store.paused = true; setPlayIcon(false); }
    return;
  }
  // CSS 降级路径
  const wrap = $('stageWrap');
  if (!wrap.classList.contains('playing')) { playAnimation(); return; }
  if (Store.paused) {
    wrap.style.setProperty('--play-state', 'running');
    Store.paused = false; Store.playing = true; setPlayIcon(true);
  } else {
    wrap.style.setProperty('--play-state', 'paused');
    Store.paused = true; Store.playing = false; setPlayIcon(false);
    stopTimer();
  }
}

function initPlayer() {
  $('replay').addEventListener('click', playAnimation);
  $('btnReplay').addEventListener('click', playAnimation);
  $('btnPlayPause').addEventListener('click', togglePlay);
  $('animSpeed').addEventListener('change', () => {
    if (hasGsap() && GsapEngine.tween && !Store.paused) {
      GsapEngine.tween.timeScale(Number($('animSpeed').value) || 1);
      return;
    }
    if ($('stageWrap').classList.contains('playing') && !Store.paused) playAnimation();
  });
  // 时间轴 scrub：按下拖动即暂停跟手，松开按原状态恢复
  const scrub = $('scrub');
  scrub.addEventListener('input', () => {
    if (!GsapEngine.tween) return;
    GsapEngine.scrubbing = true;
    if (!GsapEngine.tween.paused()) {
      GsapEngine.tween.pause();
      scrub.dataset.resume = '1';
      Store.playing = false; Store.paused = true; setPlayIcon(false);
    } else {
      scrub.dataset.resume = '';
    }
    GsapEngine.tween.time((Number(scrub.value) / 1000) * GsapEngine.total);
  });
  scrub.addEventListener('change', () => {
    GsapEngine.scrubbing = false;
    if (scrub.dataset.resume === '1' && GsapEngine.tween) {
      scrub.dataset.resume = '';
      GsapEngine.tween.play();
      Store.playing = true; Store.paused = false; setPlayIcon(true);
    }
  });
}

/* ---------- 9. 导出 ---------- */
function downloadBlob(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function buildStaticHtml(svgText, w, h) {
  const svg = ensureViewBox(svgText, w, h);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VectorPulse · Static SVG Output</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; display: grid; place-items: center; background: #e7e4db; }
  .stage { position: relative; aspect-ratio: ${w} / ${h}; width: min(90vw, calc(90vh * ${w} / ${h})); border-radius: 3px; background: #fff; border: 2px solid #141414; box-shadow: 4px 4px 0 #141414; overflow: hidden; }
  .stage svg { width: 100%; height: 100%; display: block; }
</style>
</head>
<body>
  <div class="stage">${svg}</div>
</body>
</html>`;
}

function buildAnimatedHtml(svgText, w, h, opts) {
  const isBeam = opts.style === 'beam';
  const anim = buildAnimationData(svgText, opts);
  const t = anim.timing;
  const beamCSS = isBeam ? `
    .frame svg { transform: scale(1.03); -webkit-mask-image: linear-gradient(105deg, #000 42%, rgba(0,0,0,.35) 50%, transparent 58%); mask-image: linear-gradient(105deg, #000 42%, rgba(0,0,0,.35) 50%, transparent 58%); -webkit-mask-size: 260% 100%; mask-size: 260% 100%; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; }
    .playing svg { animation: reveal 2.5s cubic-bezier(.55,.06,.28,.99) forwards, bzoom 3.2s cubic-bezier(.2,.6,.2,1) forwards; }
    @keyframes reveal { from { -webkit-mask-position: 100% 0; mask-position: 100% 0; } to { -webkit-mask-position: 0% 0; mask-position: 0% 0; } }
    @keyframes bzoom { to { transform: scale(1); } }
    .glow { position: absolute; top: -10%; bottom: -10%; left: 0; width: 100px; opacity: 0; pointer-events: none; background: linear-gradient(90deg, transparent 0%, rgba(255,62,0,.3) 30%, #fff 60%, rgba(255,62,0,.3) 80%, transparent 100%); filter: blur(6px); mix-blend-mode: screen; z-index: 3; }
    .playing .glow { animation: sweep 2.5s cubic-bezier(.55,.06,.28,.99) forwards; }
    @keyframes sweep { 0% { transform: translateX(-160px); opacity: 0; } 8% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateX(calc(100cqw + 80px)); opacity: 0; } }
  ` : '';
  const layerCSS = !isBeam ? `
    ${opts.sketch ? `
    .skb path { fill: none; stroke: #141414; stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; }
    .playing .skb path { animation: draw .7s ease-out both; animation-delay: calc(.2s + var(--i) * .04s); }
    .playing .skst { animation: skst-out .8s ease both ${t.tone.toFixed(2)}s; }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    @keyframes skst-out { from { opacity: 1; } to { opacity: 0; } }
    ` : ''}
    .sketch { opacity: 0; filter: grayscale(1) brightness(.6) contrast(1.4); }
    .playing .sketch { animation: sketch-in .8s ease-out ${(t.tone || 0).toFixed(2)}s forwards, ink .8s ease-in-out ${(t.ink || 1.1).toFixed(2)}s forwards, sketch-out 1.4s ease-in ${t.out.toFixed(2)}s forwards; }
    @keyframes sketch-in { from { opacity: 0; } to { opacity: .45; } }
    @keyframes ink { from { opacity: .45; } to { opacity: .75; } }
    @keyframes sketch-out { to { opacity: 0; } }
    .pg { will-change: opacity, clip-path, transform; transform-box: fill-box; transform-origin: 50% 50%; }
    .playing .pg { animation: .55s cubic-bezier(.45,.05,.25,1) both; animation-delay: var(--d); }
    .playing .wipe-r { animation-name: wipe-r; }
    .playing .wipe-l { animation-name: wipe-l; }
    .playing .wipe-d { animation-name: wipe-d; }
    .playing .dab { animation-name: dab; }
    .playing .bloom { animation-name: bloom; }
    @keyframes wipe-r { 0% { opacity: 0; clip-path: polygon(0 0,0 0,0 100%,0 100%); } 35% { opacity: 1; } 100% { opacity: 1; clip-path: polygon(-3% 0,113% 0,113% 100%,-3% 100%); } }
    @keyframes wipe-l { 0% { opacity: 0; clip-path: polygon(100% 0,100% 0,100% 100%,100% 100%); } 35% { opacity: 1; } 100% { opacity: 1; clip-path: polygon(-3% 0,103% 0,103% 100%,-3% 100%); } }
    @keyframes wipe-d { 0% { opacity: 0; clip-path: polygon(0 0,100% 0,100% 0,0 0); } 35% { opacity: 1; } 100% { opacity: 1; clip-path: polygon(0 -3%,100% -3%,100% 113%,0 113%); } }
    @keyframes dab { 0% { opacity: 0; clip-path: circle(0% at 50% 50%); } 35% { opacity: 1; } 100% { opacity: 1; clip-path: circle(120% at 50% 50%); } }
    @keyframes bloom { 0% { opacity: 0; filter: blur(8px); transform: scale(1.04); } 100% { opacity: 1; filter: blur(0); transform: scale(1); } }
    .playing #art { animation: settle .8s ease-out forwards; animation-delay: ${t.settle.toFixed(2)}s; }
    @keyframes settle { from { filter: saturate(.9) brightness(1.02); } to { filter: none; } }
  ` : '';
  const inner = isBeam
    ? anim.colorBody
    : (opts.sketch ? `<g class="skst">\n${anim.sketchHtml}\n</g>\n<use href="#art" class="sketch"/>\n` : '') + `<g id="art">\n${anim.colorBody}\n</g>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VectorPulse · Industrial Motion Output</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body { min-height: 100svh; display: grid; place-items: center; background-color: #e7e4db; background-image: radial-gradient(#141414 1px, transparent 1px); background-size: 18px 18px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .stage { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 24px 0; }
  .frame { position: relative; aspect-ratio: ${w} / ${h}; width: min(460px, 92vw, calc(80svh * ${w} / ${h})); border-radius: 3px; overflow: hidden; background: #fff; border: 2px solid #141414; box-shadow: 4px 4px 0 #141414; }
  .frame svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  ${layerCSS}
  ${beamCSS}
  .bar { width: min(460px, 92vw); height: 8px; background: #dad6c9; border: 2px solid #141414; border-radius: 2px; overflow: hidden; }
  .bar i { display: block; height: 100%; width: 0%; background: #ff3e00; }
  .playing .bar i { animation: bar-fill ${t.total.toFixed(2)}s linear forwards; }
  @keyframes bar-fill { to { width: 100%; } }
  .tools { display: flex; align-items: center; gap: 12px; }
  button { appearance: none; border: 2px solid #141414; cursor: pointer; padding: 8px 18px; border-radius: 3px; background: #ff3e00; color: #fff; font-size: 11.5px; font-weight: 800; text-transform: uppercase; box-shadow: 2px 2px 0 #141414; }
  button:active { transform: translate(2px, 2px); box-shadow: none; }
</style>
</head>
<body>
  <main class="stage">
    <div class="frame" id="frame">
      <svg version="1.1" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" class="${isBeam ? 'beam-svg' : ''}">${inner}</svg>
      ${isBeam ? '<div class="glow"></div>' : ''}
    </div>
    <div class="bar"><i></i></div>
    <div class="tools"><button id="replayBtn" type="button">RESTART 重新发生</button></div>
  </main>
  <script>
    const frame = document.getElementById('frame');
    function restart() { frame.classList.remove('playing'); void frame.offsetWidth; frame.classList.add('playing'); }
    document.getElementById('replayBtn').addEventListener('click', restart);
    window.addEventListener('DOMContentLoaded', restart);
  <\/script>
</body>
</html>`;
}

function initExporters() {
  $('retrace').addEventListener('click', () => void triggerTrace());
  $('dlsvg').addEventListener('click', () => {
    if (Store.svg) downloadBlob('vectorpulse-output.svg', Store.svg, 'image/svg+xml;charset=utf-8');
  });
  $('dlstatic').addEventListener('click', () => {
    if (Store.svg && Store.src) downloadBlob('vectorpulse-static.html', buildStaticHtml(Store.svg, Store.src.w, Store.src.h), 'text/html;charset=utf-8');
  });
  $('dlanim').addEventListener('click', () => {
    if (Store.svg && Store.src) downloadBlob('vectorpulse-animated.html', buildAnimatedHtml(Store.svg, Store.src.w, Store.src.h, readAnimOpts()), 'text/html;charset=utf-8');
  });
  $('dlpng').addEventListener('click', () => {
    if (!Store.svg || !Store.src) return;
    const scale = Number($('pngscale').value);
    log('RENDERING PNG OFFSCREEN...', true);
    const url = URL.createObjectURL(new Blob([Store.svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = Store.src.w * scale; cv.height = Store.src.h * scale;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => {
        if (b) { downloadBlob(`vectorpulse-${cv.width}x${cv.height}.png`, b, 'image/png'); log(`PNG EXPORTED: ${cv.width}×${cv.height}`); }
        else log('PNG RENDER FAILED');
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); log('PNG RENDER FAILED'); };
    img.src = url;
  });
}

/* ---------- 10. 源码弹窗 ---------- */
function initModal() {
  const modal = $('codeModal');
  const open = () => { if (!Store.svg) return; $('svgCodeArea').value = Store.svg; modal.hidden = false; $('closeCodeModal').focus(); };
  const close = () => { modal.hidden = true; };
  $('btnViewCode').addEventListener('click', open);
  $('closeCodeModal').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  $('copySvgCode').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(Store.svg); log('SVG CODE COPIED'); }
    catch (_) { log('CLIPBOARD BLOCKED'); }
  });
  $('copySvgDataUri').addEventListener('click', async () => {
    try {
      const uri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(Store.svg)));
      await navigator.clipboard.writeText(uri); log('DATA URI COPIED');
    } catch (_) { log('CLIPBOARD BLOCKED'); }
  });
}

/* ---------- 11. 快捷键 ---------- */
function initShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); if (Store.svg) togglePlay(); }
    else if (e.key === 'r' || e.key === 'R') { if (Store.src && !$('retrace').disabled) void triggerTrace(); }
    else if (e.key === '1') setView('split');
    else if (e.key === '2') setView('side');
    else if (e.key === '3') setView('svg');
    else if (e.key === 'Escape' && !$('codeModal').hidden) $('codeModal').hidden = true;
  });
}

/* ---------- 12. 启动 ---------- */
function bootstrap() {
  // 引擎探测：GSAP 就绪走时间轴主路径，否则 CSS 降级（离线/拦截均可用）
  const eng = (typeof window.gsap !== 'undefined') ? 'gsap' : 'css';
  document.body.dataset.engine = eng;
  // 进度 UI 二选一：全局 [hidden] 是 !important，CSS 覆盖抢不过，必须 JS 摘属性
  $('scrub').hidden = eng !== 'gsap';
  $('progressWrap').hidden = eng === 'gsap';
  const hint = $('engineHint');
  if (hint) {
    hint.textContent = eng === 'gsap'
      ? 'ENGINE: GSAP TIMELINE · scrub / 变速 / 笔尖跟随已就绪'
      : 'ENGINE: CSS FALLBACK · CDN 未加载，已自动降级';
  }
  initParams();
  initUploadChannels();
  initViews();
  initPlayer();
  initExporters();
  initModal();
  initShortcuts();
  setView('split');
  BodyState.set(false);

  window.addEventListener('resize', schedulePreviewResizeDebounced);
  if ('ResizeObserver' in window && $('stageViewport')) {
    new ResizeObserver(schedulePreviewResize).observe($('stageViewport'));
  }
}

window.addEventListener('DOMContentLoaded', bootstrap);
// 暴露给调试 / 旧调用兼容
window.VectorPulse = { triggerTrace: () => void triggerTrace(), playAnimation, setView, Store };

})();
