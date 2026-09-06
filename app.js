/* =========================================================================
 * VectorPulse Studio - 核心交互逻辑与动效流水线
 * ========================================================================= */

// DOM 工具与异步等待
const $ = (id) => document.getElementById(id);
const log = (msg, spin) => {
  $('log').innerHTML = spin ? `<span class="spin"></span>${msg}` : msg;
};
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

// 全局运行状态
let SRC = null; // 包含 { canvas, w, h, rgba, originalBmp }
let CURRENT_SVG = '';
let isPaused = false;
let animTimer = null;

// 1. 预设参数方案配置表
const PRESETS = {
  balanced: { hier: 'stacked', mode: 'spline', cp: 7, fs: 4, ld: 16, upscale: 2, anim: 'paint', layers: 36, stagger: 14, sketch: true },
  logo: { hier: 'cutout', mode: 'polygon', cp: 4, fs: 8, ld: 32, upscale: 2, anim: 'bloom', layers: 16, stagger: 18, sketch: false },
  anime: { hier: 'stacked', mode: 'spline', cp: 8, fs: 2, ld: 10, upscale: 2, anim: 'paint', layers: 48, stagger: 12, sketch: true },
  photo: { hier: 'stacked', mode: 'spline', cp: 5, fs: 12, ld: 24, upscale: 1, anim: 'beam', layers: 24, stagger: 10, sketch: false },
  lineart: { hier: 'stacked', mode: 'spline', cp: 2, fs: 6, ld: 48, upscale: 2, anim: 'paint', layers: 20, stagger: 15, sketch: true }
};

// 2. 动画数据生成与关键帧编排器
function buildAnimationData(svgText, opts) {
  const paths = svgText.match(/<path\b.*?\/>/gs) || [];
  const weights = paths.map((p) => (p.match(/d="([^"]*)"/) || ['', ''])[1].length);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const perLayerWeight = Math.max(1, totalWeight / opts.layers);

  const layers = [];
  let currentLayer = [];
  let currentAcc = 0;

  for (let i = 0; i < paths.length; i++) {
    currentLayer.push(paths[i]);
    currentAcc += weights[i];
    if (currentAcc >= perLayerWeight && layers.length < opts.layers - 1) {
      layers.push(currentLayer);
      currentLayer = [];
      currentAcc = 0;
    }
  }
  if (currentLayer.length) layers.push(currentLayer);

  const timing = {};
  let sketchHtml = '';

  if (opts.sketch && opts.style !== 'beam') {
    const NUM_BATCHES = 46;
    const perBatchWeight = Math.max(1, totalWeight / NUM_BATCHES);
    const batches = [];
    let bCur = [];
    let bAcc = 0;

    paths.forEach((p, i) => {
      bCur.push(p.replace('<path ', '<path pathLength="1" ', 1));
      bAcc += weights[i];
      if (bAcc >= perBatchWeight && batches.length < NUM_BATCHES - 1) {
        batches.push(bCur);
        bCur = [];
        bAcc = 0;
      }
    });
    if (bCur.length) batches.push(bCur);

    sketchHtml = batches
      .map((b, i) => `<g class="skb" style="--i:${i}">\n${b.join('\n')}\n</g>`)
      .join('\n');

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
    let animClass = 'wipe-r';
    if (opts.style === 'bloom') {
      animClass = 'bloom';
    } else if (opts.style === 'paint') {
      animClass = i < 6 ? paintClasses[(i * 3 + 1) % 4] : paintClasses[Math.floor(Math.random() * 4)];
    }
    colorBody += `<g class="pg ${animClass}" style="--i:${i};--d:calc(${timing.T0}s + var(--i) * ${opts.stagger}s)">\n${group.join('\n')}\n</g>\n`;
  });

  timing.end = timing.T0 + (layers.length - 1) * opts.stagger + 0.55;
  timing.out = Math.max(0, timing.end - 0.9);
  timing.settle = timing.end;
  timing.total = timing.end + 1.2;

  return {
    colorBody,
    sketchHtml,
    timing,
    layerCount: layers.length,
    pathCount: paths.length
  };
}

