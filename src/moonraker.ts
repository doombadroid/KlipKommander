// Moonraker client. Everything the UI needs goes through the Printer interface
// so the mock can stand in for real hardware during simulator testing.

export type PrintState = 'standby' | 'printing' | 'paused' | 'complete' | 'cancelled' | 'error' | 'offline'

export interface Snapshot {
  state: PrintState
  klippy: string
  filename: string
  progress: number // 0..1
  printSeconds: number
  layer: number | null
  totalLayers: number | null
  nozzle: number
  nozzleTarget: number
  bed: number
  bedTarget: number
  message: string
}

export interface Job { path: string; modified: number }
export interface JobMeta { estimatedSeconds: number | null; filamentGrams: number | null; material: string | null }
export interface Spool {
  connected: boolean
  spoolId: number | null
  name: string
  material: string
  vendor: string
  remainingGrams: number | null
  usedGrams: number | null
  remainingMeters: number | null
}

export interface Printer {
  snapshot(): Promise<Snapshot>
  jobs(): Promise<Job[]>
  jobMeta(path: string): Promise<JobMeta>
  spool(): Promise<Spool>
  macros(): Promise<string[]>
  start(path: string): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  cancel(): Promise<void>
  gcode(script: string): Promise<void>
}

export const OFFLINE: Snapshot = {
  state: 'offline', klippy: 'unreachable', filename: '', progress: 0, printSeconds: 0,
  layer: null, totalLayers: null, nozzle: 0, nozzleTarget: 0, bed: 0, bedTarget: 0, message: '',
}

export class Moonraker implements Printer {
  constructor(private base: string, private apiKey = '') {}

  private async call<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(this.base + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.apiKey ? { 'X-Api-Key': this.apiKey } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(method === 'GET' ? 4000 : 15000),
    })
    const json = await response.json().catch(() => null)
    if (!response.ok) throw new Error(json?.error?.message ?? `HTTP ${response.status}`)
    return json.result as T
  }

  async snapshot(): Promise<Snapshot> {
    const info = await this.call<{ klippy_state: string }>('/server/info')
    if (info.klippy_state !== 'ready') return { ...OFFLINE, state: 'error', klippy: info.klippy_state }
    const { status } = await this.call<{ status: any }>(
      '/printer/objects/query?print_stats&virtual_sdcard&heater_bed&extruder&display_status')
    const stats = status.print_stats
    return {
      state: stats.state,
      klippy: info.klippy_state,
      filename: stats.filename ?? '',
      // Slicer-reported M73 progress when present, else file position.
      progress: status.display_status?.progress || status.virtual_sdcard?.progress || 0,
      printSeconds: stats.print_duration ?? 0,
      layer: stats.info?.current_layer ?? null,
      totalLayers: stats.info?.total_layer ?? null,
      nozzle: status.extruder.temperature,
      nozzleTarget: status.extruder.target,
      bed: status.heater_bed.temperature,
      bedTarget: status.heater_bed.target,
      message: stats.message || status.display_status?.message || '',
    }
  }

  async jobs(): Promise<Job[]> {
    const files = await this.call<Job[]>('/server/files/list?root=gcodes')
    return files.sort((a, b) => b.modified - a.modified).slice(0, 20)
  }

  async jobMeta(path: string): Promise<JobMeta> {
    const meta = await this.call<any>(`/server/files/metadata?filename=${encodeURIComponent(path)}`)
    return {
      estimatedSeconds: meta.estimated_time ?? null,
      filamentGrams: meta.filament_weight_total ?? null,
      material: meta.filament_type ?? null,
    }
  }

  async spool(): Promise<Spool> {
    const status = await this.call<{ spoolman_connected: boolean; spool_id: number | null }>('/server/spoolman/status')
    const empty: Spool = {
      connected: status.spoolman_connected, spoolId: status.spool_id, name: '', material: '', vendor: '',
      remainingGrams: null, usedGrams: null, remainingMeters: null,
    }
    if (!status.spoolman_connected || status.spool_id == null) return empty
    const proxied = await this.call<{ response: any; error: any }>('/server/spoolman/proxy', 'POST', {
      request_method: 'GET', path: `/v1/spool/${status.spool_id}`, use_v2_response: true,
    })
    if (proxied.error || !proxied.response) return empty
    const spool = proxied.response
    return {
      ...empty,
      name: spool.filament?.name ?? '',
      material: spool.filament?.material ?? '',
      vendor: spool.filament?.vendor?.name ?? '',
      remainingGrams: spool.remaining_weight ?? null,
      usedGrams: spool.used_weight ?? null,
      remainingMeters: spool.remaining_length != null ? spool.remaining_length / 1000 : null,
    }
  }

  async macros(): Promise<string[]> {
    return Object.keys(await this.call<Record<string, string>>('/printer/gcode/help'))
  }

  async start(path: string) { await this.call(`/printer/print/start?filename=${encodeURIComponent(path)}`, 'POST') }
  async pause() { await this.call('/printer/print/pause', 'POST') }
  async resume() { await this.call('/printer/print/resume', 'POST') }
  async cancel() { await this.call('/printer/print/cancel', 'POST') }
  async gcode(script: string) { await this.call('/printer/gcode/script', 'POST', { script }) }
}

