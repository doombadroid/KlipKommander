# KlipKommander privacy policy

Last updated: 18 September 2026

KlipKommander is an open-source app for Even Realities G2 glasses that controls a Klipper 3D printer on your own network. The short version: it has no servers, no accounts and no analytics, and nothing it handles is sent to the author or to any third party.

## What the app stores

- The printer address you enter.
- The Moonraker API key, if you enter one.

Both are saved on your phone through the Even Realities app's own app storage. They are not uploaded anywhere. You can change or clear them in the app's phone panel at any time, and they are removed when you uninstall the app.

## What the app sends, and where

The app makes network requests to one place only: the printer address you entered. Those requests are the Moonraker API calls needed to show printer status, list files on the printer, read the active Spoolman spool, and carry out the actions you confirm (start, pause, resume, cancel, heater and preheat commands). If you entered an API key, it is sent to that address as a request header and nowhere else.

Your printer's data (file names, temperatures, print progress, spool details) is shown on your glasses and phone and is not stored or forwarded by the app.

The app does not contact the author, does not load remote scripts, fonts or images, and contains no advertising, tracking or crash-reporting code.

## What the app does not access

It requests the network permission only. It does not use the microphone, camera, photo library, location, motion sensors, contacts or notifications.

## Things outside this app

- The Even Realities app and glasses, which run and distribute this app, are covered by Even Realities' own privacy policy.
- Your printer software (Klipper, Moonraker, Mainsail, Fluidd, Spoolman) runs on your own equipment under your control.
- Traffic between your phone and printer is plain HTTP on your local network unless you have set up HTTPS yourself. Keep the printer off the public internet.

## Children

The app is a tool for operating 3D printers and is not directed at children.

## Changes

Changes to this policy are made in this file, and its history is public in the project's repository.

## Contact

Questions or concerns: open an issue at https://github.com/doombadroid/KlipKommander/issues
