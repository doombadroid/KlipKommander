// Phone-side control panel: where is the printer, and is it reachable?
import { candidates } from './address'
import manifest from '../app.json'

// An installed .ehpk can only reach origins listed in app.json at pack time
// (Even Hub rule: exact origins, no wildcards, nothing added at runtime).
const allowed: string[] = manifest.permissions.find(permission => permission.name === 'network')?.whitelist ?? []
const installed = location.protocol !== 'http:' // dev and self-hosted copies are plain http on the LAN

export interface Connection { address: string; apiKey: string }
export interface ProbeResult { base: string; klippy: string; version: string }

const field = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

async function probe(base: string, apiKey: string): Promise<ProbeResult> {
  const response = await fetch(`${base}/server/info`, {
    headers: apiKey ? { 'X-Api-Key': apiKey } : undefined, signal: AbortSignal.timeout(4000),
  })
  if (response.status === 401) throw new Error('Moonraker wants an API key (or add this phone to trusted_clients).')
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${base}`)
  const result = (await response.json()).result
  if (!result?.klippy_state) throw new Error(`${base} answered, but not like Moonraker.`)
  return { base, klippy: result.klippy_state, version: result.moonraker_version ?? '' }
}

// Empty address = the proxy that served this page (or the URL baked into a packaged build).
export async function connect(connection: Connection, fallback: string): Promise<ProbeResult> {
  const bases = connection.address.trim() ? candidates(connection.address) : [fallback]
  let last: unknown
  for (const base of bases) {
    try { return await probe(base, connection.apiKey) } catch (error) { last = error }
  }
  // fetch() hides the reason for a network failure; these are the usual ones.
  if (last instanceof TypeError && installed && !allowed.includes(new URL(bases[0]).origin)) {
    throw new Error(`This installed build may only talk to: ${allowed.map(origin => origin.replace('http://', '')).join(', ')}. `
      + 'Give your printer one of those names on your network (see README), or pack your own build with your address in app.json.')
  }
  if (last instanceof TypeError) {
    throw new Error(`Could not reach ${bases[0]}. Check the address and that this phone is on the printer's network. `
      + `If the address is right, Moonraker is refusing this page: add ${location.origin} to cors_domains in moonraker.conf.`)
  }
  throw last
}

export function showStatus(printer: string, glasses: string): void {
  field('printer-state').textContent = printer
  field('glasses-state').textContent = glasses
}

export function initSettings(current: Connection, fallback: string, onSave: (connection: Connection, base: string) => Promise<void>): void {
  const address = field<HTMLInputElement>('address')
  const apiKey = field<HTMLInputElement>('apikey')
  const result = field('result')
  const buttons = [field<HTMLButtonElement>('test'), field<HTMLButtonElement>('save')]
  address.value = current.address
  apiKey.value = current.apiKey

  const run = async (save: boolean) => {
    const connection = { address: address.value.trim(), apiKey: apiKey.value.trim() }
    buttons.forEach(button => { button.disabled = true })
    result.className = ''
    result.textContent = 'Connecting…'
    try {
      const found = await connect(connection, fallback)
      if (save) await onSave(connection, found.base)
      result.className = 'ok'
      result.textContent = `${save ? 'Saved. ' : ''}Connected to ${found.base} · Klippy ${found.klippy}${found.version ? ` · Moonraker ${found.version}` : ''}`
    } catch (error) {
      result.className = 'bad'
      result.textContent = error instanceof Error ? error.message : String(error)
    } finally {
      buttons.forEach(button => { button.disabled = false })
    }
  }
  field('test').addEventListener('click', () => void run(false))
  field<HTMLFormElement>('settings').addEventListener('submit', event => { event.preventDefault(); void run(true) })
}