function ensureViewBox(svgText, w, h) {
  if (/viewBox=/i.test(svgText)) return svgText;
  return svgText.replace('<svg ', `<svg viewBox="0 0 ${w} ${h}" `);
}

// 3. 页面交互控制初始化
function initRangeListeners() {
  const syncRange = (id, targetId) => {
    $(id).addEventListener('input', () => {
      $(targetId).textContent = $(id).value;
      $('presetSelect').value = 'custom';
    });
  };

  syncRange('cp', 'cpv');
  syncRange('fs', 'fsv');
  syncRange('ld', 'ldv');
  syncRange('layers', 'layersv');
  $('stagger').addEventListener('input', () => {
    $('staggerv').textContent = '.' + String($('stagger').value).padStart(2, '0');
    $('presetSelect').value = 'custom';
  });

  $('presetSelect').addEventListener('change', (e) => {
    const p = PRESETS[e.target.value];
    if (!p) return;
    $('hier').value = p.hier;
    $('mode').value = p.mode;
    $('cp').value = p.cp;
    $('cpv').textContent = p.cp;
    $('fs').value = p.fs;
    $('fsv').textContent = p.fs;
    $('ld').value = p.ld;
    $('ldv').textContent = p.ld;
    $('upscale').value = p.upscale;
    $('animStyle').value = p.anim;
    $('layers').value = p.layers;
    $('layersv').textContent = p.layers;
    $('stagger').value = p.stagger;
    $('staggerv').textContent = '.' + String(p.stagger).padStart(2, '0');
    $('sketch').checked = p.sketch;

    if (SRC) triggerTrace();
  });
}

function computePreviewBox() {
  if (!SRC) return { w: 320, h: 240 };
  const availW = Math.min(480, Math.max(220, window.innerWidth - (window.innerWidth <= 960 ? 40 : 640)));
  const availH = Math.max(220, Math.round(window.innerHeight * 0.58));
  const scale = Math.min(availW / SRC.w, availH / SRC.h);
  return {
    w: Math.round(SRC.w * scale),
    h: Math.round(SRC.h * scale)
  };
}

function updatePreviewGeometry() {
  if (!SRC) return;
  const box = computePreviewBox();

  const diffBox = $('diffBox');
  diffBox.style.width = box.w + 'px';
  diffBox.style.height = box.h + 'px';

  const diffCv = $('diffCv');
  diffCv.width = box.w;
  diffCv.height = box.h;
  diffCv.getContext('2d').drawImage(SRC.canvas, 0, 0, box.w, box.h);

  ['pvSrc', 'pvOut'].forEach((id) => {
    const el = $(id);
    el.style.width = box.w + 'px';
    el.style.height = box.h + 'px';
  });

  const cvSrc = $('cvSrc');
  cvSrc.width = box.w;
  cvSrc.height = box.h;
  cvSrc.getContext('2d').drawImage(SRC.canvas, 0, 0, box.w, box.h);
}

window.addEventListener('resize', () => {
  if (SRC && !$('stageWrap').hidden) updatePreviewGeometry();
});

// 4. 图片输入多通道（文件上传、拖放、Ctrl+V 粘贴）
async function processFile(file) {
  try {
    log('正在解码图片文件…', true);
    const bmp = await createImageBitmap(file);
    await wait(20);

    const upscale = Number($('upscale').value);
    let targetW = bmp.width * upscale;
    let targetH = bmp.height * upscale;

    // 大图限制，保证毫秒级转换性能
    const MAX_DIM = 2048;
    if (Math.max(targetW, targetH) > MAX_DIM) {
      const k = MAX_DIM / Math.max(targetW, targetH);
      targetW = Math.round(targetW * k);
      targetH = Math.round(targetH * k);
    }

    const cv = document.createElement('canvas');
    cv.width = targetW;
    cv.height = targetH;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, targetW, targetH);

    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    SRC = {
      canvas: cv,
      w: targetW,
      h: targetH,
      rgba: imgData.data,
      originalBmp: bmp
    };

    $('stageWrap').hidden = false;
    $('viewTabs').hidden = false;
    updatePreviewGeometry();

    log(`已载入图片: ${bmp.width}×${bmp.height} ${upscale > 1 ? `(超采样尺寸: ${targetW}×${targetH})` : ''}`);
    $('retrace').disabled = false;
    await triggerTrace();
  } catch (err) {
    log(`图片载入失败: ${err.message}`);
    console.error(err);
  }
}

