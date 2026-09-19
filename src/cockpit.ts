// Cockpit dashboard. Draws the top 576x200 of the frame on a canvas and cuts it
// into the four image tiles. Only slow-changing things live here (an image send
// costs ~350 ms on real glasses); menus and prompts are text, see ui.consoleText.
import { DASH_HEIGHT, TILES, WIDTH } from './layout'
import { clip, duration, jobName, remainingSeconds, type Data } from './ui'
import regular from './fonts/chakra-petch-400.woff2?url'
import bold from './fonts/chakra-petch-600.woff2?url'

// The display is 4-bit greyscale shown as green; black is unlit.
const FG = '#ffffff'
const MID = '#9a9a9a'
const DIM = '#484848'
const OFF = '#000000'
const FACE = '"Chakra Petch", system-ui, sans-serif'

// Thermometer full-scale values. Tune to your hotend / bed.
const NOZZLE_MAX = 300
const BED_MAX = 120
const SEGMENTS = 40

export async function loadFonts(): Promise<void> {
  const faces = [new FontFace('Chakra Petch', `url(${regular})`, { weight: '400' }),
    new FontFace('Chakra Petch', `url(${bold})`, { weight: '600' })]
  // A missing font only costs looks; the fallback stack still renders.
  await Promise.all(faces.map(face => face.load().then(loaded => document.fonts.add(loaded)).catch(() => {})))
}

type Ctx = CanvasRenderingContext2D
interface Style { size: number; color?: string; bold?: boolean; align?: CanvasTextAlign }

function write(ctx: Ctx, value: string, x: number, y: number, { size, color = FG, bold = false, align = 'left' }: Style): void {
  ctx.font = `${bold ? 600 : 400} ${size}px ${FACE}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(value, x, y)
}

function fit(ctx: Ctx, value: string, width: number, style: Style): string {
  ctx.font = `${style.bold ? 600 : 400} ${style.size}px ${FACE}`
  let out = value
  while (out.length > 1 && ctx.measureText(out).width > width) out = clip(out, out.length - 1)
  return out
}

const clock = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

function chrome(ctx: Ctx, data: Data): void {
  const { snap } = data
  ctx.strokeStyle = MID
  ctx.lineWidth = 2
  for (const [x, y, sx, sy] of [[6, 6, 1, 1], [570, 6, -1, 1], [6, 194, 1, -1], [570, 194, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x + 18 * sx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + 18 * sy); ctx.stroke()
  }

  const label = snap.state === 'error' ? `KLIPPER ${snap.klippy.toUpperCase()}` : snap.state.toUpperCase()
  ctx.font = `600 15px ${FACE}`
  const chip = Math.ceil(ctx.measureText(label).width) + 22
  if (snap.state === 'printing') {
    ctx.fillStyle = FG
    ctx.fillRect(16, 10, chip, 26)
  } else {
    ctx.strokeStyle = FG
    ctx.lineWidth = 1
    ctx.strokeRect(16.5, 10.5, chip - 1, 25)
  }
  write(ctx, label, 16 + chip / 2, 29, { size: 15, bold: true, align: 'center', color: snap.state === 'printing' ? OFF : FG })
  const name = snap.filename ? jobName(snap.filename) : snap.message
  if (name) write(ctx, fit(ctx, name, 530 - chip, { size: 17 }), 30 + chip, 29, { size: 17, color: MID })

  const lit = Math.floor(Math.min(1, Math.max(0, snap.progress)) * SEGMENTS)
  const width = (544 - (SEGMENTS - 1) * 3) / SEGMENTS
  for (let index = 0; index < SEGMENTS; index++) {
    const x = 16 + index * (width + 3)
    ctx.fillStyle = index < lit ? FG : DIM
    ctx.fillRect(x, 42, width, 14)
    // Paused: lit segments go hollow, which reads even at 4-bit depth.
    if (index < lit && snap.state === 'paused') { ctx.fillStyle = OFF; ctx.fillRect(x + 2, 44, width - 4, 10) }
  }
}

function thermometer(ctx: Ctx, name: string, x: number, now: number, target: number, max: number): void {
  ctx.strokeStyle = MID
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, 92.5, 22, 72)
  const height = 68 * Math.min(1, Math.max(0, now / max))
  ctx.fillStyle = FG
  ctx.fillRect(x + 3, 162 - height, 17, height)
  if (target > 0) ctx.fillRect(x - 6, 162 - 68 * Math.min(1, target / max), 34, 2)
  write(ctx, `${Math.round(now)}°`, x + 11, 86, { size: 15, bold: true, align: 'center' })
  write(ctx, target > 0 ? `${name} ${Math.round(target)}` : name, x + 11, 182, { size: 12, color: MID, align: 'center' })
}

// Panels are split at x=288 so a change on one side re-sends one tile only.
function panels(ctx: Ctx, data: Data, now: Date): void {
  const { snap } = data
  ctx.strokeStyle = DIM
  ctx.lineWidth = 1
  for (const [x, width] of [[16, 264], [296, 140], [444, 116]]) ctx.strokeRect(x + 0.5, 64.5, width, 128)

  const active = snap.state === 'printing' || snap.state === 'paused'
  if (active) {
    write(ctx, `${Math.floor(snap.progress * 100)}%`, 28, 136, { size: 68, bold: true })
    if (snap.layer != null && snap.totalLayers) write(ctx, `LAYER ${snap.layer}/${snap.totalLayers}`, 28, 174, { size: 15, color: MID })
  } else {
    write(ctx, snap.state === 'offline' ? 'N/C' : snap.state === 'complete' ? 'DONE' : 'IDLE', 28, 132, { size: 52, bold: true })
    write(ctx, snap.state === 'offline' ? 'NO MOONRAKER' : 'NO ACTIVE JOB', 28, 174, { size: 15, color: MID })
  }

  const left = remainingSeconds(snap)
  write(ctx, 'REMAINING', 306, 86, { size: 12, color: MID })
  write(ctx, left == null ? '--' : duration(left), 306, 122, { size: 32, bold: true })
  write(ctx, 'DONE AT', 306, 150, { size: 12, color: MID })
  write(ctx, left == null ? '--:--' : clock(new Date(now.getTime() + left * 1000)), 306, 178, { size: 22 })

  thermometer(ctx, 'NOZ', 462, snap.nozzle, snap.nozzleTarget, NOZZLE_MAX)
  thermometer(ctx, 'BED', 518, snap.bed, snap.bedTarget, BED_MAX)
}

export function drawDashboard(data: Data, now = new Date()): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = DASH_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')
  ctx.fillStyle = OFF
  ctx.fillRect(0, 0, WIDTH, DASH_HEIGHT)
  chrome(ctx, data)
  panels(ctx, data, now)
  return canvas
}

// Base64 PNG per tile, in TILES order.
export function tiles(frame: HTMLCanvasElement): string[] {
  return TILES.map(({ xPosition, yPosition, width, height }) => {
    const tile = document.createElement('canvas')
    tile.width = width
    tile.height = height
    const ctx = tile.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is unavailable')
    ctx.drawImage(frame, xPosition, yPosition, width, height, 0, 0, width, height)
    return tile.toDataURL('image/png').split(',')[1]
  })
}
