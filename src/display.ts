import {
  CreateStartUpPageContainer, RebuildPageContainer, TextContainerProperty,
  ImageContainerProperty, ImageRawDataUpdate, ImageRawDataUpdateResult,
  TextContainerUpgrade, type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { BAR, TEXT, type TextSlot } from './layout'
import { drawBar } from './bar'
import type { Text } from './ui'

export class Display {
  private startupCalled = false
  private ready = false
  private sentText = new Map<TextSlot, string>()
  private sentBar = ['', '']
  private imagesOk = true

  constructor(private bridge: EvenAppBridge) {}

  // Called only through the serialized queue in main.ts.
  async render(text: Text, progress: number, paused: boolean, restore = false): Promise<void> {
    if (!this.ready || restore) {
      const textObject = Object.entries(TEXT).map(([key, geometry]) => new TextContainerProperty({
        ...geometry, content: key === 'capture' ? '' : text[key as TextSlot], borderWidth: 0,
        paddingLength: 0, isEventCapture: key === 'capture' ? 1 : 0,
      }))
      const imageObject = this.imagesOk ? BAR.map(geometry => new ImageContainerProperty(geometry)) : []
      const page = { containerTotalNum: textObject.length + imageObject.length, textObject, imageObject }
      if (!this.startupCalled) {
        // Latch BEFORE awaiting, even if startup is rejected. Never retry it.
        this.startupCalled = true
        const result = await this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(page))
        this.ready = result === 0
        if (!this.ready) console.error(`KlipKommander startup rejected: ${result}`)
      }
      if (!this.ready || restore) {
        this.ready = await this.bridge.rebuildPageContainer(new RebuildPageContainer(page))
        if (!this.ready) throw new Error('KlipKommander page rebuild rejected')
      }
      this.sentText = new Map(Object.entries(text) as [TextSlot, string][])
      this.sentBar = ['', ''] // A rebuild destroys image contents.
    } else {
      for (const key of Object.keys(text) as TextSlot[]) {
        if (this.sentText.get(key) === text[key]) continue
        const ok = await this.bridge.textContainerUpgrade(new TextContainerUpgrade({
          containerID: TEXT[key].containerID, containerName: TEXT[key].containerName, content: text[key],
        }))
        if (!ok) throw new Error(`KlipKommander text update rejected: ${key}`)
        this.sentText.set(key, text[key])
      }
    }
    if (!this.imagesOk) return
    // ~100 ms per image send: only halves whose pixels changed cross the bridge.
    for (const half of [0, 1] as const) {
      const png = drawBar(half, progress, paused)
      if (png === this.sentBar[half]) continue
      const result = await this.bridge.updateImageRawData(new ImageRawDataUpdate({
        containerID: BAR[half].containerID, containerName: BAR[half].containerName, imageData: png,
      }))
      if (!ImageRawDataUpdateResult.isSuccess(result)) throw new Error(`KlipKommander bar image rejected: ${result}`)
      this.sentBar[half] = png
    }
  }

  // The documented host exit-dialog bug can wedge image sends after a cancelled
  // exit. Progress stays readable as a percentage in the stats line.
  async restoreAfterExit(text: Text): Promise<void> {
    this.imagesOk = false
    console.warn('KlipKommander: exit cancelled; progress bar disabled until next launch (host image-channel limitation).')
    await this.render(text, 0, false, true)
  }
}