function initUploadChannels() {
  const dropZone = $('drop');
  const fileInput = $('file');

  dropZone.addEventListener('click', (e) => {
    if (e.target !== fileInput) fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('over');
  });

  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('over');
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  });

  // 全局截图直接 Ctrl+V 粘贴
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const pastedFile = item.getAsFile();
        if (pastedFile) {
          processFile(pastedFile);
          break;
        }
      }
    }
  });
}

// 5. 矢量化转换触发
async function triggerTrace() {
  if (!SRC) return;
  log('VTracer WASM 运算处理中…', true);
  await wait(30);

  try {
    const t0 = performance.now();
    const config = {
      mode: $('mode').value,
      hierarchical: $('hier').value,
      colorPrecision: Number($('cp').value),
      filterSpeckle: Number($('fs').value),
      layerDifference: Number($('ld').value),
      pathPrecision: 2
    };

    const svgResult = window.VTracer.convertPixels(SRC.rgba, SRC.w, SRC.h, config);
    const ms = Math.round(performance.now() - t0);
    CURRENT_SVG = ensureViewBox(svgResult, SRC.w, SRC.h);

    const pathCount = (CURRENT_SVG.match(/<path/g) || []).length;
    const kb = (new Blob([CURRENT_SVG]).size / 1024).toFixed(1);

    $('stats').hidden = false;
    $('stats').innerHTML = `
      <span class="chip">路径段数 <b>${pathCount}</b></span>
      <span class="chip">SVG 体积 <b>${kb}</b> KB</span>
      <span class="chip">耗时 <b>${ms}</b> ms</span>
      <span class="chip">分辨率 <b>${SRC.w}×${SRC.h}</b></span>
    `;

    renderSvgToContainers(CURRENT_SVG);

    ['dlsvg', 'dlpng', 'dlstatic', 'dlanim', 'btnViewCode', 'replay'].forEach(
      (id) => ($(id).disabled = false)
    );

    log('描摹完成！可在舞台区拖动滑动条对比，或点击「播放动效」。');
  } catch (err) {
    log(`描摹失败: ${err.message}`);
    console.error(err);
  }
}

function renderSvgToContainers(svg) {
  $('diffSvg').innerHTML = svg;
  $('pvOut').innerHTML = `<span class="tag" id="pvOutTag">SVG</span>` + svg;
}

// 6. 视图切换与卷帘滑动条
function initViews() {
  const diffRange = $('diffRange');
  const diffBox = $('diffBox');

  diffRange.addEventListener('input', (e) => {
    diffBox.style.setProperty('--split', e.target.value);
  });

  $('viewTabs').addEventListener('click', (e) => {
    if (!e.target.classList.contains('tab-btn')) return;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    e.target.classList.add('active');

    const view = e.target.dataset.view;
    if (view === 'split') {
      diffBox.hidden = false;
      $('sideWrap').hidden = true;
      diffBox.style.setProperty('--split', '50');
      diffRange.value = 50;
    } else if (view === 'side') {
      diffBox.hidden = true;
      $('sideWrap').hidden = false;
      $('pvSrc').parentElement.hidden = false;
    } else if (view === 'svg') {
      diffBox.hidden = true;
      $('sideWrap').hidden = false;
      $('pvSrc').parentElement.hidden = true;
    }
  });
}

