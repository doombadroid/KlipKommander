# Even Hub listing copy

## Tagline

Run your Klipper printer from your glasses.

## Description

So some caveats: It's slow. This is a firmware limitation that I hope Even addresses. But I want it pretty.

KlipKommander puts your Klipper 3D printer on your G2. It talks to Moonraker, the same API that Mainsail and Fluidd use, over your own Wi-Fi.

What you see: print state, a segmented progress bar, a big percentage, layer count, time left, the time it will finish, and nozzle and bed thermometers with their targets marked.

What you can do: start any of the 20 newest files already on the printer, preheat (bed 60, 80 or 100, plus any PREHEAT_ macros you have), turn heaters off, pause, resume and cancel. It also shows your active Spoolman spool and how much filament is left on it.

Every action that touches hardware asks first. Tap is yes, double tap is no, and the question is dropped if the printer's state changes while it is on screen.

About the slow part: the whole screen is drawn as images, and the glasses take roughly a third of a second per image tile. Moving the cursor takes most of a second, opening a screen a bit over one. Status updates are throttled so that cost is only paid when something happens.

Setup: open the app on your phone, type your printer's address (Moonraker, or whatever you open Mainsail or Fluidd with) and press Save. An API key is optional. If it cannot connect, the panel tells you which line of moonraker.conf to look at.

LAN only, on purpose. A 3D printer is a heater with a network port. Do not forward it to the internet for this or anything else. Use a VPN into your home network when you are away, and do not start prints you cannot physically check on.

Open source under MIT, no warranty: https://github.com/doombadroid/KlipKommander

## Tags

klipper, moonraker, 3d printing, mainsail, fluidd, 3d printer, maker, remote control, utilities

## Category

Utilities / Tools
