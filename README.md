<p align="center"><img src="klipkommander.gif" alt="I am the Klip Commander!"></p>

# KlipKommander

Run your Klipper printer from Even Realities G2 glasses. Talks to Moonraker, shows the print on the lens, and lets you start, preheat, pause, resume and cancel with the temple touchpad.

![Printing screen](shots/mock-printing.png)

- Print state, progress bar, percent, layer, ETA, nozzle and bed temps (2 s poll)
- Start any of the 20 newest gcode files already on the printer; the confirm screen shows material, time and grams
- Preheat: bed 60 / 80 / 100, any `PREHEAT_*` macros it finds in your config, heaters off
- Pause, resume, cancel
- Active Spoolman spool: material, vendor, grams and metres left
- **Every hardware action asks first.** Tap = yes, double-tap = no. The confirm is thrown away if the printer state changes or the app comes back from the background.

Vite + TypeScript on the stock Even Hub SDK. No other runtime dependencies.

## LAN only. Seriously.

A 3D printer is a heater with a network port. KlipKommander has no login, no API key support and no TLS: it relies on Moonraker's `trusted_clients`, which means **anyone who can reach it can heat your bed and start a print**. A public printer is a house fire with extra steps.

- Do not port-forward Moonraker or the dev server. Do not put either behind a public reverse proxy or tunnel.
- Keep `trusted_clients` to your own subnets.
- Away from home? Use a VPN into your LAN (WireGuard, Tailscale), not an open port.
- Don't start prints you can't physically check on. The glasses make it easy; that doesn't make it wise.

## No warranty

MIT licensed, provided as is, no warranty of any kind. It sends real commands to a machine that gets hot and moves. If it melts your hotend, ruins a print, or burns your house down, that is on you. See [LICENSE](LICENSE).

## Setup

You need Node 20+, a printer running Klipper (or Kalico) with Moonraker, and a machine on the same LAN to host the app. The printer host itself is fine.

### 1. Get it

```sh
git clone https://github.com/doombadroid/KlipKommander.git
cd KlipKommander
npm install
```

### 2. Try it against a fake printer

Nothing here touches hardware.

```sh
npx vite                                                         # serves on :5184
npx evenhub-simulator 'http://localhost:5184/?mock=1'            # simulated print in progress
npx evenhub-simulator 'http://localhost:5184/?mock=idle'         # simulated idle printer
```

In the simulator: scroll = move the cursor, click = open, double-click = back (exit from the home screen). Actions are logged to the console as `KlipKommander ACTION: ...`.

### 3. Point it at your printer

The dev server proxies `/mr` to Moonraker, so the page stays same-origin and needs no CORS setup.

```sh
npx vite                                     # Moonraker on the same machine (127.0.0.1:7125)
MOONRAKER=http://192.168.1.50:7125 npx vite  # Moonraker somewhere else on the LAN
```

Open `http://localhost:5184/` in the simulator **without** `?mock`. You are now live: a tap on a confirm screen really heats, starts or cancels. Read-only browsing (home, job list, spool) is safe.

Alternative without the proxy: `http://localhost:5184/?moonraker=http://192.168.1.50:7125`. The URL is remembered in localStorage. Moonraker has to allow the origin: a trusted-client IP is enough on a LAN, otherwise add it to `cors_domains`.

Moonraker must trust whichever machine makes the requests:

```ini
# moonraker.conf
[authorization]
trusted_clients:
    192.168.1.0/24   # your LAN, nothing wider
```

### 4. Put it on the glasses

Your phone and the machine running `npx vite` must be on the same Wi-Fi.

```sh
npx evenhub qr --url http://<that-machine's-LAN-IP>:5184/
```

Scan the QR code from the Even app's developer / Even Hub section. The app loads the page from your dev server, which has to keep running while you use it.

Status: this path is untested. The author is still waiting on hardware, so everything so far was verified in the simulator. Expect rough edges and please report them.

### 5. Spoolman (optional)

Configure `[spoolman]` in `moonraker.conf` as usual and pick an active spool in Mainsail or Fluidd. The SPOOL screen reads it through Moonraker. Without Spoolman the screen just says so.

### Packaging as `.ehpk`

`npm run pack` builds one, but a packaged app has no dev-server proxy. It needs a `network` permission entry in `app.json` and the `?moonraker=` direct mode, and mixed-content rules may get in the way. Not done yet.

## Controls

| Gesture | Does |
|---|---|
| Scroll | Move the cursor |
| Tap | Open / confirm YES |
| Double-tap | Back / confirm NO / exit from home |

## Layout

| File | Role |
|---|---|
| `src/moonraker.ts` | `Printer` interface, Moonraker HTTP client, mock printer |
| `src/ui.ts` | Pure screen state machine: home, jobs, preheat, spool, confirm |
| `src/display.ts` | Text containers with diffed updates, image fallback |
| `src/bar.ts` | Progress bar as two image halves (images max out at 288 px wide) |
| `src/main.ts` | Poll loop, gesture routing, action execution |

## License

[MIT](LICENSE)
