// 576x288 canvas. The cockpit UI is drawn into four image tiles (the host
// allows 4 images of at most 288x144, which is exactly one full frame).
const box = (containerID: number, containerName: string, xPosition: number,
  yPosition: number, width: number, height: number) =>
  ({ containerID, containerName, xPosition, yPosition, width, height })

export const WIDTH = 576
export const HEIGHT = 288
export const CAPTURE = box(1, 'input', 0, 0, WIDTH, HEIGHT)
export const TILES = [
  box(10, 'tile0', 0, 0, 288, 144), box(11, 'tile1', 288, 0, 288, 144),
  box(12, 'tile2', 0, 144, 288, 144), box(13, 'tile3', 288, 144, 288, 144),
] as const

// Text fallback, used when the host image channel stops accepting sends.
// One fixed firmware font (~27 px per line).
export const TEXT = {
  header: box(2, 'header', 16, 6, 544, 28),
  stats: box(3, 'stats', 16, 66, 544, 56),
  body: box(4, 'body', 16, 128, 544, 112),
  footer: box(5, 'footer', 16, 258, 544, 26),
} as const
export type TextSlot = keyof typeof TEXT
