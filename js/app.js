/**
 * VectorPulse Studio - 应用交互驱动主模块
 */
import { traceImage } from './engine.js';
import {
  buildAnimationData,
  ensureViewBox,
  buildStaticHtml,
  buildAnimatedHtml
} from './animator.js';

// DOM 简易选择器
const $ = (id) => document.getElementById(id);
const log = (msg, spin) => {
  $('log').innerHTML = spin ? `<span class="spin"></span>${msg}` : msg;
};
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

// 全局运行态
let SRC = null; // { canvas, w, h, rgba, originalBmp }
let CURRENT_SVG = '';
let isPaused = false;
let animTimer = null;

// 1. 预设参数方案字典
const PRESETS = {
  balanced: { hier: 'stacked', mode: 'spline', cp: 7, fs: 4, ld: 16, upscale: 2, anim: 'paint', layers: 36, stagger: 14, sketch: true },
  logo: { hier: 'cutout', mode: 'polygon', cp: 4, fs: 8, ld: 32, upscale: 2, anim: 'bloom', layers: 16, stagger: 18, sketch: false },
  anime: { hier: 'stacked', mode: 'spline', cp: 8, fs: 2, ld: 10, upscale: 2, anim: 'paint', layers: 48, stagger: 12, sketch: true },
  photo: { hier: 'stacked', mode: 'spline', cp: 5, fs: 12, ld: 24, upscale: 1, anim: 'beam', layers: 24, stagger: 10, sketch: false },
  lineart: { hier: 'stacked', mode: 'spline', cp: 2, fs: 6, ld: 48, upscale: 2, anim: 'paint', layers: 20, stagger: 15, sketch: true }
};

// 2. 初始化滑块事件与预设联动
function initRangeListeners() {
  const syncRange = (id, targetId, prefix = '') => {
    $(id).addEventListener('input', () => {
      $(targetId).textContent = prefix + $(id).value;
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

// 3. 响应式视口适配计算
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

  // 卷帘容器尺寸
  const diffBox = $('diffBox');
  diffBox.style.width = box.w + 'px';
  diffBox.style.height = box.h + 'px';

  // 原图 Canvas 尺寸
  const diffCv = $('diffCv');
  diffCv.width = box.w;
  diffCv.height = box.h;
  diffCv.getContext('2d').drawImage(SRC.canvas, 0, 0, box.w, box.h);

  // 并排视图尺寸
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

// 4. 图片载入核心处理
async function processFile(file) {
  try {
    log('正在解码图片文件…', true);
    const bmp = await createImageBitmap(file);
    await wait(30);

    const upscale = Number($('upscale').value);
    let targetW = bmp.width * upscale;
    let targetH = bmp.height * upscale;

    // 防止极端大图占用爆内存
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

    log(`已成功载入: ${bmp.width}×${bmp.height} ${upscale > 1 ? `(工作尺寸: ${targetW}×${targetH})` : ''}`);
    $('retrace').disabled = false;
    await triggerTrace();
  } catch (err) {
    log(`载入失败: ${err.message}`);
    console.error(err);
  }
}

// 5. 拖拽、点击、剪贴板多通道上传
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

  // 全局剪贴板粘贴监听 (Ctrl+V)
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

// 6. 执行矢量化描摹
async function triggerTrace() {
  if (!SRC) return;
  log('VTracer WASM 运算处理中…', true);
  await wait(40);

  try {
    const t0 = performance.now();
    const svgResult = await traceImage(SRC.rgba, SRC.w, SRC.h, {
      mode: $('mode').value,
      hierarchical: $('hier').value,
      colorPrecision: $('cp').value,
      filterSpeckle: $('fs').value,
      layerDifference: $('ld').value
    });

    const ms = Math.round(performance.now() - t0);
    CURRENT_SVG = ensureViewBox(svgResult, SRC.w, SRC.h);

    const pathCount = (CURRENT_SVG.match(/<path/g) || []).length;
    const kb = (new Blob([CURRENT_SVG]).size / 1024).toFixed(1);

    $('stats').hidden = false;
    $('stats').innerHTML = `
      <span class="chip">路径段数 <b>${pathCount}</b></span>
      <span class="chip">SVG 体积 <b>${kb}</b> KB</span>
      <span class="chip">渲染耗时 <b>${ms}</b> ms</span>
      <span class="chip">工作分辨率 <b>${SRC.w}×${SRC.h}</b></span>
    `;

    // 更新各容器内容
    renderSvgToContainers(CURRENT_SVG);

    // 启用所有导出功能
    ['dlsvg', 'dlpng', 'dlstatic', 'dlanim', 'btnViewCode', 'replay'].forEach(
      (id) => ($(id).disabled = false)
    );

    log('描摹转换完成！可在下方卷帘滑块对比，或点击「播放动画」。');
  } catch (err) {
    log(`描摹失败: ${err.message}`);
    console.error(err);
  }
}

function renderSvgToContainers(svg) {
  $('diffSvg').innerHTML = svg;
  $('pvOut').innerHTML = `<span class="tag" id="pvOutTag">SVG</span>` + svg;
}

// 7. 视图模式切换与卷帘交互
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
      diffBox.style.setProperty('--split', '50%');
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

// 8. 动画播放核心控制器
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

  // 设置时间轴与进度条参数
  const duration = isBeam ? 3.4 : anim.timing.total;
  const speed = Number($('animSpeed').value);
  const effectiveDuration = duration / speed;

  const stageWrap = $('stageWrap');
  stageWrap.style.setProperty('--total-duration', `${effectiveDuration}s`);
  stageWrap.style.setProperty('--play-state', 'running');

  // 触发重绘动画类
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

  log(`正在播放动效（图层: ${anim.layerCount} · 时长: ${effectiveDuration.toFixed(1)}s）`);
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

// 9. 导出与源码查看逻辑
function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
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
    log('正在通过离屏画布光栅化 PNG…', true);
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

  // 查看源码模态框
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

// 10. 入口装配
function bootstrap() {
  initRangeListeners();
  initUploadChannels();
  initViews();
  initAnimationControls();
  initExportHandlers();
}

window.addEventListener('DOMContentLoaded', bootstrap);