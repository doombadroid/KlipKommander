// Screen state machine. Pure: turns (state, data) into text for the fixed
// containers, and gestures into the next state or an action to confirm.
import type { Job, JobMeta, Snapshot, Spool, Printer } from './moonraker'

export interface Action { title: string; detail: string[]; done: string; run: (printer: Printer) => Promise<void> }
interface Item { label: string; open?: Screen['kind']; action?: Action; job?: Job }

export type Screen =
  | { kind: 'home'; cursor: number }
  | { kind: 'jobs'; cursor: number }
  | { kind: 'preheat'; cursor: number }
  | { kind: 'spool' }
  | { kind: 'confirm'; action: Action; from: Screen }

export interface Data { snap: Snapshot; jobs: Job[]; spool: Spool | null; macros: string[]; toast: string; busy: boolean }
export interface Text { header: string; stats: string; body: string; footer: string }

const ROWS = 4
export const clip = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text
export const jobName = (path: string) => path.replace(/\.gcode$/i, '').split('/').pop() ?? path
const temp = (now: number, target: number) => `${Math.round(now)}/${Math.round(target)}°`

export function duration(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60))
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`
}

// Seconds left, or null while there is not enough progress to extrapolate from.
export function remainingSeconds(snap: Snapshot): number | null {
  if (snap.state !== 'printing' || snap.progress < 0.01 || snap.printSeconds < 30) return null
  return snap.printSeconds / snap.progress - snap.printSeconds
}

function eta(snap: Snapshot): string {
  const seconds = remainingSeconds(snap)
  return seconds == null ? '' : duration(seconds)
}

const simple = (title: string, script: string, done: string): Action =>
  ({ title, detail: [script], done, run: printer => printer.gcode(script) })

function homeItems(data: Data): Item[] {
  const { state } = data.snap
  const spool: Item = { label: 'SPOOL', open: 'spool' }
  if (state === 'offline' || state === 'error') return [spool]
  if (state === 'printing') return [
    { label: 'PAUSE PRINT', action: { title: 'PAUSE PRINT?', detail: [jobName(data.snap.filename)], done: 'Pausing', run: p => p.pause() } },
    { label: 'CANCEL PRINT', action: { title: 'CANCEL PRINT?', detail: [jobName(data.snap.filename), 'This cannot be undone.'], done: 'Cancelling', run: p => p.cancel() } },
    spool,
  ]
  if (state === 'paused') return [
    { label: 'RESUME PRINT', action: { title: 'RESUME PRINT?', detail: [jobName(data.snap.filename)], done: 'Resuming', run: p => p.resume() } },
    { label: 'CANCEL PRINT', action: { title: 'CANCEL PRINT?', detail: [jobName(data.snap.filename), 'This cannot be undone.'], done: 'Cancelling', run: p => p.cancel() } },
    spool,
  ]
  const items: Item[] = [{ label: 'START A JOB', open: 'jobs' }, { label: 'PREHEAT', open: 'preheat' }, spool]
  if (data.snap.bedTarget > 0 || data.snap.nozzleTarget > 0) {
    items.push({ label: 'HEATERS OFF', action: simple('HEATERS OFF?', 'TURN_OFF_HEATERS', 'Heaters off') })
  }
  return items
}

function preheatItems(data: Data): Item[] {
  const bed = (target: number): Item => ({
    label: `BED ${target}°`,
    action: simple(`HEAT BED TO ${target}°?`, `SET_HEATER_TEMPERATURE HEATER=heater_bed TARGET=${target}`, `Bed → ${target}°`),
  })
  const macros = data.macros.filter(name => /^PREHEAT_/.test(name) && name !== 'PREHEAT_OFF').sort()
    .map((name): Item => ({ label: name.replace('PREHEAT_', '') + ' PROFILE', action: simple(`RUN ${name}?`, name, `${name} sent`) }))
  return [bed(60), bed(80), bed(100), ...macros,
    { label: 'HEATERS OFF', action: simple('HEATERS OFF?', 'TURN_OFF_HEATERS', 'Heaters off') }]
}

function jobItems(data: Data): Item[] {
  return data.jobs.map(job => ({ label: clip(jobName(job.path), 44), job }))
}

export function itemsFor(screen: Screen, data: Data): Item[] {
  if (screen.kind === 'home') return homeItems(data)
  if (screen.kind === 'jobs') return jobItems(data)
  if (screen.kind === 'preheat') return preheatItems(data)
  return []
}

function list(items: Item[], cursor: number, empty: string, rows: number): string {
  if (!items.length) return empty
  const first = Math.min(Math.max(0, cursor - rows + 1), Math.max(0, items.length - rows))
  return items.slice(first, first + rows)
    .map((item, index) => `${first + index === cursor ? '>' : '  '} ${item.label}`).join('\n')
}

export function clampCursor(screen: Screen, data: Data): void {
  if (!('cursor' in screen)) return
  screen.cursor = Math.min(screen.cursor, Math.max(0, itemsFor(screen, data).length - 1))
}

export function text(screen: Screen, data: Data, rows = ROWS): Text {
  const { snap } = data
  const active = snap.state === 'printing' || snap.state === 'paused'
  const header = snap.state === 'offline' ? 'PRINTER OFFLINE'
    : snap.state === 'error' ? `KLIPPER ${snap.klippy.toUpperCase()}`
    : active || snap.state === 'complete' ? `${snap.state.toUpperCase()}  /  ${clip(jobName(snap.filename), 34)}`
    : snap.state.toUpperCase()
  const layers = snap.layer != null && snap.totalLayers ? `  L ${snap.layer}/${snap.totalLayers}` : ''
  const remaining = eta(snap)
  const stats = [
    active ? `${Math.floor(snap.progress * 100)}%${layers}${remaining ? `  ETA ${remaining}` : ''}` : 'NO ACTIVE JOB',
    `NOZZLE ${temp(snap.nozzle, snap.nozzleTarget)}   BED ${temp(snap.bed, snap.bedTarget)}`,
  ].join('\n')

  let body: string
  let footer = '↑↓ SELECT  /  TAP OPEN  /  2× BACK'
  if (screen.kind === 'confirm') {
    body = [screen.action.title, ...screen.action.detail.map(line => clip(line, 46))].join('\n')
    footer = data.busy ? 'SENDING…' : 'TAP = YES   /   2× = NO'
  } else if (screen.kind === 'spool') {
    const spool = data.spool
    body = !spool ? 'Loading spool…'
      : !spool.connected ? `SPOOLMAN OFFLINE\nActive spool id ${spool.spoolId ?? 'none'}\nMoonraker cannot reach Spoolman.`
      : spool.spoolId == null ? 'NO ACTIVE SPOOL\nSelect one in Mainsail.'
      : [`SPOOL #${spool.spoolId}  /  ${spool.material}`, clip(`${spool.vendor} ${spool.name}`.trim(), 46),
        `LEFT ${Math.round(spool.remainingGrams ?? 0)} g${spool.remainingMeters != null ? `  /  ${Math.round(spool.remainingMeters)} m` : ''}`,
        `USED ${Math.round(spool.usedGrams ?? 0)} g`].join('\n')
    footer = '2× BACK'
  } else {
    body = list(itemsFor(screen, data), screen.cursor, screen.kind === 'jobs' ? 'No gcode files found.' : 'Nothing available.', rows)
    if (screen.kind === 'home') footer = '↑↓ SELECT  /  TAP OPEN  /  2× EXIT'
  }
  if (data.toast) footer = data.toast
  return { header, stats, body, footer }
}

