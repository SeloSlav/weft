import { seedCursor } from '../weft/core'
import {
  createBookPageEffect,
  createBookPageSurface,
  DEFAULT_BOOK_PAGE_PARAMS,
  type BookPageEffect,
} from '../weft/three'
import { createWebGPURenderer } from '../createWebGPURenderer'
import { Timer } from 'three'
import * as THREE from 'three'
import {
  DEFAULT_FLIGHT_CONFIG,
  FlightController,
  type FlightBounds,
  type FlightControllerConfig,
  type FlightInput,
} from './flightController'
import { MOBY_DICK_CHAPTER_1_PAGES } from './mobyDickChapter1'
import { PlayerActor } from '../playground/thirdPersonController'
import { PLAYGROUND_SPAWN, PLAYGROUND_ZOOM } from '../playground/playgroundWorld'

const PAGE_WIDTH = 11
const PAGE_HEIGHT = 15
const PAGE_RING_RADIUS = 42
const PAGE_CENTER_Y = 3.2

const DEMO_BOUNDS: FlightBounds = {
  minX: -90,
  maxX: 90,
  minY: 0.4,
  maxY: 32,
  minZ: -90,
  maxZ: 90,
}

function createTextSprite(label: string, color: string, width = 512, height = 128): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = '700 56px "Baskerville", "Palatino Linotype", Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
    ctx.shadowBlur = 8
    ctx.fillText(label, canvas.width * 0.5, canvas.height * 0.5)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
  return new THREE.Sprite(material)
}

function createPageNumberSprite(pageNumber: number): THREE.Sprite {
  const sprite = createTextSprite(`Page ${pageNumber}`, '#8d3e32')
  sprite.scale.set(5.2, 1.3, 1)
  sprite.position.set(0, PAGE_HEIGHT + 0.8, 0.15)
  return sprite
}

function createPageArrowSprite(label: '◀' | '▶', direction: -1 | 1): THREE.Sprite {
  const sprite = createTextSprite(label, '#8d3e32', 256, 128)
  sprite.scale.set(1.2, 1.2, 1)
  sprite.userData.turnDirection = direction
  return sprite
}

function disposeSprite(sprite: THREE.Sprite): void {
  const material = sprite.material
  material.map?.dispose()
  material.dispose()
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length
}

function dampAngle(current: number, target: number, factor: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + delta * factor
}