// 7. 动画播放与控制系统
function playAnimation() {
  if (!CURRENT_SVG || !SRC) return;

  const opts = {
    style: $('animStyle').value,
    layers: Number($('layers').value),
    stagger: Number($('stagger').value) / 100,
    sketch: $('sketch').checked
  };

  const anim = buildAnimationData(CURRENT_SVG, opts);
  const isBeam = opts.style === 'beam';

  const innerSvgContent = isBeam
    ? anim.colorBody
    : (opts.sketch ? `<g class="skst">\n${anim.sketchHtml}\n</g>\n<use href="#art" class="sketch"/>\n` : '') + `<g id="art">\n${anim.colorBody}\n</g>`;

  const extra = isBeam ? '<div class="glow"></div>\n<div class="shine"></div>' : '';

  const hostContainers = [$('diffSvg'), $('pvOut')];

  hostContainers.forEach((container) => {
    container.innerHTML = `
      <svg version="1.1" viewBox="0 0 ${SRC.w} ${SRC.h}" xmlns="http://www.w3.org/2000/svg" class="${isBeam ? 'beam-svg' : ''}">
        ${innerSvgContent}
      </svg>
      ${extra}
    `;

    const svgEl = container.querySelector('svg');
    if (svgEl && !isBeam) {
      svgEl.style.setProperty('--tone', `${anim.timing.tone.toFixed(2)}s`);
      svgEl.style.setProperty('--ink', `${anim.timing.ink.toFixed(2)}s`);
      svgEl.style.setProperty('--out', `${anim.timing.out.toFixed(2)}s`);
      svgEl.style.setProperty('--settle', `${anim.timing.settle.toFixed(2)}s`);
    }
  });

  // 计算动画时长与播速
  const duration = isBeam ? 3.4 : anim.timing.total;
  const speed = Number($('animSpeed').value);
  const effectiveDuration = duration / speed;

  const stageWrap = $('stageWrap');
  stageWrap.style.setProperty('--total-duration', `${effectiveDuration}s`);
  stageWrap.style.setProperty('--play-state', 'running');

  // 触发重绘播放动画
  stageWrap.classList.remove('playing');
  void stageWrap.offsetWidth;
  stageWrap.classList.add('playing');

  isPaused = false;
  $('playIcon').style.display = 'none';
  $('pauseIcon').style.display = 'block';

  if (animTimer) clearTimeout(animTimer);
  animTimer = setTimeout(() => {
    if ($('animLoop').checked) {
      playAnimation();
    } else {
      isPaused = true;
      $('playIcon').style.display = 'block';
      $('pauseIcon').style.display = 'none';
    }
  }, effectiveDuration * 1000);

  log(`正在播放动效（图层: ${anim.layerCount} · 预计时长: ${effectiveDuration.toFixed(1)}s）`);
}

function initAnimationControls() {
  $('replay').addEventListener('click', playAnimation);
  $('btnReplay').addEventListener('click', playAnimation);

  $('btnPlayPause').addEventListener('click', () => {
    const stageWrap = $('stageWrap');
    if (!stageWrap.classList.contains('playing')) {
      playAnimation();
      return;
    }

    if (isPaused) {
      stageWrap.style.setProperty('--play-state', 'running');
      isPaused = false;
      $('playIcon').style.display = 'none';
      $('pauseIcon').style.display = 'block';
    } else {
      stageWrap.style.setProperty('--play-state', 'paused');
      isPaused = true;
      $('playIcon').style.display = 'block';
      $('pauseIcon').style.display = 'none';
      if (animTimer) clearTimeout(animTimer);
    }
  });

  $('animSpeed').addEventListener('change', () => {
    if ($('stageWrap').classList.contains('playing')) {
      playAnimation();
    }
  });
}

