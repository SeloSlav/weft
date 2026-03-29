import type { GLProps } from '@react-three/fiber'
import { WebGPURenderer } from 'three/webgpu'

function webgpuPowerPreference(
  pref: WebGLPowerPreference | undefined,
): GPURequestAdapterOptions['powerPreference'] {
  if (pref === 'low-power') return 'low-power'
  return 'high-performance'
}

/**
 * React Three Fiber `gl` prop: builds a {@link WebGPURenderer}, awaits {@link WebGPURenderer.init},
 * and disables Three.js’s built-in WebGL2 fallback so the app targets WebGPU only.
 */
export const createWebGPUGl: GLProps = async (defaultProps) => {
  const renderer = new WebGPURenderer({
    canvas: defaultProps.canvas as HTMLCanvasElement,
    antialias: defaultProps.antialias ?? true,
    alpha: defaultProps.alpha ?? true,
    powerPreference: webgpuPowerPreference(defaultProps.powerPreference),
    logarithmicDepthBuffer: true,
  })
  type RendererWithFallback = { _getFallback: (() => unknown) | null }
  ;(renderer as unknown as RendererWithFallback)._getFallback = null
  await renderer.init()
  return renderer
}