// The cockpit's text console: `rows` lines under the image dashboard. Same
// content as text(), minus the hint footer (a toast or the confirm prompt
// takes the last line when there is one).
export function consoleText(screen: Screen, data: Data, rows: number): string {
  const words = text(screen, data, rows)
  const lines = words.body.split('\n').slice(0, rows)
  if (screen.kind === 'confirm') return [...lines.slice(0, rows - 1), words.footer].join('\n')
  if (data.toast) lines[rows - 1] = data.toast
  return Array.from({ length: rows }, (_, index) => lines[index] ?? '').join('\n')
}

export function scroll(screen: Screen, data: Data, direction: 1 | -1): void {
  if (!('cursor' in screen)) return
  const count = itemsFor(screen, data).length
  if (count) screen.cursor = (screen.cursor + direction + count) % count
}

// Returns the next screen; every hardware action passes through 'confirm'.
export function tap(screen: Screen, data: Data, meta: (job: Job) => Promise<JobMeta>): Screen | Promise<Screen> {
  if (screen.kind === 'confirm' || screen.kind === 'spool') return screen
  const item = itemsFor(screen, data)[screen.cursor]
  if (!item) return screen
  if (item.open === 'spool') return { kind: 'spool' }
  if (item.open) return { kind: item.open, cursor: 0 } as Screen
  if (item.action) return { kind: 'confirm', action: item.action, from: screen }
  if (item.job) {
    const job = item.job
    return meta(job).catch((): JobMeta => ({ estimatedSeconds: null, filamentGrams: null, material: null })).then(info => ({
      kind: 'confirm', from: screen,
      action: {
        title: 'START PRINT?',
        detail: [jobName(job.path), [info.material, info.estimatedSeconds != null ? duration(info.estimatedSeconds) : null,
          info.filamentGrams != null ? `${Math.round(info.filamentGrams)} g` : null].filter(Boolean).join('  /  ')],
        done: 'Print started', run: printer => printer.start(job.path),
      },
    }))
  }
  return screen
}

export function back(screen: Screen): Screen | null {
  if (screen.kind === 'home') return null
  if (screen.kind === 'confirm') return screen.from
  return { kind: 'home', cursor: 0 }
}