// 8. 静态与动画 HTML 导出生成器
function buildStaticHtml(svgText, w, h) {
  const normalizedSvg = ensureViewBox(svgText, w, h);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VectorPulse · Static SVG Output</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; display: grid; place-items: center; background: #080d0d; }
  .stage {
    position: relative;
    aspect-ratio: ${w} / ${h};
    width: min(90vw, calc(90vh * ${w} / ${h}));
    overflow: hidden;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 20px 50px rgba(0,0,0,0.6);
  }
  .stage svg { width: 100%; height: 100%; display: block; }
</style>
</head>
<body>
  <div class="stage">
    ${normalizedSvg}
  </div>
</body>
</html>`;
}

function buildAnimatedHtml(svgText, w, h, opts) {
  const isBeam = opts.style === 'beam';
  const anim = buildAnimationData(svgText, opts);
  const t = anim.timing;

  const beamCSS = isBeam ? `
    .frame svg {
      transform: scale(1.04);
      filter: brightness(.85) saturate(.95);
      -webkit-mask-image: linear-gradient(105deg, #000 42%, rgba(0,0,0,.35) 50%, transparent 58%);
      mask-image: linear-gradient(105deg, #000 42%, rgba(0,0,0,.35) 50%, transparent 58%);
      -webkit-mask-size: 260% 100%;
      mask-size: 260% 100%;
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
    }
    .playing svg {
      animation: reveal 2.5s cubic-bezier(.55,.06,.28,.99) forwards,
                 bzoom 3.2s cubic-bezier(.2,.6,.2,1) forwards,
                 bbright 3.2s ease forwards;
    }
    @keyframes reveal { from { -webkit-mask-position: 100% 0; mask-position: 100% 0; } to { -webkit-mask-position: 0% 0; mask-position: 0% 0; } }
    @keyframes bzoom { to { transform: scale(1); } }
    @keyframes bbright { to { filter: brightness(1) saturate(1); } }
    .glow {
      position: absolute; top: -10%; bottom: -10%; left: 0; width: 120px; opacity: 0; pointer-events: none;
      background: linear-gradient(90deg, transparent 0%, rgba(0,229,163,.15) 25%, rgba(100,255,217,.6) 55%, #fff 60%, rgba(100,255,217,.6) 65%, transparent 100%);
      filter: blur(8px); mix-blend-mode: screen; z-index: 3;
    }
    .playing .glow { animation: sweep 2.5s cubic-bezier(.55,.06,.28,.99) forwards; }
    .shine {
      position: absolute; inset: 0; opacity: 0; pointer-events: none; mix-blend-mode: screen; z-index: 4;
      background: linear-gradient(75deg, transparent 30%, rgba(255,255,255,.1) 42%, rgba(200,255,245,.4) 50%, rgba(255,255,255,.1) 58%, transparent 70%);
    }
    .playing .shine { animation: shine2 1s cubic-bezier(.4,.05,.3,1) 2.7s forwards; }
    @keyframes shine2 { 0% { opacity: 0; transform: translateX(-140%); } 25% { opacity: .85; } 100% { opacity: 0; transform: translateX(140%); } }
    @keyframes sweep { 0% { transform: translateX(-160px); opacity: 0; } 8% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateX(calc(100cqw + 80px)); opacity: 0; } }
  ` : '';

  const layerCSS = !isBeam ? `
    ${opts.sketch ? `
    .skb path {
      fill: none; stroke: #454a4d; stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1;
    }
    .playing .skb path {
      animation: draw .7s ease-out both;
      animation-delay: calc(.2s + var(--i) * .04s);
    }
    .playing .skst { animation: skst-out .8s ease both ${t.tone.toFixed(2)}s; }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    @keyframes skst-out { from { opacity: 1; } to { opacity: 0; } }
    ` : ''}
    .sketch { opacity: 0; filter: grayscale(1) brightness(.72) contrast(1.35); }
    .playing .sketch {
      will-change: opacity;
      animation: sketch-in .8s ease-out ${(t.tone || 0).toFixed(2)}s forwards,
                 ink .8s ease-in-out ${(t.ink || 1.1).toFixed(2)}s forwards,
                 sketch-out 1.4s ease-in ${t.out.toFixed(2)}s forwards;
    }
    @keyframes sketch-in { from { opacity: 0; } to { opacity: .38; } }
    @keyframes ink { from { opacity: .38; } to { opacity: .62; } }
    @keyframes sketch-out { to { opacity: 0; } }
    .pg { will-change: opacity, clip-path, transform; }
    .playing .pg {
      animation: .55s cubic-bezier(.45,.05,.25,1) both;
      animation-delay: var(--d);
    }
    .playing .wipe-r { animation-name: wipe-r; }
    .playing .wipe-l { animation-name: wipe-l; }
    .playing .wipe-d { animation-name: wipe-d; }
    .playing .dab { animation-name: dab; }
    .playing .bloom { animation-name: bloom; }
    @keyframes wipe-r { 0% { opacity: 0; clip-path: polygon(0 0,0 0,0 100%,0 100%); } 35% { opacity: 1; } 100% { opacity: 1; clip-path: polygon(-3% 0,113% 0,113% 100%,-3% 100%); } }
    @keyframes wipe-l { 0% { opacity: 0; clip-path: polygon(100% 0,100% 0,100% 100%,100% 100%); } 35% { opacity: 1; } 100% { opacity: 1; clip-path: polygon(-3% 0,103% 0,103% 100%,-3% 100%); } }
    @keyframes wipe-d { 0% { opacity: 0; clip-path: polygon(0 0,100% 0,100% 0,0 0); } 35% { opacity: 1; } 100% { opacity: 1; clip-path: polygon(0 -3%,100% -3%,100% 113%,0 113%); } }
    @keyframes dab { 0% { opacity: 0; clip-path: circle(0% at 50% 50%); } 35% { opacity: 1; } 100% { opacity: 1; clip-path: circle(120% at 50% 50%); } }
    @keyframes bloom { 0% { opacity: 0; filter: blur(10px); transform: scale(1.05); } 100% { opacity: 1; filter: blur(0); transform: scale(1); } }
    .pg { transform-box: fill-box; transform-origin: 50% 50%; }
    .playing #art { animation: settle .9s ease-out forwards; animation-delay: ${t.settle.toFixed(2)}s; }
    @keyframes settle { from { filter: saturate(.95) brightness(1.02); } to { filter: none; } }
  ` : '';

  const innerSvgContent = isBeam
    ? anim.colorBody
    : (opts.sketch ? `<g class="skst">\n${anim.sketchHtml}\n</g>\n<use href="#art" class="sketch"/>\n` : '') + `<g id="art">\n${anim.colorBody}\n</g>`;

  const extraDecor = isBeam ? '<div class="glow"></div>\n<div class="shine"></div>\n' : '';
  const frameBg = isBeam ? '#050f0e' : '#fff';
  const pageBg = isBeam
    ? 'radial-gradient(90% 90% at 75% 10%, #10312e 0%, #0a1f1e 45%, #050f10 100%)'
    : 'radial-gradient(120% 120% at 20% 0%, #f4fffc 0%, #e8f7f2 55%, #dfeee8 100%)';

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VectorPulse · Animated Motion Artwork</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    min-height: 100svh;
    display: grid;
    place-items: center;
    background: ${pageBg};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 24px 0;
  }
  .frame {
    position: relative;
    aspect-ratio: ${w} / ${h};
    width: min(460px, 92vw, calc(80svh * ${w} / ${h}));
    border-radius: 12px;
    overflow: hidden;
    isolation: isolate;
    background: ${frameBg};
    box-shadow: 0 0 0 1px rgba(0, 229, 163, 0.2), 0 20px 50px -10px rgba(0,0,0,0.5);
  }
  .frame svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  ${layerCSS}
  ${beamCSS}
  .bar {
    width: min(460px, 92vw);
    height: 4px;
    border-radius: 99px;
    background: rgba(0, 229, 163, 0.2);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    width: 0%;
    border-radius: 99px;
    background: linear-gradient(90deg, #00e5a3, #64ffd9);
  }
  .playing .bar i {
    animation: bar-fill ${t.total.toFixed(2)}s linear forwards;
  }
  @keyframes bar-fill { to { width: 100%; } }
  .tools { display: flex; align-items: center; gap: 12px; }
  button {
    appearance: none;
    border: none;
    cursor: pointer;
    padding: 8px 20px;
    border-radius: 99px;
    background: #00e5a3;
    color: #041a15;
    font-size: 13.5px;
    font-weight: 700;
    transition: transform .15s, box-shadow .15s;
  }
  button:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(0,229,163,.4);
  }
  button:active { transform: none; }
</style>
</head>
<body>
  <main class="stage">
    <div class="frame" id="frame">
      <svg version="1.1" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" class="${isBeam ? 'beam-svg' : ''}">
        ${innerSvgContent}
      </svg>
      ${extraDecor}
    </div>
    <div class="bar"><i id="barInner"></i></div>
    <div class="tools">
      <button id="replayBtn" type="button">重播动画</button>
    </div>
  </main>
  <script>
    const frame = document.getElementById('frame');
    function restart() {
      frame.classList.remove('playing');
      void frame.offsetWidth;
      frame.classList.add('playing');
    }
    document.getElementById('replayBtn').addEventListener('click', restart);
    window.addEventListener('DOMContentLoaded', restart);
  <\/script>
</body>
</html>`;
}

// 9. 导出与源码查看逻辑
function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function initExportHandlers() {
  $('retrace').addEventListener('click', triggerTrace);

  $('dlsvg').addEventListener('click', () => {
    downloadBlob('vectorpulse-output.svg', CURRENT_SVG, 'image/svg+xml;charset=utf-8');
  });

  $('dlstatic').addEventListener('click', () => {
    const html = buildStaticHtml(CURRENT_SVG, SRC.w, SRC.h);
    downloadBlob('vectorpulse-static.html', html, 'text/html;charset=utf-8');
  });

  $('dlanim').addEventListener('click', () => {
    const opts = {
      style: $('animStyle').value,
      layers: Number($('layers').value),
      stagger: Number($('stagger').value) / 100,
      sketch: $('sketch').checked
    };
    const html = buildAnimatedHtml(CURRENT_SVG, SRC.w, SRC.h, opts);
    downloadBlob('vectorpulse-animated.html', html, 'text/html;charset=utf-8');
  });

  $('dlpng').addEventListener('click', () => {
    const scale = Number($('pngscale').value);
    log('正在通过离屏画布渲染高清 PNG…', true);
    const blobUrl = URL.createObjectURL(new Blob([CURRENT_SVG], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();

    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = SRC.w * scale;
      cv.height = SRC.h * scale;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(blobUrl);

      cv.toBlob((b) => {
        downloadBlob(`vectorpulse-${cv.width}x${cv.height}.png`, b, 'image/png');
        log(`PNG 导出完毕: ${cv.width}×${cv.height}`);
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      log('PNG 转换失败，请检查浏览器安全策略。');
    };

    img.src = blobUrl;
  });

  // 查看源码模态框交互
  const modal = $('codeModal');
  $('btnViewCode').addEventListener('click', () => {
    $('svgCodeArea').value = CURRENT_SVG;
    modal.hidden = false;
  });
  $('closeCodeModal').addEventListener('click', () => (modal.hidden = true));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });

  $('copySvgCode').addEventListener('click', async () => {
    await navigator.clipboard.writeText(CURRENT_SVG);
    log('SVG 代码已复制到剪贴板！');
  });

  $('copySvgDataUri').addEventListener('click', async () => {
    const base64 = btoa(unescape(encodeURIComponent(CURRENT_SVG)));
    const uri = `data:image/svg+xml;base64,${base64}`;
    await navigator.clipboard.writeText(uri);
    log('Data URI 已复制到剪贴板！');
  });
}

// 10. 初始化启动入口
function bootstrap() {
  initRangeListeners();
  initUploadChannels();
  initViews();
  initAnimationControls();
  initExportHandlers();
}

window.addEventListener('DOMContentLoaded', bootstrap);