import * as THREE from 'three'

const PLAYGROUND_DIRECTIONALS: ReadonlyArray<[number, number, number, number]> = [
  [0.85, 1.35, 0.35, 1.9],
  [-0.35, 0.8, 0.9, 0.46],
  [0.25, 0.55, -1, 0.22],
]

function createSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 1024
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas)
    fallback.colorSpace = THREE.SRGBColorSpace
    return fallback
  }

  const skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
  skyGradient.addColorStop(0, '#5ea8ff')
  skyGradient.addColorStop(0.32, '#88c6ff')
  skyGradient.addColorStop(0.62, '#bfe1ff')
  skyGradient.addColorStop(1, '#e9f4ff')
  ctx.fillStyle = skyGradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const sunX = canvas.width * 0.78
  const sunY = canvas.height * 0.22
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, canvas.width * 0.12)
  sunGlow.addColorStop(0, 'rgba(255, 250, 220, 0.98)')
  sunGlow.addColorStop(0.12, 'rgba(255, 239, 182, 0.96)')
  sunGlow.addColorStop(0.35, 'rgba(255, 231, 166, 0.46)')
  sunGlow.addColorStop(1, 'rgba(255, 231, 166, 0)')
  ctx.fillStyle = sunGlow
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let layer = 0; layer < 3; layer++) {
    const count = layer === 0 ? 18 : layer === 1 ? 14 : 9
    for (let i = 0; i < count; i++) {
      const x = Math.random() * canvas.width
      const y = canvas.height * (0.08 + Math.random() * 0.34) + layer * 18
      const width = 180 + Math.random() * 360
      const height = 42 + Math.random() * 68
      const alpha = 0.08 + Math.random() * 0.18 - layer * 0.025
      const cloud = ctx.createRadialGradient(x, y, width * 0.08, x, y, width * 0.6)
      cloud.addColorStop(0, `rgba(255,255,255,${alpha})`)
      cloud.addColorStop(0.65, `rgba(255,255,255,${alpha * 0.68})`)
      cloud.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = cloud
      ctx.beginPath()
      ctx.ellipse(x, y, width, height, Math.random() * 0.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const horizonGlow = ctx.createLinearGradient(0, canvas.height * 0.62, 0, canvas.height)
  horizonGlow.addColorStop(0, 'rgba(255,255,255,0)')
  horizonGlow.addColorStop(1, 'rgba(255,245,228,0.35)')
  ctx.fillStyle = horizonGlow
  ctx.fillRect(0, canvas.height * 0.62, canvas.width, canvas.height * 0.38)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.mapping = THREE.EquirectangularReflectionMapping
  return texture
}

export function applyPlaygroundAtmosphere(scene: THREE.Scene): void {
  scene.background = createSkyTexture()
  scene.fog = new THREE.Fog('#d2e6f8', 130, 270)
}

export function addPlaygroundLighting(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight('#f6efde', 1.08))
  scene.add(new THREE.HemisphereLight('#a8d7ff', '#a4865d', 1.34))

  for (const [x, y, z, intensity] of PLAYGROUND_DIRECTIONALS) {
    const light = new THREE.DirectionalLight('#fff1c4', intensity)
    light.position.set(x, y, z).normalize().multiplyScalar(28)
    scene.add(light)
  }
}
