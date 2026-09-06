/**
 * VectorPulse Studio - VTracer 矢量化核心集成
 * 支持优先加载本地 wasm，或自动降级至公共 CDN
 */

let wasmInstance = null;
let isInitializing = false;
let initPromise = null;

export async function initVTracer() {
  if (wasmInstance) return wasmInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // 优先从 CDN 导入官方预编译 ESM 胶水层
      const vtracerModule = await import('https://cdn.jsdelivr.net/npm/vtracer-wasm@0.1.0/vtracer_wasm.js');
      await vtracerModule.default();
      wasmInstance = vtracerModule;
      return wasmInstance;
    } catch (err) {
      console.warn('CDN 加载失败，尝试全局 Window.VTracer 实例', err);
      if (window.VTracer) {
        wasmInstance = window.VTracer;
        return wasmInstance;
      }
      throw new Error('未能初始化 VTracer WebAssembly 模块，请检查网络或本地资源。');
    }
  })();

  return initPromise;
}

/**
 * 执行位图描摹转换
 * @param {Uint8ClampedArray} rgba 图像像素数据
 * @param {number} width 图像宽
 * @param {number} height 图像高
 * @param {Object} options 描摹参数
 */
export async function traceImage(rgba, width, height, options) {
  const vtracer = await initVTracer();
  
  // 转换参数映射
  const config = {
    mode: options.mode || 'spline',
    hierarchical: options.hierarchical || 'stacked',
    colorPrecision: Number(options.colorPrecision ?? 7),
    filterSpeckle: Number(options.filterSpeckle ?? 4),
    layerDifference: Number(options.layerDifference ?? 16),
    pathPrecision: 2,
  };

  const convertFn = vtracer.convertPixels || vtracer.vectorize_rgba;
  if (!convertFn) {
    throw new Error('未找到合适的 VTracer 转换函数');
  }

  return convertFn(rgba, width, height, config);
}