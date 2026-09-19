import { waitForEvenAppBridge, OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk'
import { Moonraker, MockPrinter, OFFLINE, type Printer } from './moonraker'
import { Display } from './display'
import { drawDashboard, loadFonts, tiles } from './cockpit'
import { CONSOLE_ROWS } from './layout'
import { back, clampCursor, consoleText, scroll, tap, text, type Data, type Screen } from './ui'

// ?mock=1 | ?mock=idle → simulated printer. ?moonraker=http://host:7125 → direct
// (needs the page origin allowed by Moonraker CORS). Default: Vite proxy at /mr.
// Dev server only: mirror console output to the vite terminal (see vite.config.ts).
if (import.meta.env.DEV) {
  for (const level of ['info', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      void fetch('/__log', { method: 'POST', body: `${level}: ${args.map(arg => arg instanceof Error ? `${arg.message} ${arg.stack ?? ''}` : String(arg)).join(' ')}` }).catch(() => {})
    }
  }
  addEventListener('error', event => console.error('uncaught', event.message))
  addEventListener('unhandledrejection', event => console.error('unhandled', event.reason))
  console.info(`boot ${navigator.userAgent}`)
}

const params = new URLSearchParams(location.search)
const mock = params.get('mock')
const base = params.get('moonraker') ?? localStorage.getItem('moonraker') ?? '/mr'
if (params.get('moonraker')) localStorage.setItem('moonraker', base)
const printer: Printer = mock ? new MockPrinter(mock) : new Moonraker(base.replace(/\/$/, ''))

const bridge = await waitForEvenAppBridge()
await loadFonts()
const display = new Display(bridge)
const data: Data = { snap: OFFLINE, jobs: [], spool: null, macros: [], toast: '', busy: false }
let screen: Screen = { kind: 'home', cursor: 0 }
let stopped = false
let background = false
let exitPending = false
let poll: ReturnType<typeof setTimeout> | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined
let lastScroll = -Infinity
let shownState = ''
let lastLifecycle: { type: OsEventTypeList; time: number } | undefined
let queue = Promise.resolve()
let unsubscribe = () => {}

function render(afterExit = false): Promise<void> {
  clampCursor(screen, data)
  const content = text(screen, data)
  // A printer state change must show at once; everything else can wait its turn.
  const urgent = data.snap.state !== shownState
  shownState = data.snap.state
  return afterExit ? display.restoreAfterExit(content)
    : display.render(content, consoleText(screen, data, CONSOLE_ROWS), () => tiles(drawDashboard(data)), urgent)
}

// One queue serializes every bridge write, including slow image sends.
function enqueue(work: () => Promise<void>): void {
  queue = queue.then(async () => { if (!stopped) await work() }).catch(error => {
    console.error('KlipKommander:', error)
  })
}

function toast(message: string): void {
  data.toast = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { data.toast = ''; enqueue(() => render()) }, 4000)
}

async function refresh(): Promise<void> {
  const before = data.snap.state
  try {
    data.snap = await printer.snapshot()
  } catch {
    data.snap = OFFLINE
  }
  // A job that starts or ends changes which actions make sense; never leave
  // a confirm dialog armed across a printer state change.
  if (screen.kind === 'confirm' && !data.busy && before !== data.snap.state) {
    screen = { kind: 'home', cursor: 0 }
  }
}

function schedulePoll(): void {
  clearTimeout(poll)
  poll = setTimeout(async () => {
    if (stopped) return
    if (!background && !exitPending) {
      await refresh()
      enqueue(() => render())
    }
    schedulePoll()
  }, 2000)
}

function stop(): void {
  stopped = true
  clearTimeout(poll)
  clearTimeout(toastTimer)
  unsubscribe()
}

