// Cockpit renderer. Draws the whole 576x288 frame on a canvas and cuts it into
// the four image tiles. Pure drawing: all state comes from ui.ts.
import { HEIGHT, TILES, WIDTH } from './layout'
import { clip, duration, itemsFor, jobName, remainingSeconds, text, type Data, type Screen } from './ui'
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
const LIST_ROWS = 5

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

function chrome(ctx: Ctx, data: Data, now: Date): void {
  const { snap } = data
  ctx.strokeStyle = MID
  ctx.lineWidth = 2
  for (const [x, y, sx, sy] of [[6, 6, 1, 1], [570, 6, -1, 1], [6, 282, 1, -1], [570, 282, -1, -1]]) {
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
  write(ctx, clock(now), 560, 29, { size: 17, align: 'right' })
  const name = snap.filename ? jobName(snap.filename) : snap.message
  if (name) write(ctx, fit(ctx, name, 490 - chip, { size: 17 }), 30 + chip, 29, { size: 17, color: MID })

  const lit = Math.floor(Math.min(1, Math.max(0, snap.progress)) * SEGMENTS)
  const width = (544 - (SEGMENTS - 1) * 3) / SEGMENTS
  for (let index = 0; index < SEGMENTS; index++) {
    const x = 16 + index * (width + 3)
    ctx.fillStyle = index < lit ? FG : DIM
    ctx.fillRect(x, 46, width, 16)
    // Paused: lit segments go hollow, which reads even at 4-bit depth.
    if (index < lit && snap.state === 'paused') { ctx.fillStyle = OFF; ctx.fillRect(x + 2, 48, width - 4, 12) }
  }
}

function thermometer(ctx: Ctx, name: string, x: number, now: number, target: number, max: number): void {
  ctx.strokeStyle = MID
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, 104.5, 22, 84)
  const height = 80 * Math.min(1, Math.max(0, now / max))
  ctx.fillStyle = FG
  ctx.fillRect(x + 3, 186 - height, 17, height)
  if (target > 0) ctx.fillRect(x - 6, 186 - 80 * Math.min(1, target / max), 34, 2)
  write(ctx, `${Math.round(now)}°`, x + 11, 96, { size: 15, bold: true, align: 'center' })
  write(ctx, target > 0 ? `${name} ${Math.round(target)}` : name, x + 11, 208, { size: 12, color: MID, align: 'center' })
}

function panels(ctx: Ctx, data: Data, now: Date): void {
  const { snap } = data
  ctx.strokeStyle = DIM
  ctx.lineWidth = 1
  for (const [x, width] of [[16, 184], [212, 188], [412, 148]]) ctx.strokeRect(x + 0.5, 76.5, width, 140)

  const active = snap.state === 'printing' || snap.state === 'paused'
  if (active) {
    write(ctx, `${Math.floor(snap.progress * 100)}%`, 28, 150, { size: 68, bold: true })
    if (snap.layer != null && snap.totalLayers) write(ctx, `LAYER ${snap.layer}/${snap.totalLayers}`, 28, 190, { size: 15, color: MID })
  } else {
    write(ctx, snap.state === 'offline' ? 'N/C' : snap.state === 'complete' ? 'DONE' : 'IDLE', 28, 146, { size: 52, bold: true })
    write(ctx, snap.state === 'offline' ? 'NO MOONRAKER' : 'NO ACTIVE JOB', 28, 190, { size: 15, color: MID })
  }

  const left = remainingSeconds(snap)
  write(ctx, 'REMAINING', 224, 100, { size: 12, color: MID })
  write(ctx, left == null ? '--' : duration(left), 224, 144, { size: 40, bold: true })
  write(ctx, 'DONE AT', 224, 172, { size: 12, color: MID })
  write(ctx, left == null ? '--:--' : clock(new Date(now.getTime() + left * 1000)), 224, 202, { size: 24 })

  thermometer(ctx, 'NOZ', 436, snap.nozzle, snap.nozzleTarget, NOZZLE_MAX)
  thermometer(ctx, 'BED', 506, snap.bed, snap.bedTarget, BED_MAX)
}

