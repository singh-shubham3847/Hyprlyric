import { DEFAULT_PALETTE } from '@shared/palette-defaults'
import type { Palette, ShowOn } from '@shared/types'
import { fluentSvg, resolveIcon, type IconRef } from '../icons/resolve'
import { activeWordIndex, type LyricsModel } from '../model'
import { setStyle } from '../style-cache'
import {
  clamp,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  lerp,
  mixHex,
  rgba
} from '../util'
import type { FrameInfo, StageStyle } from './types'

const PREVIEW_MS = 3200
const WIPE_MS = 140
const WORD_ENTER_MS = 220

/**
 * A chunk of lyrics displayed on one face of the cube.
 * Strictly between 1 and 3 words (never more than 3).
 */
interface LyricChunk {
  index: number
  wordIndices: number[]
  start: number
  end: number
}

interface FaceWordElements {
  root: HTMLDivElement
  box: HTMLDivElement
  text: HTMLSpanElement
  icon: HTMLSpanElement | null
  iconRef: IconRef | null
  iconColor: string
}

interface FaceSlot {
  slotIndex: number
  faceEl: HTMLDivElement
  wordsContainer: HTMLDivElement
  currentChunkIndex: number
  wordElements: FaceWordElements[]
}

interface CycleStep {
  face: number
  yaw: number
  pitch: number
  baseYaw: number
  basePitch: number
  camPanX: number
  camPanY: number
}

const DEFAULT_STEP: CycleStep = {
  face: 0,
  yaw: 0,
  pitch: 0,
  baseYaw: -28,
  basePitch: 22,
  camPanX: -26,
  camPanY: 0
}

function shortestAngle(fromAngle: number, toBase: number): number {
  let diff = (((toBase - fromAngle) % 360) + 540) % 360 - 180
  if (Math.abs(diff) === 180 && Math.random() > 0.5) {
    diff = 180
  }
  return fromAngle + diff
}

/**
 * Procedurally generates random 3D rotation steps using ALL 6 cube faces:
 * 0: Front, 1: Right, 2: Back, 3: Left, 4: Top, 5: Bottom.
 * Prioritizes least-visited faces so all 6 sides are used evenly and unpredictably.
 */
