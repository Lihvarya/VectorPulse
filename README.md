# VectorPulse Studio — 智能图片转 SVG & 动态矢量工坊

> 光迹矢量工坊 · 离线图片转 SVG 与手绘动态生成
>
> 把 PNG / JPG / WebP / BMP 一键描摹为可缩放矢量，并生成手绘涂装 / 水彩绽放 / 极光扫描动画，可导出为 SVG / PNG / 独立 HTML。

![License](https://img.shields.io/badge/license-MIT-green)
![VTracer](https://img.shields.io/badge/core-VTracer%20WASM-00e5a3)
![No Build](https://img.shields.io/badge/frontend-No%20Build%20%E7%BA%AF%E5%89%8D%E7%AB%AF-blue)
![Privacy](https://img.shields.io/badge/privacy-100%25%20%E6%9C%AC%E5%9C%B0%E8%BF%90%E7%AE%97-orange)

## ✨ 功能特性

**🎯 矢量化描摹（VTracer WASM Core）**

- 浏览器本地运算，无需后端、不上传图片，保护隐私
- 可调参数：图层结构（`stacked` / `cutout`）、拟合曲线（`spline` / `polygon` / `none`）、颜色丰富度、杂斑过滤、色阶跨度、超采样倍率（1× / 2× / 4×）
- 转换数据看板：路径段数、SVG 体积、渲染耗时、工作分辨率

**⚙️ 5 种快速预设，开箱即用**

| 预设 | 适用场景 | 描摹策略 | 动效风格 |
|------|----------|----------|----------|
| ⚖️ 默认平衡 | 通用插画 | stacked + spline，高保真 | 手绘涂装 |
| 📐 极简图标 / Logo | 图标、Logo | cutout + polygon，平整色块 | 水彩绽放 |
| 🎨 高保真动漫 / 绘本 | 动漫、绘本 | 高颜色丰富度、低过滤 | 手绘涂装 |
| 📷 摄影人像 | 照片、人像 | 平滑噪点、低超采样 | 极光扫描 |
| ✒️ 黑白线稿 / 钢笔速写 | 线稿、速写 | 低颜色数、大色阶跨度 | 手绘涂装 |

手动拖动任何滑块即自动切换为 `自定义参数`。

**🎬 3 种动效风格**

- `paint` 手绘涂装：铅笔稿铺底 + 逐层上色（wipe / dab 混合笔触）
- `bloom` 水彩层叠绽放（Watercolor）：模糊 + 缩放淡入
- `beam` 极光扫描揭幕（Cyber Beam）：斜向光束 mask 揭幕 + glow / shine 装饰层

可调：动画层数（6–80）、图层节拍（0.03–0.35s）、铅笔素描铺底开关、播放速度（0.5×–2×）、循环播放。

**👀 3 种预览视图**

- 对比卷帘视图：拖动滑块左右对比原图 / SVG
- 左右并排视图：原图与 SVG 并列对照
- 单屏渲染视图：专注查看 SVG 结果

**📤 5 种导出方式**

| 按钮 | 输出 |
|------|------|
| 导出标准 SVG | `.svg` 矢量源文件 |
| 导出高清 PNG | 1× / 2× Retina / 4× 印刷级光栅化 |
| 导出静态单页 HTML | 自包含静态展示页 |
| 导出独立动画 HTML | 自包含、可重播的动画页（含播控条，无外部依赖） |
| 查看 SVG 源码 | 弹窗查看 / 复制 SVG 代码 / 复制 Base64 Data URI |

**📥 3 通道上传**

- 点击选择文件、拖拽到上传区、`Ctrl + V` 直接粘贴剪贴板截图

## 🛠️ 技术栈

- 纯前端三件套，无构建步骤：`index.html` + `css/style.css` + `js/*.js`（ES Module）
- 矢量化核心：[`vtracer-wasm@0.1.0`](https://cdn.jsdelivr.net/npm/vtracer-wasm@0.1.0/vtracer_wasm.js)（CDN 加载 WASM，失败时降级 `window.VTracer`）
- 动效：CSS `clip-path` / `mask-image` / `stroke-dasharray` 关键帧 + JS 按路径权重分层编排

## 📁 项目结构

```
VectorPulse/
├── index.html      # 主界面：预设 / 参数 / 动效 / 导出 / 预览舞台
├── css/
│   └── style.css   # 暗色主题 + 卷帘对比 + 播控条 + 三种动效关键帧
├── js/
│   ├── app.js      # 交互驱动：上传 / 描摹 / 预览 / 播放 / 导出
│   ├── engine.js   # VTracer WASM 初始化与 traceImage 封装
│   └── animator.js # 动画分层、viewBox 补全、静态/动画 HTML 生成器
└── LICENSE         # MIT
```

## 🚀 快速开始

需要一个静态 HTTP 服务（ES Module + WASM 不支持 `file://` 直接打开），任选其一：

```bash
# 方式 1：Python（推荐）
git clone https://github.com/Lihvarya/VectorPulse.git
cd VectorPulse
python -m http.server 8080

# 方式 2：Node
npx serve .

# 方式 3：VS Code Live Server 插件
# 右键 index.html -> Open with Live Server
```

然后浏览器打开 `http://localhost:8080`。

> 首次描摹需要联网从 jsDelivr 加载 `vtracer-wasm`；加载完成后图片处理全在本地。超大图会自动限制工作边长 ≤ 2048px 以防爆内存。

## 📖 使用流程

1. 打开页面，拖入图片 / 点击选择 / `Ctrl+V` 粘贴截图
2. 选择顶部预设（推荐新手直接用预设），或微调描摹精细度
3. 拖动卷帘滑块对比原图与 SVG，或切换并排 / 单屏视图
4. 选择动效风格、层数、节拍，点击 `▶ 播放动画` 预览（含暂停 / 重播 / 变速 / 循环）
5. 点击右侧导出：SVG / PNG / 静态 HTML / 动画 HTML / 源码复制

## 🌐 兼容性

- 需要支持 `createImageBitmap`、`Canvas 2D`、`ES Module`、`CSS clip-path / mask-image` 的现代浏览器
- 推荐最新版 Chrome / Edge / Firefox / Safari

## 🔒 隐私说明

- 图片仅在浏览器内存中处理，不上传到任何服务器
- 唯一的网络请求是首次加载 VTracer WASM（jsDelivr CDN）

## 📄 License

MIT © 2026 Lihvarya，详见 [LICENSE](./LICENSE)。
