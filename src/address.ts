// Turns whatever the user typed (a Moonraker, Mainsail or Fluidd address, with
// or without scheme, port or UI path) into Moonraker base URLs worth trying.
// Pure: no DOM, no network. Check: `node src/address.test.ts`.

export function normalise(input: string): string {
  const typed = input.trim()
  if (!typed) return ''
  const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `http://${typed}`)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Use an http:// or https:// address')
  // Mainsail/Fluidd links carry a UI route (/#/console, /dashboard); Moonraker lives at the root.
  const path = url.pathname.replace(/\/+$/, '')
  return url.origin + (/^\/(mr|moonraker|api)(\/|$)/.test(path) ? path : '')
}

// The address as given first; if it names no port, Moonraker's own 7125 second.
export function candidates(input: string): string[] {
  const base = normalise(input)
  if (!base) return []
  const url = new URL(base)
  return url.port || url.pathname !== '/' ? [base] : [base, `${url.protocol}//${url.hostname}:7125`]
}