function generateRandomSteps(numChunks: number): CycleStep[] {
  if (numChunks <= 0) return []

  const steps: CycleStep[] = []
  const faceUsage = [0, 0, 0, 0, 0, 0]

  let curFace = 0
  let curYaw = 0
  let curPitch = 0
  faceUsage[0] = (faceUsage[0] ?? 0) + 1

  steps.push({ ...DEFAULT_STEP })

  for (let i = 1; i < numChunks; i++) {
    // Pick the next face among the other 5 faces (never the current face)
    const candidates = [0, 1, 2, 3, 4, 5].filter((f) => f !== curFace)

    // Weight choices by lowest usage count + random noise
    candidates.sort((a, b) => {
      const scoreA = (faceUsage[a] ?? 0) * 10 + Math.random() * 8
      const scoreB = (faceUsage[b] ?? 0) * 10 + Math.random() * 8
      return scoreA - scoreB
    })

    const nextFace = candidates[0] ?? 0
    faceUsage[nextFace] = (faceUsage[nextFace] ?? 0) + 1

    let nextYaw = curYaw
    let nextPitch = 0

    if (nextFace === 4) {
      // Top face
      nextPitch = 90
      nextYaw = shortestAngle(curYaw, 0)
    } else if (nextFace === 5) {
      // Bottom face
      nextPitch = -90
      nextYaw = shortestAngle(curYaw, 0)
    } else {
      // Horizontal face: 0 (Front), 1 (Right), 2 (Back), 3 (Left)
      nextPitch = 0
      const targetBase = nextFace === 0 ? 0 : nextFace === 1 ? -90 : nextFace === 2 ? 180 : 90
      nextYaw = shortestAngle(curYaw, targetBase)
    }

    // Steeper isometric base tilt & cam pan so 3 faces are clearly visible at once
    let baseYaw = -28
    let basePitch = 22
    let camPanX = 0
    let camPanY = 0

    if (nextFace === 4) {
      baseYaw = (Math.random() > 0.5 ? 1 : -1) * (18 + Math.random() * 6)
      basePitch = -26 - Math.random() * 6
      camPanX = 0
      camPanY = -24
    } else if (nextFace === 5) {
      baseYaw = (Math.random() > 0.5 ? 1 : -1) * (18 + Math.random() * 6)
      basePitch = 26 + Math.random() * 6
      camPanX = 0
      camPanY = 24
    } else if (nextFace === 1) {
      baseYaw = 28 + Math.random() * 6
      basePitch = 22 + Math.random() * 6
      camPanX = 26
      camPanY = 0
    } else if (nextFace === 3) {
      baseYaw = -28 - Math.random() * 6
      basePitch = 22 + Math.random() * 6
      camPanX = -26
      camPanY = 0
    } else if (nextFace === 2) {
      baseYaw = (Math.random() > 0.5 ? 1 : -1) * (26 + Math.random() * 6)
      basePitch = 22 + Math.random() * 6
      camPanX = baseYaw > 0 ? 24 : -24
      camPanY = 0
    } else {
      baseYaw = (Math.random() > 0.5 ? 1 : -1) * (26 + Math.random() * 6)
      basePitch = 22 + Math.random() * 6
      camPanX = baseYaw > 0 ? 24 : -24
      camPanY = 0
    }

    steps.push({
      face: nextFace,
      yaw: nextYaw,
      pitch: nextPitch,
      baseYaw,
      basePitch,
      camPanX,
      camPanY
    })

    curFace = nextFace
    curYaw = nextYaw
    curPitch = nextPitch
  }

  return steps
}

interface ChunkTransition {
  fromChunk: number
  toChunk: number
  fromStep: CycleStep
  toStep: CycleStep
  startMs: number
  endMs: number
}

function buildTransitions(chunks: LyricChunk[], steps: CycleStep[]): ChunkTransition[] {
  const trans: ChunkTransition[] = []
  for (let k = 0; k < chunks.length - 1; k++) {
    const cur = chunks[k]!
    const next = chunks[k + 1]!
    const fromStep = steps[k] ?? DEFAULT_STEP
    const toStep = steps[k + 1] ?? DEFAULT_STEP

    const gap = next.start - cur.end
    let duration = 520
    let startMs = cur.end - 140

    if (gap > 360) {
      duration = Math.min(620, Math.max(460, gap * 0.75))
      startMs = next.start - duration
    } else if (gap > 0) {
      duration = Math.min(540, Math.max(380, gap + 180))
      startMs = cur.end - 80
    } else {
      duration = 460
      startMs = cur.end - 180
    }

    trans.push({
      fromChunk: k,
      toChunk: k + 1,
      fromStep,
      toStep,
      startMs,
      endMs: startMs + duration
    })
  }
  return trans
}

/**
 * Partitions the song's lyrics into chunks of 2 to 3 words each (never more than 3).
 */
function buildChunks(model: LyricsModel): LyricChunk[] {
  const chunks: LyricChunk[] = []
  let chunkIdx = 0

  for (let l = 0; l < model.lines.length; l++) {
    const lineWords: number[] = []
    for (let i = 0; i < model.words.length; i++) {
      if (model.words[i]!.line === l) lineWords.push(i)
    }
    if (!lineWords.length) continue

    let offset = 0
    while (offset < lineWords.length) {
      const remaining = lineWords.length - offset
      let take = 2
      if (remaining === 3) {
        take = 3
      } else if (remaining === 5) {
        take = 3
      } else if (remaining === 6) {
        take = 3
      } else if (remaining > 6) {
        take = 3
      } else if (remaining === 1) {
        take = 1
      }
      take = Math.min(take, remaining)

      const indices = lineWords.slice(offset, offset + take)
      const firstW = model.words[indices[0]!]!
      const lastW = model.words[indices[indices.length - 1]!]!

      chunks.push({
        index: chunkIdx++,
        wordIndices: indices,
        start: firstW.start,
        end: lastW.end
      })
      offset += take
    }
  }

  return chunks
}

