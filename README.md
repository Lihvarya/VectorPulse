# VectorPulse Studio — 智能图片转 SVG & 动态矢量工坊

> 光迹矢量工坊 · 把位图变成可缩放、可播放、可分享的矢量故事。
>
> 免环境 · 双击即用 · 全离线 · 无需上传 · `file://` 可直接运行

![HTML5](https://img.shields.io/badge/HTML5-single_file_app-orange)
![WASM](https://img.shields.io/badge/VTracer-WASM_offline-00e5a3)
![No Build](https://img.shields.io/badge/0_%E4%BE%9D%E8%B5%96-0_%E6%9E%84%E5%BB%BA-blue)
![Privacy](https://img.shields.io/badge/Privacy-100%25_local-success)

## ✨ 这是什么？

VectorPulse Studio 是一个纯前端单页应用：

1. **拖入一张 PNG / JPG / WebP / BMP**（或直接 `Ctrl + V` 粘贴截图）
2. 本地用 **VTracer WASM** 秒级描摹为 **SVG**
3. 卷帘对比 / 并排 / 纯净三种视图实时预览
4. 一键生成 **手绘涂装 / 水彩绽放 / 极光扫描** 三种过程动画
5. 导出 **SVG / 高清 PNG / 静态 HTML / 独立动画 HTML / Data URI**

全程浏览器本地运算，图片不出本机，断网可用。

## 🚀 30 秒上手

```bash
git clone <your-repo-url>
cd VectorPulse
# 方式一：双击 index.html 直接打开（已处理 file:// CORS，无需起服务）
# 方式二：本地预览
npx serve .
# 或
python -m http.server 8000
```

然后：

1. 把图片拖到顶部虚线框，或点击选择，或 `Ctrl + V` 粘贴
2. 新手直接选左侧 `快速预设配置`，会自动描摹
3. 拖动中间卷帘滑块对比 原图 vs SVG
4. 点 `▶ 播放动效` 预览，再点 `🚀 导出独立动画 HTML` 分享

> 大图会自动限边 `2048px` + 超采样，保证毫秒级转换不卡顿。

## 🧩 功能一览

### 1. 智能描摹（VTracer WASM 离线核心）
- `vtracer.js` 内嵌 WASM Base64，通过原生 `<script>` 加载，无额外请求
- 支持 `stacked 叠层` / `cutout 挖剪`，`spline 样条` / `polygon 折线` / `none 硬边`
- 可调：颜色丰富度、杂斑过滤、色阶跨度、超采样 1×/2×/4×
- 状态芯片实时显示：路径数 / SVG 体积 / 耗时 / 分辨率

### 2. 5 档开箱预设

| 预设 | 适合 | 描摹策略 | 动效默认 |
|---|---|---|---|
| ⚖️ 默认平衡 | 通用插画 | stacked + spline, 颜色 7 | 手绘涂装 36 层 |
| 📐 极简图标 / Logo | 图标、扁平 Logo | cutout + polygon, 颜色 4, 去斑 8 | 水彩绽放 16 层 |
| 🎨 高保真动漫 / 绘本 | 动漫、绘本 | stacked + spline, 颜色 8 | 手绘涂装 48 层 |
| 📷 摄影人像 | 照片、人像 | stacked + spline, 颜色 5, 去斑 12 | 极光扫描 24 层 |
| ✒️ 黑白线稿 | 钢笔速写 | stacked + spline, 颜色 2 | 手绘涂装 + 素描铺底 |

任何手动拖动滑块都会自动切到 `⚙️ 自定义参数`。

### 3. 三种动效编排

| 风格 | 效果 | 原理 |
|---|---|---|
| `paint 手绘涂装` | 铅笔稿打底 → 逐层 wipe / dab 上色 → settle 收尾 | 按 path `d` 长度加权分层，46 批素描 `stroke-dashoffset` 动画 |
| `bloom 水彩层叠绽放` | blur + scale 绽开 | `bloom` 关键帧 + 随机方向 wipe |
| `beam 极光扫描揭幕` | Cyber 青绿光束扫过揭幕 + 高光 shine | SVG `mask-image` + `glow / shine` 叠加层 |

可调：动画层数 6~80、图层节拍 0.03s~0.35s、铅笔素描开关、0.5x~2.0x 变速、循环、暂停/重播、进度条。

### 4. 三种预览视图
- **对比卷帘视图**：拖动 `↔` 滑块，原图 / SVG 无缝卷帘
- **左右并排视图**：原图 canvas vs SVG 并排
- **单屏纯净视图**：只看 SVG 成品

### 5. 五种导出

| 按钮 | 产物 | 说明 |
|---|---|---|
| ⬇ 导出标准 SVG | `vectorpulse-output.svg` | 含 `viewBox`，可直接用于 Web / Figma / Ai |
| ⬇ 导出高清 PNG | `vectorpulse-{w}x{h}.png` | 离屏 canvas 重绘，1× / 2× Retina / 4× 印刷 |
| ⬇ 导出静态单页 HTML | `vectorpulse-static.html` | 居中自适应 stage，纯展示用 |
| 🚀 导出独立动画 HTML | `vectorpulse-animated.html` | 自带重播按钮 + 进度条，单文件可分享 / 部署 |
| 📋 查看 SVG 源码 | 弹窗 + 复制 | 一键复制 SVG 代码 / `data:image/svg+xml;base64,...` Data URI |

## 🖥️ 界面导览

```
header: VectorPulse Studio + [VTracer WASM 离线核心] [免环境·双击即用]
layout:
  aside (310px):
    - 快速预设配置
    - 描摹精细度 (hier/mode/cp/fs/ld/upscale)
    - 动效编排 (animStyle/layers/stagger/sketch)
    - 导出格式 (pngscale + 5 导出按钮)
  main:
    - drop 上传区 (点击/拖拽/Ctrl+V)
    - stats 状态芯片
    - view-tabs 视图切换
    - stage-wrapper (diffBox卷帘 / sideWrap并排 / anim播控条)
    - retrace / replay
    - log 日志
```

响应式：`<960px` 自动上下堆叠，侧栏下沉。

## 📁 项目结构

```
VectorPulse/
├── index.html  # UI 骨架：预设/参数/动效/导出/舞台/弹窗
├── style.css   # 暗色矢量工坊主题 + 全部关键帧 (wipe/bloom/beam/draw/settle)
├── app.js      # 核心流水线：上传→描摹→分层→播放→导出
└── vtracer.js  # VTracer WASM 离线容器，挂载 window.VTracer
```

零依赖、零构建、无 `package.json`、无打包器。`app.js:bootstrap` 为唯一入口。

核心函数速查：

- `app.js:18 PRESETS` 预设表
- `app.js:28 buildAnimationData` 按权重分层 + 素描批处理 + 时间轴计算
- `app.js:196 processFile` 解码 + 超采样 + 2048 限边
- `app.js:286 triggerTrace` `VTracer.convertPixels(rgba,w,h,config)` 调用
- `app.js:368 playAnimation` 预览播放
- `app.js:502 buildAnimatedHtml` 独立动画文件生成器
- `app.js:472 buildStaticHtml` 静态文件生成器

## ⚙️ 参数详解

描摹 `config`（透传 VTracer）：

| 参数 | UI | 含义 | 建议 |
|---|---|---|---|
| `hierarchical` | 图层结构 | `stacked` 色彩叠加更柔和，`cutout` 边缘更干净 | 照片/插画用 stacked，Logo 用 cutout |
| `mode` | 拟合曲线 | `spline` 平滑，`polygon` 硬朗，`none` 像素风 | Logo 用 polygon，线稿/照片用 spline |
| `colorPrecision` 1~10 | 颜色丰富度 | 颜色量化精度 | Logo 3~4，插画 7，动漫 8 |
| `filterSpeckle` 0~30 | 杂斑过滤 | 过滤小噪点面积 | 照片 10~12，干净线稿 4~6 |
| `layerDifference` 2~64 | 色阶跨度 | 图层合并阈值 | 动漫 8~10，线稿 32~48 |
| `upscale` | 超采样 | 输入放大再描摹，边缘更顺 | 小图标用 4×，大照片用 1× |

动效 `opts`：

| 参数 | 范围 | 说明 |
|---|---|---|
| `style` | paint / bloom / beam | 三种风格见上 |
| `layers` | 6~80 | SVG path 按长度加权合并成的播放组数 |
| `stagger` | 0.03~0.35s | 每层延迟，决定总时长 |
| `sketch` | bool | beam 下强制关闭，其他风格叠加铅笔稿 |

## 🔒 隐私与离线

- 无 CDN、无字体外链、无统计、无后端请求
- `vtracer.js:8 WASM_BYTES_BASE64` 本地实例化 `WebAssembly.Module`
- `file://` 直接打开可用，原因：不用 `fetch` / `import`，只用同步 `<script src="vtracer.js">` + `<script src="app.js">`

## 🌐 兼容性

- 需要 `WebAssembly` + `createImageBitmap` + `Clipboard API`（复制功能）
- 推荐 Chrome / Edge 90+、Firefox 90+、Safari 15+
- `file://` 下 PNG 导出走 `Blob URL + Image`，若浏览器拦截请改用本地 http 服务

## ❓ FAQ

**Q: 打开空白？**
检查是否直接双击 `index.html` 且 `vtracer.js / app.js / style.css` 在同目录。F12 看 Console 是否有 WASM 初始化报错。

**Q: 描摹太慢 / 文件巨大？**
降 `颜色丰富度`、升 `杂斑过滤`、超采样改 1×，或换 `logo` 预设。路径数和 KB 会显示在状态芯片上。

**Q: 导出的动画 HTML 没动？**
打开后会自动播一次，点 `重播动画` 即可。需要自动循环请在 Studio 里勾选循环后再看预览（导出文件为单次播放 + 手动重播设计，方便嵌入）。

**Q: SVG 导入 Figma / Ai 异常？**
先用 `查看 SVG 源码` 检查是否含超大 path，尝试 `cutout + polygon` 预设重新描摹，兼容性最好。

## 🗺️ Roadmap

- [ ] 自定义调色板锁定 / 背景抠除
- [ ] SVG 路径简化滑块（体积优化）
- [ ] 导出 Lottie / SMIL
- [ ] 批量队列转换
- [ ] PWA 离线安装包

欢迎提 Issue / PR，一起把矢量玩出脉冲感。

## 🤝 贡献

1. Fork 本仓库
2. `git checkout -b feat/xxx`
3. 改完双击 `index.html` 自测：上传 → 描摹 → 播放 → 四种导出
4. 提交 PR，附前后对比截图 + 参数 + 耗时/体积

## 📄 License

建议 MIT（待补充 `LICENSE`）。VTracer WASM 部分遵循其上游开源协议，商用前请确认原项目授权。

## 🙏 致谢

- [VTracer](https://github.com/visioncortex/VTracer) — 高性能 Rust 位图转矢量核心，本项目 WASM 离线化封装
- 灵感：手绘延时摄影、水彩晕染、Cyberpunk 扫描线

---

如果这个小工坊对你有用，点个 ⭐ 就是最大的支持。祝每一张位图，都能找到它的矢量心跳。
