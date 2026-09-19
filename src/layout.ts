// 576x288 canvas. Measured on real glasses: an image send costs ~350 ms no
// matter how small, a text update ~45 ms. So the slow-changing dashboard is
// four image tiles (top 200 px) and everything interactive is one text
// console underneath.
const box = (containerID: number, containerName: string, xPosition: number,
  yPosition: number, width: number, height: number) =>
  ({ containerID, containerName, xPosition, yPosition, width, height })

export const WIDTH = 576
export const HEIGHT = 288
export const DASH_HEIGHT = 200
export const CAPTURE = box(1, 'input', 0, 0, WIDTH, HEIGHT)
export const CONSOLE = box(6, 'console', 16, 204, 544, 84)
export const CONSOLE_ROWS = 3
// Images are limited to 288x144 each, four per page.
export const TILES = [
  box(10, 'tile0', 0, 0, 288, 60), box(11, 'tile1', 288, 0, 288, 60),
  box(12, 'tile2', 0, 60, 288, 140), box(13, 'tile3', 288, 60, 288, 140),
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
