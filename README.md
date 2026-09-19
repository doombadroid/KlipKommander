<p align="center"><img src="klipkommander.gif" alt="I am the Klip Commander!"></p>

# KlipKommander

Run your Klipper printer from Even Realities G2 glasses. Talks to Moonraker, shows the print on the lens, and lets you start, preheat, pause, resume and cancel with the temple touchpad.

| | |
|---|---|
| ![Printing](shots/printing.png) | ![Confirm](shots/confirm.png) |
| ![Standby](shots/standby.png) | ![Job list](shots/jobs.png) |
| ![Preheat](shots/preheat.png) | ![Paused](shots/paused.png) |

Simulator captures at the real 576x288. Standby, job list and preheat are a live printer; the print in progress is the built-in mock.

- Cockpit display: segmented progress bar, percent, layer, time left, finish time, nozzle and bed thermometers with target marks (2 s poll)
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

### Phone panel

The page the Even app shows on the phone is a small control panel: connection status, and a form for the printer address (Moonraker, or whatever you open Mainsail or Fluidd with; port 7125 is tried for you) plus an optional Moonraker API key. Test checks the connection, Save stores it through the Even app and switches the glasses over at once. Leave the address empty to keep using the `/mr` proxy of the server the app was loaded from. Pointing it straight at another host means Moonraker must accept this page's origin (`cors_domains`); the panel tells you the exact value when that is the problem.

Icons for the Even Hub listing are in `public/icon/` (24x24, 1-bit, plus black and white on transparent).

### 4. Put it on the glasses

Your phone and the machine running `npx vite` must be on the same Wi-Fi.

```sh
npx evenhub qr --url http://<that-machine's-LAN-IP>:5184/
```

Scan the QR code from the Even app's developer / Even Hub section. The app loads the page from your dev server, which has to keep running while you use it.

Status: runs on real glasses with an iPhone, full 288x144 tiles included. Expect rough edges and please report them.

### 5. Spoolman (optional)

Configure `[spoolman]` in `moonraker.conf` as usual and pick an active spool in Mainsail or Fluidd. The SPOOL screen reads it through Moonraker. Without Spoolman the screen just says so.

### Running it for real (no dev session)

`npx vite` is for development. For everyday use, serve the built app from a machine that is always on (the printer host is ideal):

```sh
npm run build
npx vite preview --host --port 5185 --strictPort   # serves dist/ and still proxies /mr to Moonraker
```

Wrap that in whatever keeps services alive on your box (systemd unit, OpenRC service, or a `node:22-slim` container with `restart: unless-stopped`, host networking and this folder mounted). Then scan `http://<that-machine>:5185/` once.

### Packaging as `.ehpk` (installed app, no server)

An installed build runs entirely inside the Even app and talks straight to Moonraker: no dev server, no proxy. The catch is an Even Hub rule: a packaged app may only contact origins listed in `app.json` when it was packed. Exact origins only, no wildcards, no IP ranges, nothing the user can add later. So "type your printer's IP into the app" cannot work for an installed build. Two ways around it:

**A. Give the printer a name the build already knows.** The shipped whitelist contains `klipkommander.local`, `mainsailos.local`, `fluiddpi.local`, `klipper.local`, `voron.local`, `printer.local` and `raspberrypi.local`, each on port 80 and 7125. If your printer host already answers to one of these (MainsailOS and FluiddPi do out of the box), enter that name in the phone panel and you are done. Otherwise add an alias on the printer host, no IP involved:

```sh
sudo apt install avahi-utils
# try it:            avahi-publish -a -R klipkommander.local "$(hostname -I | cut -d' ' -f1)"
# make it permanent: put that line in a systemd unit, or set the host name to one of the names above
```

**B. Pack your own build** with your printer's origin in `app.json` (`permissions[0].whitelist`, e.g. `http://192.168.1.50:7125`) and install it through your own Even Hub account:

```sh
npm run build
npx evenhub pack app.json dist -o klipkommander.ehpk
```

Upload the file in the Even Hub portal (Private builds, or a Beta group containing only you) and install it from the phone app. That is a private build, not a store listing.

Either way Moonraker has to accept the app's web origin: if the panel reports a refusal, add the origin it names to `cors_domains` in `moonraker.conf`. Untested so far: whether the packaged WebView allows plain-http LAN requests at all.

## Why it is not faster

Measured on real G2 glasses with an iPhone: one image send costs about 125 ms plus about 12 ms per kB of 4-bit frame (a full 288x144 tile is roughly 370 ms), a text update about 45 ms, and the stock firmware always takes a whole image container, one at a time. The cockpit is four such tiles, so a cursor move is about 0.7 s and a screen change about 1.4 s. That is the price of drawing every pixel; routine polls repaint at most every 10 s (`REPAINT_INTERVAL_MS` in `src/display.ts`) so it is only paid when something happens. Two things the simulator will not tell you: real glasses reject base64 image data (send PNG bytes), and the first page must be text-only, with images added by a rebuild.

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
| `src/cockpit.ts` | Draws the full frame on a canvas and cuts it into four 288x144 image tiles |
| `src/display.ts` | Sends only the tiles that changed; drops to a plain-text UI if the host image channel wedges |
| `src/settings.ts`, `src/address.ts` | Phone control panel; address clean-up (`node src/address.test.ts`) |
| `src/main.ts` | Poll loop, gesture routing, action execution |

## License

[MIT](LICENSE). The bundled Chakra Petch font is under the [SIL Open Font License 1.1](https://openfontlicense.org).