async function confirmAction(): Promise<void> {
  if (screen.kind !== 'confirm' || data.busy) return
  const { action, from } = screen
  data.busy = true
  enqueue(() => render())
  try {
    console.info(`KlipKommander ACTION: ${action.title} ${action.detail[0] ?? ''}`)
    await action.run(printer)
    toast(action.done)
  } catch (error) {
    toast(`FAILED: ${error instanceof Error ? error.message : error}`.slice(0, 48))
  }
  data.busy = false
  screen = from.kind === 'jobs' ? { kind: 'home', cursor: 0 } : from
  await refresh()
  enqueue(() => render())
}

async function open(): Promise<void> {
  if (screen.kind === 'confirm') return confirmAction()
  const next = await tap(screen, data, job => printer.jobMeta(job.path))
  if (next === screen) return
  screen = next
  enqueue(() => render())
  // Lazy loads: only fetch lists when their screen is opened.
  try {
    if (next.kind === 'jobs') data.jobs = await printer.jobs()
    if (next.kind === 'spool') data.spool = await printer.spool()
    if (next.kind === 'preheat' && !data.macros.length) data.macros = await printer.macros()
  } catch (error) {
    toast(`LOAD FAILED: ${error instanceof Error ? error.message : error}`.slice(0, 48))
  }
  enqueue(() => render())
}

// CLICK_EVENT is 0, and protobuf omits zero-value fields on the wire.
// Resolve its default INSIDE the envelope check. Otherwise absent sysEvent
// would turn every scroll, exit, or audio frame into a click.
function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

function onEvent(event: EvenHubEvent): void {
  const sysType = eventTypeOf(event.sysEvent)
  const types = [sysType, eventTypeOf(event.textEvent), eventTypeOf(event.listEvent)]

  if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    stop()
    return
  }
  if (sysType === OsEventTypeList.FOREGROUND_ENTER_EVENT || sysType === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
    const now = Date.now()
    if (lastLifecycle?.type === sysType && now - lastLifecycle.time < 600) return
    lastLifecycle = { type: sysType, time: now }
    // The host inverts foreground events while its exit dialogue is open.
    if (exitPending) {
      if (sysType === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
        exitPending = false
        background = false
        enqueue(() => render(true))
      }
      return
    }
    background = sysType === OsEventTypeList.FOREGROUND_EXIT_EVENT
    // Returning from background must never land on an armed confirm dialog.
    if (!background) {
      if (screen.kind === 'confirm') screen = screen.from
      enqueue(() => render())
    }
    return
  }
  if (stopped || background || exitPending) return

  // Double-tap BEFORE click, in every envelope: back, or exit at root.
  if (types.includes(OsEventTypeList.DOUBLE_CLICK_EVENT)) {
    if (data.busy) return
    const previous = back(screen)
    if (previous) {
      screen = previous
      enqueue(() => render())
    } else {
      exitPending = true // Set synchronously before any host lifecycle event.
      enqueue(async () => {
        try {
          if (!await bridge.shutDownPageContainer(1)) throw new Error('Exit dialogue rejected')
        } catch (error) {
          exitPending = false
          throw error
        }
      })
    }
    return
  }

  // Hardware scrolls arrive in textEvent; the simulator can use sysEvent.
  const scrollType = types.find(type => type === OsEventTypeList.SCROLL_TOP_EVENT || type === OsEventTypeList.SCROLL_BOTTOM_EVENT)
  if (scrollType !== undefined) {
    const now = Date.now()
    if (now - lastScroll < 300) return
    lastScroll = now
    scroll(screen, data, scrollType === OsEventTypeList.SCROLL_BOTTOM_EVENT ? 1 : -1)
    enqueue(() => render())
    return
  }
  if (types.includes(OsEventTypeList.CLICK_EVENT)) void open()
}

await refresh()
enqueue(async () => {
  await render()
  const app = document.getElementById('app')
  if (app) app.textContent = `KlipKommander — ${mock ? 'MOCK printer' : `Moonraker at ${base}`}. Scroll to select, tap to open, every action asks to confirm.`
  console.info(`KlipKommander ready (${mock ? `mock=${mock}` : base}), state=${data.snap.state}`)
})
unsubscribe = bridge.onEvenHubEvent(onEvent)
schedulePoll()
window.addEventListener('pagehide', stop, { once: true })