/** Finds the chunk corresponding to the given song time. */
function findActiveChunk(chunks: LyricChunk[], t: number): number {
  if (!chunks.length) return -1
  if (t < chunks[0]!.start) return -1
  let lo = 0
  let hi = chunks.length - 1
  let found = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (chunks[mid]!.start <= t) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

/**
 * Ship/Tesseract: An invisible 3D kinetic lyric cube with close-up camera and adjacent right/left/up/down rotations.
 * The camera is intimately close to the active words and dives toward them during singing.
 * The cube rotates smoothly towards the right, left, up, and down directly to the adjacent side.
 */
export function createShip(withIcons = false): StageStyle {
  let scene: HTMLDivElement | null = null
  let camera: HTMLDivElement | null = null
  let pivot: HTMLDivElement | null = null
  let cube: HTMLDivElement | null = null
  let model: LyricsModel | null = null
  let chunks: LyricChunk[] = []
  let steps: CycleStep[] = []
  let transitions: ChunkTransition[] = []
  let palette: Palette = { ...DEFAULT_PALETTE }
  let mode: ShowOn = 'lock'
  let viewW = 0
  let viewH = 0

  const faces: FaceSlot[] = []

  const clearFaces = (): void => {
    for (const f of faces) f.faceEl.remove()
    faces.length = 0
  }

  function initFaces(): void {
    clearFaces()
    if (!cube) return

    // 6 cube faces: 0:Front, 1:Right, 2:Back, 3:Left, 4:Top, 5:Bottom
    for (let s = 0; s < 6; s++) {
      const faceEl = document.createElement('div')
      faceEl.className = 'ship-face'
      const wordsContainer = document.createElement('div')
      wordsContainer.className = 'ship-face-words'
      faceEl.append(wordsContainer)
      cube.append(faceEl)

      faces.push({
        slotIndex: s,
        faceEl,
        wordsContainer,
        currentChunkIndex: -1,
        wordElements: []
      })
    }
  }

  function populateFace(face: FaceSlot, chunkIndex: number, fontSize: number): void {
    if (face.currentChunkIndex === chunkIndex) return
    face.currentChunkIndex = chunkIndex
    face.wordsContainer.innerHTML = ''
    face.wordElements = []

    if (chunkIndex < 0 || chunkIndex >= chunks.length || !model) return

    const chunk = chunks[chunkIndex]!
    face.faceEl.style.fontSize = `${fontSize.toFixed(1)}px`

    for (const wIdx of chunk.wordIndices) {
      const word = model.words[wIdx]!
      const root = document.createElement('div')
      root.className = 'ship-word'

      const box = document.createElement('div')
      box.className = 'ship-box'

      const text = document.createElement('span')
      text.className = 'ship-text'
      text.textContent = word.text

      root.append(box, text)

      let icon: HTMLSpanElement | null = null
      let iconRef: IconRef | null = null
      if (withIcons) {
        iconRef = resolveIcon(word.text)
        if (iconRef) {
          icon = document.createElement('span')
          icon.className = iconRef.kind === 'emoji' ? 'ship-icon emoji' : 'ship-icon'
          if (iconRef.kind === 'emoji') {
            icon.textContent = iconRef.char
          }
          root.append(icon)
        }
      }

      face.wordsContainer.append(root)

      face.wordElements.push({ root, box, text, icon, iconRef, iconColor: '' })
    }
  }

  return {
    fps: { busy: 30, idle: 12 },

    mount(root) {
      scene = document.createElement('div')
      scene.className = 'ship-scene'

      camera = document.createElement('div')
      camera.className = 'ship-camera'

      pivot = document.createElement('div')
      pivot.className = 'ship-cube-pivot'

      cube = document.createElement('div')
      cube.className = 'ship-cube'

      pivot.append(cube)
      camera.append(pivot)
      scene.append(camera)
      root.append(scene)

      initFaces()
    },

    setLyrics(next) {
      model = next
      chunks = next ? buildChunks(next) : []
      steps = next ? generateRandomSteps(chunks.length) : []
      transitions = next ? buildTransitions(chunks, steps) : []
      for (const f of faces) f.currentChunkIndex = -1
    },

    setPalette(next) {
      palette = next
    },

    setMode(next: ShowOn) {
      mode = next
    },

    frame({ songMs: t, wallMs, width: W, height: H }: FrameInfo): boolean {
      if (!scene || !camera || !pivot || !cube || !model || !chunks.length) return false

      if (W !== viewW || H !== viewH) {
        viewW = W
        viewH = H
        for (const f of faces) f.currentChunkIndex = -1
      }

      // Responsive cube proportions fitting all 3 visible faces comfortably
      const cubeSize = Math.max(260, Math.min(W * 0.42, H * 0.40, 420))
      const radius = cubeSize * 0.5
      // Bold typography
      const fontSize = Math.max(32, Math.min(cubeSize * 0.155, 64))

      pivot.style.width = `${cubeSize.toFixed(1)}px`
      pivot.style.height = `${cubeSize.toFixed(1)}px`
      pivot.style.marginLeft = `${(-cubeSize * 0.5).toFixed(1)}px`
      pivot.style.marginTop = `${(-cubeSize * 0.5).toFixed(1)}px`

      // Geometric placement of 6 cube faces:
      // Front (0), Right (1), Back (2), Left (3), Top (4), Bottom (5)
      const faceTransforms = [
        `rotateY(0deg) translateZ(${radius.toFixed(1)}px)`, // 0: Front
        `rotateY(90deg) translateZ(${radius.toFixed(1)}px)`, // 1: Right
        `rotateY(180deg) translateZ(${radius.toFixed(1)}px)`, // 2: Back
        `rotateY(-90deg) translateZ(${radius.toFixed(1)}px)`, // 3: Left
        `rotateX(-90deg) translateZ(${radius.toFixed(1)}px)`, // 4: Top
        `rotateX(90deg) translateZ(${radius.toFixed(1)}px)` // 5: Bottom
      ]

      for (let s = 0; s < faces.length; s++) {
        const face = faces[s]!
        setStyle(face.faceEl, 'width', `${cubeSize.toFixed(1)}px`)
        setStyle(face.faceEl, 'height', `${cubeSize.toFixed(1)}px`)
        setStyle(face.faceEl, 'transform', faceTransforms[s]!)
      }

      const preview = t < chunks[0]!.start
      if (preview && t < chunks[0]!.start - PREVIEW_MS) {
        setStyle(scene, 'opacity', '0')
        return false
      }
      setStyle(scene, 'opacity', '1')

      // Continuous rotation and face tracking across transitions
      let activeChunkIdx = 0
      let currentYaw = 0
      let currentPitch = 0
      const initialStep = steps[0] ?? DEFAULT_STEP
      let curBaseYaw = initialStep.baseYaw
      let curBasePitch = initialStep.basePitch
      let turnProgress = 0
      let isRotating = false
      let activeTransition: ChunkTransition | null = null

      if (!transitions.length) {
        activeChunkIdx = 0
        const step = initialStep
        currentYaw = step.yaw
        currentPitch = step.pitch
        curBaseYaw = step.baseYaw
        curBasePitch = step.basePitch
      } else if (t < transitions[0]!.startMs) {
        activeChunkIdx = 0
        const step = transitions[0]!.fromStep
        currentYaw = step.yaw
        currentPitch = step.pitch
        curBaseYaw = step.baseYaw
        curBasePitch = step.basePitch
      } else if (t >= transitions[transitions.length - 1]!.endMs) {
        activeChunkIdx = chunks.length - 1
        const step = transitions[transitions.length - 1]!.toStep
        currentYaw = step.yaw
        currentPitch = step.pitch
        curBaseYaw = step.baseYaw
        curBasePitch = step.basePitch
      } else {
        for (let i = 0; i < transitions.length; i++) {
          const tr = transitions[i]!
          if (t >= tr.startMs && t < tr.endMs) {
            activeTransition = tr
            const p = clamp((t - tr.startMs) / (tr.endMs - tr.startMs))
            turnProgress = p
            isRotating = p > 0 && p < 1
            const rotEased = easeInOutCubic(p)

            currentYaw = lerp(tr.fromStep.yaw, tr.toStep.yaw, rotEased)
            currentPitch = lerp(tr.fromStep.pitch, tr.toStep.pitch, rotEased)
            curBaseYaw = lerp(tr.fromStep.baseYaw, tr.toStep.baseYaw, rotEased)
            curBasePitch = lerp(tr.fromStep.basePitch, tr.toStep.basePitch, rotEased)

            // Switch active chunk highlighting at the midpoint of the roll
            activeChunkIdx = p < 0.5 ? tr.fromChunk : tr.toChunk
            break
          } else if (i < transitions.length - 1 && t >= tr.endMs && t < transitions[i + 1]!.startMs) {
            activeChunkIdx = i + 1
            const step = tr.toStep
            currentYaw = step.yaw
            currentPitch = step.pitch
            curBaseYaw = step.baseYaw
            curBasePitch = step.basePitch
            break
          }
        }
      }

      // Ambient 3D breathing drift
      const tau = Math.PI * 2
      const ambientYaw = 3.2 * Math.sin((tau * wallMs) / 19_000) + 1.2 * Math.sin((tau * wallMs) / 7_400)
      const ambientPitch = 2.4 * Math.sin((tau * wallMs) / 13_000)
      const ambientRoll = 0.9 * Math.sin((tau * wallMs) / 23_000)
      const ambientY = 6 * Math.sin((tau * wallMs) / 16_000)

      setStyle(
        pivot,
        'transform',
        `translateY(${ambientY.toFixed(1)}px) rotateX(${(curBasePitch + ambientPitch).toFixed(2)}deg) rotateY(${curBaseYaw.toFixed(2)}deg) rotateZ(${ambientRoll.toFixed(2)}deg)`
      )

      setStyle(
        cube,
        'transform',
        `rotateX(${currentPitch.toFixed(2)}deg) rotateY(${(currentYaw + ambientYaw).toFixed(2)}deg)`
      )

      // Populate faces:
      // The current step's face holds the active chunk.
      // The next step's face holds the upcoming chunk.
      // Remaining faces hold surrounding chunks so all sides display words in 3D.
      const currentStep = steps[activeChunkIdx] ?? steps[0] ?? DEFAULT_STEP
      const nextStep = steps[activeChunkIdx + 1] ?? steps[activeChunkIdx] ?? steps[0] ?? DEFAULT_STEP
      const currentFaceIdx = currentStep.face
      const targetFaceIdx = nextStep.face

      const chunkAssignments = new Map<number, number>()
      chunkAssignments.set(currentFaceIdx, activeChunkIdx)
      if (targetFaceIdx !== currentFaceIdx) {
        chunkAssignments.set(targetFaceIdx, (activeChunkIdx + 1) % chunks.length)
      }

      const assignedFaces = new Set<number>([currentFaceIdx, targetFaceIdx])
      const remainingFaces = [0, 1, 2, 3, 4, 5].filter((f) => !assignedFaces.has(f))
      const offsets = [1, -1, 2, -2]
      for (let i = 0; i < remainingFaces.length; i++) {
        const off = offsets[i] ?? (i + 1)
        const wrappedIdx = (activeChunkIdx + off + chunks.length * 10) % chunks.length
        chunkAssignments.set(remainingFaces[i]!, wrappedIdx)
      }

      for (const face of faces) {
        const cIdx = chunkAssignments.get(face.slotIndex) ?? 0
        populateFace(face, cIdx, fontSize)
      }

      // Camera Framing: position camera so front, top, and side faces stay completely in frame
      const activeWordIdx = activeWordIndex(model, t)
      const currentWord = model.words[activeWordIdx]
      let isEnteringWord = false

      // Backed-up camera distance so top & side lyrics are completely visible on-screen
      const baseCamZ = -40
      let vocalPushZ = 0
      let camPanX = 0
      let camPanY = 0

      if (currentWord && !preview) {
        const wordSince = t - currentWord.start
        const wordDur = Math.max(100, currentWord.end - currentWord.start)
        const wordP = clamp(wordSince / wordDur)
        // Camera swoops in closer toward words during vocal delivery
        vocalPushZ = 45 * Math.sin(wordP * Math.PI)
        if (wordSince < WORD_ENTER_MS + 60) isEnteringWord = true
      }

      // Camera pulls back dynamically during cube rotation for a wide sweeping view of the turn (-240px)
      const turnPeak = Math.sin(turnProgress * Math.PI)
      const pullBackZ = turnPeak * -240
      const turnPanX = turnPeak * (activeTransition ? (activeTransition.toStep.camPanX - activeTransition.fromStep.camPanX) * 0.5 : 0)
      const turnPanY = turnPeak * (activeTransition ? (activeTransition.toStep.camPanY - activeTransition.fromStep.camPanY) * 0.5 : 0)

      // Horizontal word tracking pan
      const currentChunk = chunks[activeChunkIdx]
      if (currentWord && currentChunk && currentChunk.wordIndices.length > 1) {
        const wordPosInChunk = currentChunk.wordIndices.indexOf(activeWordIdx)
        if (wordPosInChunk === 0) camPanX = -18
        else if (wordPosInChunk === currentChunk.wordIndices.length - 1) camPanX = 18
      }

      const totalCamX = camPanX + turnPanX
      const totalCamY = camPanY + turnPanY
      const totalCamZ = baseCamZ + vocalPushZ + pullBackZ

      setStyle(
        camera,
        'transform',
        `translate3d(${totalCamX.toFixed(1)}px, ${totalCamY.toFixed(1)}px, ${totalCamZ.toFixed(1)}px)`
      )

      // Render words across all visible faces (front active words + side/top words)
      for (const face of faces) {
        if (face.currentChunkIndex < 0 || face.currentChunkIndex >= chunks.length) continue
        const chunk = chunks[face.currentChunkIndex]!
        const isCurrentFace = face.slotIndex === currentFaceIdx

        for (let j = 0; j < chunk.wordIndices.length; j++) {
          const wIdx = chunk.wordIndices[j]!
          const el = face.wordElements[j]
          if (!el) continue

          const word = model.words[wIdx]!
          const isCurrentWord = !preview && isCurrentFace && wIdx === activeWordIdx
          const isPastWord = !preview && (wIdx < activeWordIdx || (wIdx === activeWordIdx && t > word.end))

          if (isCurrentWord) {
            const since = t - word.start
            const duration = Math.min(WORD_ENTER_MS, Math.max(90, (word.end - word.start) * 0.8))
            const p = clamp(since / duration)
            const scale = lerp(0.98, 1.18, easeOutBack(p))
            const wipe = easeOutCubic(since / WIPE_MS)

            setStyle(el.root, 'transform', `scale(${scale.toFixed(4)})`)
            setStyle(el.root, 'opacity', '1')
            setStyle(el.box, 'background', palette.highlight)
            setStyle(el.box, 'opacity', '1')
            setStyle(el.box, 'transform', `scaleX(${wipe.toFixed(4)})`)
            setStyle(el.box, 'box-shadow', `0 0.15em 0.7em ${rgba(palette.highlight, 0.52)}`)
            setStyle(el.text, 'color', mixHex(palette.secondary, palette.highlightText, wipe))
            setStyle(el.text, 'text-shadow', 'none')
            if (el.icon && el.iconRef?.kind === 'fluent') {
              const iconCol = mixHex(palette.secondary, palette.highlightText, wipe)
              if (el.iconColor !== iconCol) {
                el.icon.innerHTML = fluentSvg(el.iconRef, iconCol)
                el.iconColor = iconCol
              }
            }
          } else if (isCurrentFace) {
            // Words on the front face
            if (isPastWord) {
              setStyle(el.root, 'transform', 'scale(1)')
              setStyle(el.root, 'opacity', '0.94')
              setStyle(el.box, 'opacity', '0')
              setStyle(el.box, 'transform', 'scaleX(0)')
              setStyle(el.box, 'box-shadow', 'none')
              setStyle(el.text, 'color', palette.lyric)
              setStyle(el.text, 'text-shadow', 'none')
              if (el.icon && el.iconRef?.kind === 'fluent') {
                if (el.iconColor !== palette.lyric) {
                  el.icon.innerHTML = fluentSvg(el.iconRef, palette.lyric)
                  el.iconColor = palette.lyric
                }
              }
            } else {
              setStyle(el.root, 'transform', 'scale(0.96)')
              setStyle(el.root, 'opacity', '0.70')
              setStyle(el.box, 'opacity', '0')
              setStyle(el.box, 'transform', 'scaleX(0)')
              setStyle(el.box, 'box-shadow', 'none')
              setStyle(el.text, 'color', palette.secondary)
              setStyle(el.text, 'text-shadow', 'none')
              if (el.icon && el.iconRef?.kind === 'fluent') {
                if (el.iconColor !== palette.secondary) {
                  el.icon.innerHTML = fluentSvg(el.iconRef, palette.secondary)
                  el.iconColor = palette.secondary
                }
              }
            }
          } else {
            // Words visible on the adjacent sides (Right, Left, Top, Bottom)
            const isPreviousChunk = chunk.index < activeChunkIdx
            const isTargetFace = face.slotIndex === targetFaceIdx
            const sideColor = isTargetFace ? palette.highlightText : isPreviousChunk ? palette.lyric : palette.secondary
            setStyle(el.root, 'transform', 'scale(1)')
            setStyle(el.root, 'opacity', isTargetFace ? '0.98' : '0.88')
            setStyle(el.box, 'opacity', '0')
            setStyle(el.box, 'transform', 'scaleX(0)')
            setStyle(el.box, 'box-shadow', 'none')
            setStyle(el.text, 'color', sideColor)
            setStyle(el.text, 'text-shadow', isTargetFace ? `0 0 16px ${rgba(palette.highlight, 0.6)}` : `0 0 8px rgba(0, 0, 0, 0.45)`)
            if (el.icon && el.iconRef?.kind === 'fluent') {
              if (el.iconColor !== sideColor) {
                el.icon.innerHTML = fluentSvg(el.iconRef, sideColor)
                el.iconColor = sideColor
              }
            }
          }
        }
      }

      const previewFade = preview ? clamp((t - (chunks[0]!.start - PREVIEW_MS)) / 800) : 1
      return isRotating || isEnteringWord || (preview && previewFade < 1)
    },

    destroy() {
      clearFaces()
      pivot?.remove()
      camera?.remove()
      scene?.remove()
      scene = null
      camera = null
      pivot = null
      cube = null
    }
  }
}