export class DemoRuntime {
  private readonly host: HTMLElement
  private readonly canvas = document.createElement('canvas')
  private readonly timer = new Timer()
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.15, 520)
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointerNdc = new THREE.Vector2()
  private readonly pageRoot = new THREE.Group()
  private readonly playerInfluencePoint = new THREE.Vector3()

  private readonly flight = new FlightController()
  private readonly player = new PlayerActor()
  private readonly flightConfig: FlightControllerConfig = { ...DEFAULT_FLIGHT_CONFIG }
  /** Same zoom band as the Playground (`PLAYGROUND_ZOOM`). */
  private zoomDistance = PLAYGROUND_ZOOM.current

  private readonly inputState: FlightInput = {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    moveUp: false,
    moveDown: false,
    sprint: false,
    lookActive: false,
    lookDeltaX: 0,
    lookDeltaY: 0,
  }

  private readonly frameInput: FlightInput = { ...this.inputState }

  private readonly bookPages: BookPageEffect[] = []
  private readonly pageArrowTargets: THREE.Sprite[] = []
  private pageCount = 0
  private pageStepAngle = 0
  private ringRotationCurrent = 0
  private ringRotationTarget = 0
  private currentFrontPageIndex = 0

  private renderer: Awaited<ReturnType<typeof createWebGPURenderer>> | null = null
  private resizeObserver: ResizeObserver | null = null
  private rafId = 0
  private disposed = false
  private lastElapsed = 0

  constructor(host: HTMLElement) {
    this.host = host
    this.canvas.className = 'canvas'
    this.canvas.tabIndex = 0

    this.scene.fog = new THREE.FogExp2('#f1e7d6', 0.012)
    this.scene.background = new THREE.Color('#f6edde')
    const hemi = new THREE.HemisphereLight('#fff9ef', '#d9c7ad', 1.05)
    this.scene.add(hemi)
    const dir = new THREE.DirectionalLight('#fff7ea', 1.35)
    dir.position.set(10, 24, 8)
    this.scene.add(dir)
    const fill = new THREE.PointLight('#edd7b2', 0.42, 110, 2)
    fill.position.set(-8, 12, -6)
    this.scene.add(fill)
    this.scene.add(this.pageRoot)

    const n = MOBY_DICK_CHAPTER_1_PAGES.length
    this.pageCount = n
    this.pageStepAngle = n > 0 ? (Math.PI * 2) / n : 0
    const ringRadius = Math.max(
      PAGE_RING_RADIUS,
      (n * (PAGE_WIDTH + 1.6)) / (Math.PI * 2),
    )
    for (let i = 0; i < n; i++) {
      const text = MOBY_DICK_CHAPTER_1_PAGES[i]!
      const surface = createBookPageSurface(`moby-ch1-p${i}`, text)
      const page = createBookPageEffect({
        surface,
        seedCursor,
        wallWidth: PAGE_WIDTH,
        wallHeight: PAGE_HEIGHT,
        initialParams: { ...DEFAULT_BOOK_PAGE_PARAMS },
      })
      // Page 1 starts straight ahead; higher page numbers proceed clockwise, so page 2 is to the right.
      const angle = Math.PI - (i / n) * Math.PI * 2
      const x = Math.sin(angle) * ringRadius
      const z = Math.cos(angle) * ringRadius
      page.group.position.set(x, PAGE_CENTER_Y, z)
      page.group.lookAt(0, PAGE_CENTER_Y, 0)
      page.group.add(createPageNumberSprite(i + 1))
      const leftArrow = createPageArrowSprite('◀', -1)
      leftArrow.position.set(-3.6, PAGE_HEIGHT + 0.8, 0.15)
      page.group.add(leftArrow)
      this.pageArrowTargets.push(leftArrow)
      const rightArrow = createPageArrowSprite('▶', 1)
      rightArrow.position.set(3.6, PAGE_HEIGHT + 0.8, 0.15)
      page.group.add(rightArrow)
      this.pageArrowTargets.push(rightArrow)
      this.pageRoot.add(page.group)
      this.bookPages.push(page)
    }

    this.scene.add(this.player.group)
    this.player.setReticleVisible(false)

    this.camera.position.set(0, 4, 14)

    this.flight.setSpawn(
      new THREE.Vector3(PLAYGROUND_SPAWN.x * 0.15, 3.2, PLAYGROUND_SPAWN.z * 0.12),
      PLAYGROUND_SPAWN.yaw,
      PLAYGROUND_SPAWN.yaw,
      PLAYGROUND_SPAWN.pitch,
    )
  }

  async initialize(): Promise<void> {
    this.host.appendChild(this.canvas)
    this.renderer = await createWebGPURenderer(this.canvas)
    if (this.disposed) {
      this.renderer.dispose()
      return
    }
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05

    this.resize()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.host)

    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('click', this.handleClick)
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel)
    this.canvas.addEventListener('lostpointercapture', this.handleLostPointerCapture)
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false })
    this.canvas.addEventListener('contextmenu', this.handleContextMenu)
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('blur', this.handleWindowBlur)

    this.frame()
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.rafId)
    this.resizeObserver?.disconnect()
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('click', this.handleClick)
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel)
    this.canvas.removeEventListener('lostpointercapture', this.handleLostPointerCapture)
    this.canvas.removeEventListener('wheel', this.handleWheel)
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('blur', this.handleWindowBlur)

    this.scene.remove(this.player.group)
    this.player.dispose()
    for (const p of this.bookPages) {
      p.group.traverse((child) => {
        if (!(child instanceof THREE.Sprite)) return
        disposeSprite(child)
      })
      this.pageRoot.remove(p.group)
      p.dispose()
    }
    this.renderer?.dispose()
    this.timer.dispose()
    this.canvas.remove()
  }

  private resize(): void {
    if (!this.renderer) return
    const width = this.host.clientWidth
    const height = this.host.clientHeight
    if (width <= 0 || height <= 0) return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(width, height, false)
  }

  private syncInput(): FlightInput {
    this.frameInput.moveForward = this.inputState.moveForward
    this.frameInput.moveBackward = this.inputState.moveBackward
    this.frameInput.moveLeft = this.inputState.moveLeft
    this.frameInput.moveRight = this.inputState.moveRight
    this.frameInput.moveUp = this.inputState.moveUp
    this.frameInput.moveDown = this.inputState.moveDown
    this.frameInput.sprint = this.inputState.sprint
    this.frameInput.lookActive = this.inputState.lookActive
    this.frameInput.lookDeltaX = this.inputState.lookDeltaX
    this.frameInput.lookDeltaY = this.inputState.lookDeltaY
    return this.frameInput
  }

  private handlePointerDown = (event: PointerEvent): void => {
    this.canvas.focus()
    if (event.button === 2) {
      this.inputState.lookActive = true
      this.canvas.setPointerCapture(event.pointerId)
    }
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if ((event.buttons & 2) === 0 && this.inputState.lookActive) {
      this.releaseLookCapture(event.pointerId)
      return
    }
    if (!this.inputState.lookActive) return
    this.inputState.lookDeltaX += event.movementX
    this.inputState.lookDeltaY += event.movementY
  }

  private handlePointerUp = (event: PointerEvent): void => {
    if ((event.buttons & 2) === 0 && this.inputState.lookActive) {
      this.releaseLookCapture(event.pointerId)
    }
  }

  private handleClick = (event: MouseEvent): void => {
    if (event.button !== 0 || this.inputState.lookActive) return
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    this.pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointerNdc, this.camera)
    const hit = this.raycaster.intersectObjects(this.pageArrowTargets, false)[0]
    const direction = hit?.object.userData.turnDirection
    if (direction === -1 || direction === 1) {
      this.turnPages(direction)
    }
  }

  private handlePointerCancel = (event: PointerEvent): void => {
    this.releaseLookCapture(event.pointerId)
  }

  private handleLostPointerCapture = (): void => {
    this.inputState.lookActive = false
  }

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault()
    this.zoomDistance = THREE.MathUtils.clamp(
      this.zoomDistance + event.deltaY * 0.01,
      2.8,
      PLAYGROUND_ZOOM.max,
    )
  }

  private handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyW') this.inputState.moveForward = true
    if (event.code === 'KeyS') this.inputState.moveBackward = true
    if (event.code === 'KeyA') this.inputState.moveLeft = true
    if (event.code === 'KeyD') this.inputState.moveRight = true
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.inputState.sprint = true
    if (event.code === 'Space') {
      event.preventDefault()
      this.inputState.moveUp = true
    }
    if (event.code === 'ControlLeft' || event.code === 'ControlRight') this.inputState.moveDown = true
  }

  private handleKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'KeyW') this.inputState.moveForward = false
    if (event.code === 'KeyS') this.inputState.moveBackward = false
    if (event.code === 'KeyA') this.inputState.moveLeft = false
    if (event.code === 'KeyD') this.inputState.moveRight = false
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.inputState.sprint = false
    if (event.code === 'Space') {
      event.preventDefault()
      this.inputState.moveUp = false
    }
    if (event.code === 'ControlLeft' || event.code === 'ControlRight') this.inputState.moveDown = false
  }

  private handleWindowBlur = (): void => {
    this.inputState.moveForward = false
    this.inputState.moveBackward = false
    this.inputState.moveLeft = false
    this.inputState.moveRight = false
    this.inputState.moveUp = false
    this.inputState.moveDown = false
    this.inputState.sprint = false
    this.inputState.lookActive = false
    this.inputState.lookDeltaX = 0
    this.inputState.lookDeltaY = 0
  }

  private releaseLookCapture(pointerId: number): void {
    if (this.canvas.hasPointerCapture(pointerId)) {
      this.canvas.releasePointerCapture(pointerId)
    }
    this.inputState.lookActive = false
  }

  private animState(frame: { isMoving: boolean; isSprinting: boolean }): 'idle' | 'walking' | 'running' {
    if (!frame.isMoving) return 'idle'
    if (frame.isSprinting) return 'running'
    return 'walking'
  }

  private turnPages(direction: -1 | 1): void {
    if (this.pageCount <= 1) return
    this.currentFrontPageIndex = wrapIndex(
      this.currentFrontPageIndex + direction,
      this.pageCount,
    )
    this.ringRotationTarget += this.pageStepAngle * direction
  }

  private frame = (time?: number): void => {
    if (this.disposed || !this.renderer) return

    this.timer.update(time)
    const elapsed = this.timer.getElapsed()
    const delta = this.lastElapsed === 0 ? 0 : Math.min(0.05, Math.max(0, elapsed - this.lastElapsed))
    this.lastElapsed = elapsed

    this.flightConfig.cameraDistance = this.zoomDistance
    const f = this.flight.update(this.camera, this.syncInput(), this.flightConfig, DEMO_BOUNDS, delta)
    this.inputState.lookDeltaX = 0
    this.inputState.lookDeltaY = 0

    this.player.group.position.copy(f.playerPosition)
    this.player.group.rotation.y = this.flight.getYaw()
    this.player.update(delta, this.animState(f))

    // Drive text distortion from the body/chest, not the feet/root, so nearby glyphs react sooner.
    this.playerInfluencePoint.copy(f.playerPosition)
    this.playerInfluencePoint.y += 1.0
    for (const page of this.bookPages) {
      page.setPlayerWorldPoint(this.playerInfluencePoint)
      page.update(elapsed)
    }

    this.ringRotationCurrent = dampAngle(
      this.ringRotationCurrent,
      this.ringRotationTarget,
      Math.min(1, 7.5 * delta),
    )
    this.pageRoot.rotation.y = this.ringRotationCurrent

    this.renderer.render(this.scene, this.camera)
    this.rafId = requestAnimationFrame(this.frame)
  }
}
