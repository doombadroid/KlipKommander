import {
  CreateStartUpPageContainer, RebuildPageContainer, TextContainerProperty,
  ImageContainerProperty, ImageRawDataUpdate, ImageRawDataUpdateResult,
  TextContainerUpgrade, type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { CAPTURE, CONSOLE, TEXT, TILES, type TextSlot } from './layout'
import type { Text } from './ui'

const textBox = (geometry: typeof CAPTURE, content: string, capture: boolean) =>
  new TextContainerProperty({ ...geometry, content, borderWidth: 0, paddingLength: 0, isEventCapture: capture ? 1 : 0 })

// Cockpit mode: capture container + text console + four dashboard image tiles.
// Fallback mode (image channel wedged): the same data as plain text.

// Dashboard repaints that are not urgent wait this long after the last one, so
// a jittering temperature cannot keep the (slow) image channel busy. Tune freely.
const DASH_INTERVAL_MS = 10_000
export class Display {
  private startupCalled = false
  private ready = false
  private sentText = new Map<TextSlot, string>()
  private sentTiles: string[] = []
  private sentConsole = ''
  private lastDash = -Infinity
  private imagesOk = true

  constructor(private bridge: EvenAppBridge) {}

  // Called only through the serialized queue in main.ts. `tiles` is lazy so
  // the fallback never pays for drawing.
  async render(text: Text, consoleText: string, tiles: () => string[], urgent: boolean, restore = false): Promise<void> {
    if (!this.ready || restore) {
      const textObject = [textBox(CAPTURE, ' ', true), ...(this.imagesOk ? [textBox(CONSOLE, consoleText, false)]
        : (Object.keys(TEXT) as TextSlot[]).map(key => textBox(TEXT[key], text[key], false)))]
      const imageObject = this.imagesOk ? TILES.map(geometry => new ImageContainerProperty(geometry)) : []
      const page = { containerTotalNum: textObject.length + imageObject.length, textObject, imageObject }
      if (!this.startupCalled) {
        // Latch BEFORE awaiting, even if startup is rejected. Never retry it.
        this.startupCalled = true
        // Sequence verified on real glasses: a text-only startup page, then a
        // rebuild that brings in the image tiles.
        const result = await this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(
          { containerTotalNum: 1, textObject: [textBox(CAPTURE, ' ', true)], imageObject: [] }))
        if (result !== 0) console.error(`KlipKommander startup rejected: ${result}`)
      }
      this.ready = await this.bridge.rebuildPageContainer(new RebuildPageContainer(page))
      if (!this.ready) throw new Error('KlipKommander page rebuild rejected')
      this.sentText = new Map(this.imagesOk ? [] : Object.entries(text) as [TextSlot, string][])
      this.sentTiles = [] // A rebuild destroys image contents.
      this.sentConsole = consoleText
      this.lastDash = -Infinity
    }
    if (!this.imagesOk) {
      for (const key of Object.keys(TEXT) as TextSlot[]) {
        if (this.sentText.get(key) === text[key]) continue
        const ok = await this.bridge.textContainerUpgrade(new TextContainerUpgrade({
          containerID: TEXT[key].containerID, containerName: TEXT[key].containerName, content: text[key],
        }))
        if (!ok) throw new Error(`KlipKommander text update rejected: ${key}`)
        this.sentText.set(key, text[key])
      }
      return
    }
    // Text first (~45 ms on hardware): navigation never waits behind the dashboard.
    if (consoleText !== this.sentConsole) {
      const ok = await this.bridge.textContainerUpgrade(new TextContainerUpgrade({
        containerID: CONSOLE.containerID, containerName: CONSOLE.containerName, content: consoleText,
      }))
      if (!ok) throw new Error('KlipKommander console update rejected')
      this.sentConsole = consoleText
    }
    // ~350 ms per image send on hardware: only tiles whose pixels changed cross
    // the bridge, and only every DASH_INTERVAL_MS unless the caller says urgent.
    if (!urgent && performance.now() - this.lastDash < DASH_INTERVAL_MS) return
    this.lastDash = performance.now()
    const next = tiles()
    for (const [index, png] of next.entries()) {
      if (png === this.sentTiles[index]) continue
      const began = performance.now()
      const result = await this.bridge.updateImageRawData(new ImageRawDataUpdate({
        containerID: TILES[index].containerID, containerName: TILES[index].containerName,
        // Bytes, not the base64 string: real glasses answer sendFailed to base64
        // (the simulator takes either). The string is still the cheap diff key.
        imageData: Uint8Array.from(atob(png), char => char.charCodeAt(0)),
      }))
      if (!ImageRawDataUpdateResult.isSuccess(result)) throw new Error(`KlipKommander tile ${index} rejected: ${result}`)
      this.sentTiles[index] = png
      if (import.meta.env.DEV) console.info(`tile${index} ${TILES[index].width}x${TILES[index].height} sent in ${Math.round(performance.now() - began)} ms`)
    }
  }

  // The documented host exit-dialog bug can wedge image sends after a cancelled
  // exit, so the rest of the session runs on the text fallback.
  async restoreAfterExit(text: Text): Promise<void> {
    this.imagesOk = false
    console.warn('KlipKommander: exit cancelled; text fallback until next launch (host image-channel limitation).')
    await this.render(text, '', () => [], true, true)
  }
}