function tabs(ctx: Ctx, labels: string[], cursor: number): void {
  if (!labels.length) return
  const width = (544 - (labels.length - 1) * 8) / labels.length
  labels.forEach((label, index) => {
    const x = 16 + index * (width + 8)
    if (index === cursor) {
      ctx.fillStyle = FG
      ctx.fillRect(x, 228, width, 30)
    } else {
      ctx.strokeStyle = MID
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, 228.5, width - 1, 29)
    }
    const style = { size: 14, bold: true, align: 'center' as const, color: index === cursor ? OFF : FG }
    write(ctx, fit(ctx, label, width - 10, style), x + width / 2, 249, style)
  })
}

function listing(ctx: Ctx, labels: string[], cursor: number, empty: string): void {
  if (!labels.length) { write(ctx, empty, 28, 110, { size: 20, color: MID }); return }
  const first = Math.min(Math.max(0, cursor - LIST_ROWS + 1), Math.max(0, labels.length - LIST_ROWS))
  labels.slice(first, first + LIST_ROWS).forEach((label, row) => {
    const y = 74 + row * 36
    const selected = first + row === cursor
    if (selected) { ctx.fillStyle = FG; ctx.fillRect(16, y, 544, 32) }
    const style = { size: 19, bold: selected, color: selected ? OFF : FG }
    write(ctx, fit(ctx, label, 470, style), 28, y + 23, style)
  })
  write(ctx, `${cursor + 1}/${labels.length}`, 560, 277, { size: 13, align: 'right', color: MID })
}

function modal(ctx: Ctx, lines: string[], busy: boolean): void {
  ctx.fillStyle = OFF
  ctx.fillRect(68, 62, 440, 170)
  ctx.strokeStyle = FG
  ctx.lineWidth = 2
  ctx.strokeRect(72, 66, 432, 162)
  ctx.lineWidth = 1
  ctx.strokeRect(77.5, 71.5, 421, 151)
  const [title = '', ...detail] = lines
  write(ctx, fit(ctx, title, 400, { size: 28, bold: true }), 288, 108, { size: 28, bold: true, align: 'center' })
  detail.slice(0, 2).forEach((line, index) =>
    write(ctx, fit(ctx, line, 400, { size: 16 }), 288, 134 + index * 21, { size: 16, color: MID, align: 'center' }))
  if (busy) { write(ctx, 'SENDING…', 288, 203, { size: 20, bold: true, align: 'center' }); return }
  ctx.fillStyle = FG
  ctx.fillRect(108, 178, 172, 36)
  write(ctx, 'TAP  YES', 194, 203, { size: 17, bold: true, align: 'center', color: OFF })
  ctx.strokeStyle = MID
  ctx.strokeRect(296.5, 178.5, 171, 35)
  write(ctx, '2×  NO', 382, 203, { size: 17, bold: true, align: 'center' })
}

export function drawFrame(screen: Screen, data: Data, now = new Date()): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')
  ctx.fillStyle = OFF
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const words = text(screen, data)
  chrome(ctx, data, now)
  // The confirm modal sits on top of whatever screen asked for it.
  const under = screen.kind === 'confirm' ? screen.from : screen
  if (under.kind === 'home') {
    panels(ctx, data, now)
    tabs(ctx, itemsFor(under, data).map(item => item.label), under.cursor)
  } else if (under.kind === 'jobs' || under.kind === 'preheat') {
    listing(ctx, itemsFor(under, data).map(item => item.label), under.cursor,
      under.kind === 'jobs' ? 'No gcode files found.' : 'Nothing available.')
  } else if (under.kind === 'spool') {
    const [title = '', ...rest] = words.body.split('\n')
    write(ctx, fit(ctx, title, 520, { size: 30, bold: true }), 28, 116, { size: 30, bold: true })
    rest.forEach((line, index) => write(ctx, fit(ctx, line, 520, { size: 20 }), 28, 152 + index * 30, { size: 20, color: index ? FG : MID }))
  }
  if (screen.kind === 'confirm') modal(ctx, words.body.split('\n'), data.busy)
  else write(ctx, words.footer.replace(/\s+\/\s+/g, '  ·  '), 288, 277, { size: 13, color: data.toast ? FG : MID, align: 'center' })
  if (screen.kind === 'confirm' && data.toast) write(ctx, data.toast, 288, 277, { size: 13, align: 'center' })
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
