import { WebGPURenderer } from 'three/webgpu'

type RendererWithFallback = { _getFallback: (() => unknown) | null }

export async function createWebGPURenderer(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: true,
    // Omit powerPreference: on Windows Chromium currently ignores it and logs a warning (crbug.com/369219127).
    logarithmicDepthBuffer: true,
  })

  ;(renderer as unknown as RendererWithFallback)._getFallback = null

  await renderer.init()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  return renderer
}
