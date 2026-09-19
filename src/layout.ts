// 576x288 canvas, one fixed firmware font (~27 px per line).
const box = (containerID: number, containerName: string, xPosition: number,
  yPosition: number, width: number, height: number) =>
  ({ containerID, containerName, xPosition, yPosition, width, height })

export const TEXT = {
  capture: box(1, 'input', 0, 0, 576, 288),
  header: box(2, 'header', 16, 6, 544, 28),
  stats: box(3, 'stats', 16, 66, 544, 56),
  body: box(4, 'body', 16, 128, 544, 112),
  footer: box(5, 'footer', 16, 258, 544, 26),
} as const
export type TextSlot = Exclude<keyof typeof TEXT, 'capture'>

// Images max out at 288 px wide, so the full-width bar is two halves.
export const BAR = [box(10, 'barL', 16, 40, 272, 20), box(11, 'barR', 288, 40, 272, 20)] as const