// Simulated printer: `?mock=1` starts mid-print, `?mock=idle` starts in standby.
// Actions only mutate this object, so the full UI can be exercised safely.
export class MockPrinter implements Printer {
  private state: PrintState
  private filename: string
  private progress: number
  private bedTarget = 0
  private nozzleTarget = 0
  private bed = 25
  private nozzle = 27
  private last = Date.now()
  readonly log: string[] = []

  constructor(mode: string) {
    const printing = mode !== 'idle'
    this.state = printing ? 'printing' : 'standby'
    this.filename = printing ? 'RimHanger-Body_ABS_5h40m.gcode' : ''
    this.progress = printing ? 0.41 : 0
    if (printing) { this.bedTarget = 100; this.nozzleTarget = 250; this.bed = 100; this.nozzle = 250 }
  }

  private tick() {
    const seconds = (Date.now() - this.last) / 1000
    this.last = Date.now()
    if (this.state === 'printing') this.progress = Math.min(1, this.progress + seconds * 0.004)
    if (this.progress >= 1 && this.state === 'printing') this.state = 'complete'
    this.bed += (Math.max(this.bedTarget, 25) - this.bed) * Math.min(1, seconds * 0.15)
    this.nozzle += (Math.max(this.nozzleTarget, 27) - this.nozzle) * Math.min(1, seconds * 0.25)
  }

  async snapshot(): Promise<Snapshot> {
    this.tick()
    return {
      state: this.state, klippy: 'ready', filename: this.filename, progress: this.progress,
      printSeconds: this.progress * 20400, layer: Math.round(this.progress * 212), totalLayers: 212,
      nozzle: this.nozzle, nozzleTarget: this.nozzleTarget, bed: this.bed, bedTarget: this.bedTarget, message: '',
    }
  }
  async jobs(): Promise<Job[]> {
    return ['RimHanger-Body_ABS_5h40m.gcode', 'G2B_sizer_front_ABS_40m55s.gcode', 'centering block_ABS_1m41s.gcode',
      'fan-guide-front_ABS_4h37m.gcode', 'benchy_PLA_48m.gcode', 'spool-clip_PETG_22m.gcode']
      .map((path, index) => ({ path, modified: 1000 - index }))
  }
  async jobMeta(): Promise<JobMeta> { return { estimatedSeconds: 20400, filamentGrams: 142.5, material: 'ABS' } }
  async spool(): Promise<Spool> {
    return { connected: true, spoolId: 4, name: 'Galaxy Black', material: 'ABS', vendor: 'Polymaker',
      remainingGrams: 612, usedGrams: 388, remainingMeters: 231 }
  }
  async macros(): Promise<string[]> { return ['PREHEAT_PLA', 'PREHEAT_PETG', 'PREHEAT_ABS', 'PREHEAT_OFF', 'TURN_OFF_HEATERS'] }
  async start(path: string) {
    this.log.push(`start ${path}`)
    this.state = 'printing'; this.filename = path; this.progress = 0; this.bedTarget = 100; this.nozzleTarget = 250
  }
  async pause() { this.log.push('pause'); this.state = 'paused' }
  async resume() { this.log.push('resume'); this.state = 'printing' }
  async cancel() { this.log.push('cancel'); this.state = 'cancelled'; this.bedTarget = 0; this.nozzleTarget = 0 }
  async gcode(script: string) {
    this.log.push(`gcode ${script}`)
    const bed = script.match(/HEATER=heater_bed TARGET=(\d+)/)
    if (bed) this.bedTarget = Number(bed[1])
    if (script === 'PREHEAT_ABS') { this.bedTarget = 100; this.nozzleTarget = 150 }
    if (script === 'PREHEAT_PETG') { this.bedTarget = 80; this.nozzleTarget = 150 }
    if (script === 'PREHEAT_PLA') { this.bedTarget = 60; this.nozzleTarget = 150 }
    if (script === 'TURN_OFF_HEATERS' || script === 'PREHEAT_OFF') { this.bedTarget = 0; this.nozzleTarget = 0 }
  }
}
