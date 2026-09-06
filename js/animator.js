/**
 * VectorPulse Studio - 动效渲染管线与代码生成器
 */

/**
 * 分解 SVG 并编排动画关键帧数据
 */
export function buildAnimationData(svgText, opts) {
  const paths = svgText.match(/<path\b.*?\/>/gs) || [];
  const weights = paths.map(p => (p.match(/d="([^"]*)"/) || ['', ''])[1].length);
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

  // 动效风格形态类映射
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

/**
 * 确保 SVG 具备完整标准的 viewBox 属性
 */
export function ensureViewBox(svgText, w, h) {
  if (/viewBox=/i.test(svgText)) return svgText;
  return svgText.replace('<svg ', `<svg viewBox="0 0 ${w} ${h}" `);
}

/**
 * 生成独立的静态单页 HTML
 */
export function buildStaticHtml(svgText, w, h) {
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

/**
 * 生成独立的带精美播控条的动画 HTML
 */
export function buildAnimatedHtml(svgText, w, h, opts) {
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