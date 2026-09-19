// Cockpit renderer. Draws the top 576x192 of the frame on a canvas and cuts it
// into the four image tiles of layout.ts. Pure drawing: all state comes from ui.ts.
import { DRAWN_HEIGHT, LIST_ROWS, TILES, WIDTH } from './layout'
import { clip, itemsFor, jobName, text, type Data, type Screen } from './ui'
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

// Top band, y 0-60: corner brackets, state chip, job name, clock, progress bar.
function band(ctx: Ctx, data: Data, now: Date): void {
  const { snap } = data
  ctx.strokeStyle = MID
  ctx.lineWidth = 2
  for (const [x, sx] of [[6, 1], [570, -1]]) {
    ctx.beginPath(); ctx.moveTo(x + 18 * sx, 6); ctx.lineTo(x, 6); ctx.lineTo(x, 24); ctx.stroke()
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
  write(ctx, clock(now), 560, 29, { size: 17, align: 'right' })
  const name = snap.filename ? jobName(snap.filename) : snap.message
  if (name) write(ctx, fit(ctx, name, 490 - chip, { size: 17 }), 30 + chip, 29, { size: 17, color: MID })

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
  ctx.strokeRect(x + 0.5, 94.5, 22, 66)
  const height = 62 * Math.min(1, Math.max(0, now / max))
  ctx.fillStyle = FG
  ctx.fillRect(x + 3, 158 - height, 17, height)
  if (target > 0) ctx.fillRect(x - 6, 158 - 62 * Math.min(1, target / max), 34, 2)
  write(ctx, `${Math.round(now)}°`, x + 11, 88, { size: 15, bold: true, align: 'center' })
  write(ctx, target > 0 ? `${name} ${Math.round(target)}` : name, x + 11, 178, { size: 12, color: MID, align: 'center' })
}

// Status pane, x 0-288: percent, layer, thermometers.
function status(ctx: Ctx, data: Data): void {
  const { snap } = data
  ctx.strokeStyle = DIM
  ctx.lineWidth = 1
  ctx.strokeRect(16.5, 66.5, 263, 121)
  if (snap.state === 'printing' || snap.state === 'paused') {
    write(ctx, `${Math.floor(snap.progress * 100)}%`, 26, 134, { size: 56, bold: true })
    if (snap.layer != null && snap.totalLayers) write(ctx, `LAYER ${snap.layer}/${snap.totalLayers}`, 28, 172, { size: 15, color: MID })
  } else {
    write(ctx, snap.state === 'offline' ? 'N/C' : snap.state === 'complete' ? 'DONE' : 'IDLE', 26, 132, { size: 48, bold: true })
    write(ctx, snap.state === 'offline' ? 'NO MOONRAKER' : 'NO ACTIVE JOB', 28, 172, { size: 15, color: MID })
  }
  thermometer(ctx, 'NOZ', 188, snap.nozzle, snap.nozzleTarget, NOZZLE_MAX)
  thermometer(ctx, 'BED', 240, snap.bed, snap.bedTarget, BED_MAX)
}

// Action pane, x 296-560, y 66-188. Everything a gesture can change is in here,
// so navigating costs one image send.
const PANE = { x: 296, y: 66, width: 264, height: 122 }

function grid(ctx: Ctx, labels: string[], cursor: number): void {
  const width = (PANE.width - 8) / 2
  const height = (PANE.height - 8) / 2
  labels.slice(0, 4).forEach((label, index) => {
    const x = PANE.x + (index % 2) * (width + 8)
    const y = PANE.y + Math.floor(index / 2) * (height + 8)
    if (index === cursor) {
      ctx.fillStyle = FG
      ctx.fillRect(x, y, width, height)
    } else {
      ctx.strokeStyle = MID
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1)
    }
    const style = { size: 14, bold: true, align: 'center' as const, color: index === cursor ? OFF : FG }
    write(ctx, fit(ctx, label, width - 10, style), x + width / 2, y + height / 2 + 5, style)
  })
}

function listing(ctx: Ctx, labels: string[], cursor: number, empty: string): void {
  if (!labels.length) { write(ctx, empty, PANE.x + 4, PANE.y + 30, { size: 16, color: MID }); return }
  const first = Math.min(Math.max(0, cursor - LIST_ROWS + 1), Math.max(0, labels.length - LIST_ROWS))
  labels.slice(first, first + LIST_ROWS).forEach((label, row) => {
    const y = PANE.y + row * 31
    const selected = first + row === cursor
    if (selected) { ctx.fillStyle = FG; ctx.fillRect(PANE.x, y, PANE.width, 28) }
    const style = { size: 16, bold: selected, color: selected ? OFF : FG }
    write(ctx, fit(ctx, label, PANE.width - 16, style), PANE.x + 8, y + 20, style)
  })
}

function confirm(ctx: Ctx, lines: string[], busy: boolean): void {
  ctx.strokeStyle = FG
  ctx.lineWidth = 2
  ctx.strokeRect(PANE.x + 1, PANE.y + 1, PANE.width - 2, PANE.height - 2)
  ctx.lineWidth = 1
  ctx.strokeRect(PANE.x + 5.5, PANE.y + 5.5, PANE.width - 11, PANE.height - 11)
  const middle = PANE.x + PANE.width / 2
  const [title = '', ...detail] = lines
  write(ctx, fit(ctx, title, PANE.width - 28, { size: 20, bold: true }), middle, PANE.y + 32, { size: 20, bold: true, align: 'center' })
  detail.slice(0, 2).forEach((line, index) =>
    write(ctx, fit(ctx, line, PANE.width - 28, { size: 14 }), middle, PANE.y + 53 + index * 17, { size: 14, color: MID, align: 'center' }))
  if (busy) { write(ctx, 'SENDING…', middle, PANE.y + 106, { size: 17, bold: true, align: 'center' }); return }
  ctx.fillStyle = FG
  ctx.fillRect(PANE.x + 14, PANE.y + 84, 114, 28)
  write(ctx, 'TAP  YES', PANE.x + 71, PANE.y + 104, { size: 15, bold: true, align: 'center', color: OFF })
  ctx.strokeStyle = MID
  ctx.strokeRect(PANE.x + 136.5, PANE.y + 84.5, 113, 27)
  write(ctx, '2×  NO', PANE.x + 193, PANE.y + 104, { size: 15, bold: true, align: 'center' })
}

export function drawFrame(screen: Screen, data: Data, now = new Date()): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = DRAWN_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')
  ctx.fillStyle = OFF
  ctx.fillRect(0, 0, WIDTH, DRAWN_HEIGHT)

  band(ctx, data, now)
  status(ctx, data)
  const body = text(screen, data).body.split('\n')
  if (screen.kind === 'confirm') confirm(ctx, body, data.busy)
  else if (screen.kind === 'home') grid(ctx, itemsFor(screen, data).map(item => item.label), screen.cursor)
  else if (screen.kind === 'spool') {
    const [title = '', ...rest] = body
    write(ctx, fit(ctx, title, PANE.width, { size: 18, bold: true }), PANE.x, PANE.y + 22, { size: 18, bold: true })
    rest.forEach((line, index) => write(ctx, fit(ctx, line, PANE.width, { size: 15 }), PANE.x, PANE.y + 50 + index * 24, { size: 15, color: index ? FG : MID }))
  } else {
    listing(ctx, itemsFor(screen, data).map(item => item.label), screen.cursor,
      screen.kind === 'jobs' ? 'No gcode files found.' : 'Nothing available.')
  }
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
