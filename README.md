# VectorPulse Studio — 让一幅画从虚无中长出来

> UNIT-01 // RASTER-TO-VECTOR SYNTHESIZER · 工业硬件风矢量合成器工作站
>
> 这里的成品不是一张 SVG，而是一段“作画过程”：起稿、铺色、收尾，每一层都有落笔顺序。
>
> 静态矢量只是附带结果，时间轴才是本体。
>
> 双击即用 · VTracer 本地算力 · GSAP 时间轴 + CSS 双引擎 · `file://` 可直接运行

![HTML5](https://img.shields.io/badge/HTML5-zero_build-orange)
![WASM](https://img.shields.io/badge/VTracer-WASM_local-00c853)
![GSAP](https://img.shields.io/badge/Engine-GSAP_%2B_CSS_fallback-ff3e00)
![Privacy](https://img.shields.io/badge/Core-100%25_local-success)

## ✨ 这是什么？

VectorPulse Studio 是一台“作画过程放映机”，不是格式转换器：

- 你给它一张位图，它先在本地算出矢量的图层结构；
- 然后按落笔顺序，把 **虚无 → 线稿速写 → 逐层上色 → 尘埃落定** 演一遍给你看；
- 笔尖走到哪里，画就长到哪里；scrub 拖到哪里，时间就回到哪里。

所以请这样理解它的流水线：

1. **注入原片**：PNG / JPG / WebP / BMP，拖放、点击、`Ctrl + V`、空舞台直注都行；
2. **本地解构**：VTracer WASM 在本机把像素解成按权重排序的 path 图层，图片不出本机；
3. **观看诞生**：`HAND-PAINT 手绘 / BLOOM 水彩 / CYBER-BEAM 极光` 三种落笔逻辑，配铅笔打底与笔尖跟随；
4. **带走过程**：一键导出独立动画 HTML，别人打开看到的也是同一场“诞生”，而不是一张死图。

`SVG / PNG / 静态 HTML / Data URI` 照样能导，但它们只是这场过程的定格截图。

它长这样：

- **WASM 双轨加载**：`http(s)` 用外置 `vtracer_bg.wasm` 极速启动，`file://` 自动懒加载 `vtracer-fallback.js`，双击照跑；
- **双播放引擎**：GSAP 时间轴（真暂停 / 变速 / scrub / 笔尖跟随）与 CSS 路径观感对齐，CDN 缺席自动切换；
- **工业硬件风三舱**：左 ENGINE 机架调参，中央舞台看画诞生，右 SEQ + I/O 编排时间与导出，桌面 `100dvh` 一屏；
- **`app.js`**：单一状态 + 视口自适应 + 描摹前等待 `VTracer.ready`，无构建，双击即演。

## 🚀 30 秒上手

```bash
git clone <your-repo-url>
cd VectorPulse
# 方式一：双击 index.html 直接打开（file:// 走 vtracer-fallback.js 懒加载，无需起服务）
# 方式二：本地预览（http 走外置 vtracer_bg.wasm，启动更快）
npx serve .
# 或
python -m http.server 8000
```

> 保持 `index.html / app.js / style.css / vtracer.js / vtracer_bg.wasm / vtracer-fallback.js` 同目录。`vtracer_bg.wasm` 可被浏览器缓存，`vtracer-fallback.js` 仅在 `file://` 或外置加载失败时按需载入，删掉它会导致双击打开无法描摹。

然后：

1. 把图片拖到顶部 `INJECT SOURCE BITMAP` 槽，或点中央 `AWAITING BITMAP` 空舞台，或 `Ctrl + V` 粘贴
2. 在左架 `MOD.01 Preset Deck` 选一个预设，描摹会自动开始
3. 先看 `Dual 并排` 的 RAW vs SVG，再切 `Split 卷帘` 拖 `↔` 手柄看边缘
4. 点 `▶ Trigger 动态绘制` 看画长出来（`Space` 暂停，有 GSAP 时直接拖 scrub 回到任意落笔点），满意再点 `🚀 动画 HTML` 把整段过程发给别人

> 大图会自动限边 `2048px` + 超采样，保证毫秒级转换不卡顿。描摹中 `body[data-state=busy]` 会锁定重复触发。

## 🧩 功能一览

### 1. 智能描摹（VTracer WASM 本地核心，双轨加载）

- 加载链：`index.html` 预加载 `vtracer_bg.wasm` → `vtracer.js` 启动时 `boot()`：`file://` 直走 fallback，`http(s)` 先 `instantiateStreaming(fetch)`，失败回退 `fetch ArrayBuffer`，再失败懒加载 `vtracer-fallback.js`（`window.__VTRACER_FALLBACK_BASE64`，用完即清空）
- 就绪信号：`window.VTracer.ready: Promise` + `window.VTRACER_WASM_READY` + `window.VTracer.initError`；`app.js:triggerTrace` 先 `await ready`（日志显示 `WASM LOADING...`），再调 `window.VTracer.convertPixels(rgba,w,h,cfg)` 直调
- 支持 `STACKED 叠层` / `CUTOUT 挖剪`，`SPLINE 样条` / `POLYGON 折线` / `PIXEL 像素`
- 可调：色彩精度、杂斑滤波、色阶跨度、超采样 1X / 2X / 4X
- 状态芯片实时显示：`PATHS 路径数 / SIZE 体积 / CYCLE 耗时 / ENG 当前引擎 / CANVAS 分辨率`
- 重算时自动 `GsapEngine.kill()` 废弃旧时间轴，避免写分离 DOM

### 2. 5 档硬件预设

| 预设 | 适合 | 描摹策略 | 动效默认 |
|---|---|---|---|
| BALANCED 标准插画平衡 | 通用插画 | stacked + spline, 颜色 7 | 手绘 36 层 |
| LOGO 极简纯平色块 | 图标、扁平 Logo | cutout + polygon, 颜色 4, 去斑 8 | 水彩 16 层 |
| ANIME 高精细度线面 | 动漫、绘本 | stacked + spline, 颜色 8 | 手绘 48 层 |
| PHOTO 摄影人像滤波 | 照片、人像 | stacked + spline, 颜色 5, 去斑 12 | 极光 24 层 |
| LINEART 钢笔硬速写 | 钢笔速写 | stacked + spline, 颜色 2 | 手绘 + 速写铺底 |

任何手动推子 / 下拉改动都会自动切入 `MANUAL 自定义参数`（`markCustom()`）。

### 3. 双引擎动效编排

右架 `MOD.03 Timeline Seq`：动效流派 / 步进层数 6~80 / 节拍时延 0.03~0.35s / 底层线稿速写 / **笔尖跟随** / `ENGINE:` 状态行。

| 风格 | 效果 | 原理 |
|---|---|---|
| `HAND-PAINT 手绘` | 铅笔稿打底 → 逐层 wipe / dab 上色 → settle 收尾 | 按 path `d` 长度加权分层，46 批素描 `stroke-dashoffset` |
| `BLOOM 水彩绽放` | blur + scale 绽开 | `bloom` 关键帧 + 随机方向 wipe |
| `CYBER-BEAM 极光` | 橙红光束扫过揭幕（工业风配色） | SVG `mask-image` + `glow` 叠加层，sketch 强制关闭 |

引擎二选一（`bootstrap()` 启动时探测）：

| | GSAP TIMELINE（主路径） | CSS FALLBACK（降级路径） |
|---|---|---|
| 触发条件 | `https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js` 加载成功 | 离线 / CDN 被拦 / 无 `window.gsap` |
| 标识 | `body[data-engine=gsap]`，`engineHint` 显示就绪，stats `ENG GSAP` | `body[data-engine=css]`，提示已降级，stats `ENG CSS` |
| 暂停 | `tween.pause()/play()` 真暂停 | `--play-state: paused/running` 冻结关键帧 |
| 变速 | `tween.timeScale()` 即时生效不重播 | 改速重播整条时间轴 |
| 进度 | `scrub` 滑块（0~1000）可拖拽 seek，按住跟手、松开按原状态恢复 | 静态 `progressBar` 单向填充 |
| 笔尖 | `penTip ✏` 跟随当前层绘制点（`getTotalLength/getPointAtLength/getBBox` + easeOutQuad） | 无笔尖 |
| 层动画 | `applyLayerFrame()` 逐帧写行内 `clip-path/opacity/filter/transform`，复刻 CSS 语义，`LAYER_DUR 0.55s` 对齐 | CSS `.pg` 关键帧 |

`renderAnimHosts()` 为双路径共用的 DOM 装配，保证预览与导出同构；`beam` 下只保留 `glow`。

### 4. 三种监视视图

- **Dual 并排（默认）**：`RAW` canvas vs `SVG` 并排，双轨等比适配
- **Split 卷帘**：拖 `↔` 滑块，原图 / 描摹无缝卷帘，带四角 `+` 取景框
- **Mono 矢量**：隐藏原图，只看 SVG 成品

视口引擎（`getViewportSize / computePreviewBox / paintCanvas / updatePreviewGeometry`）：

- 以 `stageViewport` 实测尺寸为基准，并排时 `(vw-12)/2`，等比缩放
- `requestAnimationFrame` + `80ms debounce` + `ResizeObserver`，窗口缩放不抖动
- 快捷键 `1 / 2 / 3` 切 Split / Dual / Mono，`setView()` 同步 `body[data-view]` + `aria-selected`

### 5. 五种 Master I/O 导出

右架 `MOD.04 Master I/O`：PNG 倍率 + 导出组。

| 按钮 | 产物 | 说明 |
|---|---|---|
| ⬇ SVG 矢量 | `vectorpulse-output.svg` | 含 `viewBox`，可进 Web / Figma / Ai |
| ⬇ PNG 位图 | `vectorpulse-{w}x{h}.png` | 离屏 canvas 重绘，1X / 2X RETINA / 4X PRINT |
| ⬇ 静态 HTML | `vectorpulse-static.html` | 工业风卡片 stage，纯展示用 |
| 🚀 动画 HTML | `vectorpulse-animated.html` | 独立单文件，CSS 关键帧 + 重播按钮 + 进度条（导出器不依赖 GSAP，永远可分享） |
| 📋 SVG 源码 | 弹窗 `SVG TELEMETRY` | 只读 textarea + 复制 SVG / 复制 `data:image/svg+xml;base64,...`，`Esc` 或点遮罩关闭 |

### 6. 工作站交互

- 空舞台即入口：`stageEmpty` 点击 / 回车 / 拖放直达文件选择器
- 播控条：`播放/暂停 (Space)` / `重播 (R)` / 进度或 scrub / 变速 `0.5X~2.0X` / `LOOP` 循环
- 快捷键（输入框内忽略）：`Space` 播放暂停，`R` 重算，`1/2/3` 视图，`Esc` 关弹窗
- 无障碍：`role=tablist/tab/dialog/status`，`aria-live` 日志，`:focus-visible` 橙框，`prefers-reduced-motion` 熄火

## 🖥️ 界面导览（工业硬件风）

```
topbar (48px): [LED] VectorPulse UNIT-01 // RASTER-TO-VECTOR SYNTHESIZER | CORE:VTRACER-WASM LOCAL CLK:60FPS
layout (三舱网格, 桌面 100dvh 一屏):
  rack-left ENGINE RACK:
    - MOD.01 Preset Deck (presetSelect)
    - MOD.02 Parameters (hier/mode/cp/fs/ld/upscale + Execute Retrace)
  rack-center 中央监视舞台 (点阵背景):
    - drop INJECT SOURCE BITMAP [拖放/点击/粘贴]
    - screen-hud: stats + view-tabs (Split/Dual/Mono)
    - stageViewport: penTip ✏ + diffBox卷帘 / sideWrap双轨
    - anim-bar: play/pause replay progress|scrub speed LOOP
    - stageEmpty AWAITING BITMAP ◈ (无图时) <-> stageWrap (有图时)
    - stage-foot: Trigger 动态绘制 + log
  rack-right MASTER BUS:
    - MOD.03 Timeline Seq (animStyle/layers/stagger/sketch/penFollow/engineHint)
    - MOD.04 Master I/O (pngscale + 5 导出)
modal: SVG TELEMETRY // 源码检修
```

主题令牌：米灰机箱 `#e7e4db` / 面板 `#f3f0e8` / 粗黑描边 `#141414` / 硬阴影 `4px 4px 0` / 工业橙 `#ff3e00` / 等宽遥测字体。

响应式：`≥1024px` 三舱一屏；`≤1023px` 转单列（舞台优先，机架变双列网格）；`≤640px` 单列，双轨改竖排。

## 📁 项目结构与架构

```
VectorPulse/
├── index.html            # 三舱骨架 + penTip + scrub + wasm preload + GSAP CDN + app.js
├── style.css             # 工业硬件风：令牌/机架/舞台/scrub/笔尖/双引擎开关/断点
├── app.js                # IIFE：工具/Store/预设/编排/视口/输入/描摹(等 ready)/视图/GSAP引擎/播放器/导出/弹窗/快捷键/启动
├── vtracer.js            # WASM 双轨 loader：外置 wasm 主路径 + fallback 懒加载，挂载 window.VTracer
├── vtracer_bg.wasm       # 外置主包（http 首选，668KB，`.gitattributes` 标 binary）
└── vtracer-fallback.js   # 生成文件勿改：file:// 备用 Base64 包，懒加载一次
```

零构建、无 `package.json`、无 ESM。`bootstrap()` 为唯一入口，做三件事：引擎探测 → 全部 `init*` 绑定 → `setView('side')`。

核心速查（`app.js`）：

- 状态：`Store(src/svg/view/busy/playing/paused)`，`BodyState.set()` 同步 `body[data-state]`
- 预设：`PRESETS`，`readParams/readAnimOpts`，`applyPreset/markCustom/initParams`
- 编排：`buildAnimationData`（按 `d` 长度加权分层 + 46 批素描 + `T0/end/out/settle/total`），`ensureViewBox`
- 视口：`getViewportSize/computePreviewBox/paintCanvas/updatePreviewGeometry/schedulePreviewResize`
- 输入：`processFile`（`createImageBitmap` + 超采样 + 2048 限边 + `bmp.close()`），`initUploadChannels`（drop+empty 双入口 + 粘贴）
- WASM 就绪：`vtracer.js:mountWasm/failWasm/boot/bootFromFallback/loadFallbackScript`，`app.js:triggerTrace` 等待 `VTracer.ready`（`WASM LOADING...`）
- 描摹：`triggerTrace`（kill 旧轴 → 等 ready → `convertPixels` → stats → `renderSvgToContainers`），`setExportEnabled`
- 视图：`setView/initViews`，默认 `side` 并排
- GSAP 引擎：`hasGsap/LAYER_DUR/applyLayerFrame/GsapEngine(build/frame/followPen/finish/replay/kill)`，`renderAnimHosts/gsapPlay`
- 播放器：`playAnimation`（有 GSAP 走 `gsapPlay` 否则 CSS），`togglePlay/setPlayIcon/stopTimer/initPlayer`（含 scrub 拖拽逻辑）
- 导出：`downloadBlob/buildStaticHtml/buildAnimatedHtml/initExporters`
- 其他：`initModal/initShortcuts/bootstrap`，`window.VectorPulse` 调试暴露

## ⚙️ 参数详解

描摹 `config`（透传 VTracer）：

| 参数 | UI | 含义 | 建议 |
|---|---|---|---|
| `hierarchical` | 图层拓扑 | `stacked` 叠加柔和，`cutout` 边缘干净 | 照片/插画 stacked，Logo cutout |
| `mode` | 拟合样条 | `spline` 平滑，`polygon` 硬朗，`pixel` 像素风 | Logo polygon，线稿/照片 spline |
| `colorPrecision` 1~10 | 色彩精度 | 颜色量化精度 | Logo 3~4，插画 7，动漫 8 |
| `filterSpeckle` 0~30 | 杂斑滤波 | 过滤小噪点面积 | 照片 10~12，干净稿 4~6 |
| `layerDifference` 2~64 | 色阶跨度 | 图层合并阈值 | 动漫 8~10，线稿 32~48 |
| `upscale` | 超采样 | 输入放大再描摹 | 小图标 4X，大照片 1X |

动效 `opts`：

| 参数 | 范围 | 说明 |
|---|---|---|
| `style` | paint / bloom / beam | 三种流派见上 |
| `layers` | 6~80 | path 按长度加权合并的播放组数 |
| `stagger` | 0.03~0.35s | 每层延迟，决定总时长 |
| `sketch` | bool | beam 下强制关闭，其他风格叠加铅笔稿 |
| `penFollow` | bool | 仅 GSAP 引擎有效，笔尖是否跟随（CSS 降级时隐藏） |

## 🔒 隐私与离线

- **描摹算力 100% 本地**：WASM 在本机实例化，图片不出本机。`http(s)` 下会 `fetch vtracer_bg.wasm`（同目录静态文件，非上传），`file://` 下不 fetch、直接懒加载本地 `vtracer-fallback.js`
- **要 file:// 双击可用**：别删 `vtracer-fallback.js`，`vtracer.js` 会在 `location.protocol === 'file:'` 时跳过 fetch 直走 fallback；F12 报 wasm http 错误时也会自动 fallback
- **可选 GSAP CDN**：`index.html` 引用 `jsdelivr gsap@3.12.5`。在线时获得 scrub / 真暂停 / 笔尖跟随；离线或被拦时自动切 CSS 路径，描摹 / 预览 / 导出不受影响
- **要纯离线**：删掉 GSAP 那一行 CDN `<script>` 即可恒走 CSS 路径；导出的动画 HTML 本身不依赖 GSAP，可放心分享
- 无统计、无后端、无字体外链。`*.wasm` 已在 `.gitattributes` 标 `binary`，避免换行符破坏二进制

## 🌐 兼容性

- 必需：`WebAssembly`（需 `WebAssembly.Module/Instance`，流式编译可选） + `createImageBitmap` + `Clipboard API`（复制功能）
- 推荐 Chrome / Edge 90+、Firefox 90+、Safari 15+（需 `ResizeObserver` + `container-type: size` + `mask-image`）
- WASM 服务：`http` 需以 `application/wasm` 提供 `vtracer_bg.wasm`（`npx serve / python http.server` 默认 OK），否则会自动走 `ArrayBuffer` / fallback；`index.html` 已加 `<link rel=preload as=fetch>` 提速
- `file://` 下 PNG 导出走 `Blob URL + Image`，若被拦截请改 `python -m http.server`
- GSAP 相关（scrub / 笔尖）需 CDN 可达 + 支持 `getTotalLength/getPointAtLength/getBBox`

## ❓ FAQ

**Q: 打开空白？**
确认 `index.html / app.js / style.css / vtracer.js / vtracer_bg.wasm / vtracer-fallback.js` 同目录。F12 看是 WASM 报错还是 GSAP 降级：`engineHint` 为 `CSS FALLBACK` 属正常离线降级，不影响描摹。

**Q: 一直 `WASM LOADING...` / `WASM loader missing` / `WASM not ready`？**
`vtracer.js` 还没 `mountWasm`。排查顺序：同目录是否有 `vtracer_bg.wasm` → 控制台是否有 `WASM init failed`（`initError`）→ `http` 是否返回 wasm MIME → `file://` 是否误删 `vtracer-fallback.js`。`vtracer-fallback.js` 头部注明 generated，勿手改。

**Q: `vtracer-fallback.js` / `vtracer_bg.wasm` 能删一个吗？**
不建议。`wasm` 是 http 主路径（快、可缓存），`fallback.js` 是 `file://` 双击打开的生命线。只要两个都在，双轨自动选择，你不用管。

**Q: scrub 拖不动 / 笔尖不显示？**
先看 stats `ENG` 芯片：`GSAP` 才有 scrub + 笔尖；`CSS` 只有进度条。检查网络能否访问 jsdelivr，或是否勾选了 `笔尖跟随`。

**Q: 变速后从头重播？**
CSS 引擎会重播，GSAP 引擎是 `timeScale` 即时变速不重播，这是区分两者的最快方法。

**Q: 为什么默认是并排而不是卷帘？**
并排适合一眼看清“原片 vs 诞生结果”，卷帘适合逐像素检查边缘。按 `1` 键即回卷帘。

**Q: 描摹太慢 / 文件巨大？**
降色彩精度、升杂斑滤波、超采样改 1X，或换 LOGO 预设。看 `PATHS / SIZE / CYCLE` 芯片调参。

**Q: 导出的动画 HTML 没动？**
打开后自动播一次，点 `RESTART 重新发生` 即可。导出器是纯 CSS 方案，与 studio 是否用 GSAP 无关。

**Q: SVG 进 Figma / Ai 异常？**
用源码弹窗检查超大 path，换 `CUTOUT + POLYGON` 重描，兼容性最好。

## 🗺️ Roadmap

- [ ] 自定义调色板锁定 / 背景抠除
- [ ] SVG 路径简化滑块（体积优化）
- [ ] 导出 Lottie / SMIL
- [ ] 批量队列转换
- [ ] PWA 离线安装包（含 GSAP 本地化，彻底零网络）

## 🤝 贡献

1. Fork 本仓库（注意 `*.wasm` 为 binary，diff 不可读属正常）
2. `git checkout -b feat/xxx`
3. 双击 `index.html`（测 `file://` fallback）+ `python -m http.server`（测外置 wasm + GSAP）双自测：注入 → 描摹 → 播放（在线测 GSAP，断网测 CSS 降级）→ 五种导出
4. 提交 PR，附前后对比截图 + 预设参数 + `PATHS/SIZE/CYCLE/ENG`

## 📄 License

 MIT

## 🙏 致谢

- [VTracer](https://github.com/visioncortex/VTracer) — Rust 位图转矢量核心，本项目 WASM 离线化封装
- [GSAP](https://gsap.com/) — 可选时间轴引擎（CDN），缺席时自动降级
- 灵感：手绘延时摄影、水彩晕染、工业硬件机箱

---

如果这个小工坊对你有用，点个 ⭐ 就是最大的支持。祝每一张位图，都能被看见诞生。
