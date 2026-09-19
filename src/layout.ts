// 576x288 canvas. Measured on real glasses (iPhone host): an image send costs
// ~125 ms plus ~12 ms per kB of 4-bit frame, a text update ~45 ms, and at most
// four images of 288x144 fit on a page. So the frame is cut by how often things
// change, and black (= unlit) areas are simply not covered by any image:
//   action pane  – menu / list / confirm / spool: every gesture repaints ONLY this
//   status pane  – percent, layer, thermometers
//   top band x2  – state chip, job name, clock, progress bar
//   info text    – time left, finish time, hints and toasts (firmware font, cheap)
const box = (containerID: number, containerName: string, xPosition: number,
  yPosition: number, width: number, height: number) =>
  ({ containerID, containerName, xPosition, yPosition, width, height })

export const WIDTH = 576
export const HEIGHT = 288
export const DRAWN_HEIGHT = 192
export const CAPTURE = box(1, 'input', 0, 0, WIDTH, HEIGHT)
export const INFO = box(6, 'info', 16, 204, 544, 56)
export const LIST_ROWS = 4
// Send order = array order: the pane under the user's finger goes first.
export const TILES = [
  box(13, 'action', 288, 62, 288, 130), box(12, 'status', 0, 62, 288, 130),
  box(10, 'topL', 0, 0, 288, 60), box(11, 'topR', 288, 0, 288, 60),
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
