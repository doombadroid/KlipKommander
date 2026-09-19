import { BAR } from './layout'

// Draws one half of the progress bar. Black = unlit on the micro-LED display.
export function drawBar(half: 0 | 1, progress: number, paused: boolean): string {
  const { width, height } = BAR[half]
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)

  const total = width * 2
  const offset = half * width
  const filled = Math.round(total * Math.min(1, Math.max(0, progress)))
  // Outline: top/bottom rails plus the outer end cap of this half.
  ctx.fillStyle = '#777777'
  ctx.fillRect(0, 0, width, 2)
  ctx.fillRect(0, height - 2, width, 2)
  ctx.fillRect(half === 0 ? 0 : width - 2, 0, 2, height)
  // Quarter ticks inside the empty part.
  ctx.fillStyle = '#444444'
  for (const mark of [0.25, 0.5, 0.75]) {
    const x = Math.round(total * mark) - offset
    if (x >= 0 && x < width) ctx.fillRect(x, 4, 1, height - 8)
  }
  const fill = Math.min(width, Math.max(0, filled - offset))
  if (fill > 0) {
    ctx.fillStyle = paused ? '#888888' : '#ffffff'
    ctx.fillRect(half === 0 ? 4 : 0, 4, Math.max(0, fill - (half === 0 ? 4 : 0) - (fill === width && half === 1 ? 4 : 0)), height - 8)
  }
  return canvas.toDataURL('image/png').split(',')[1]
}
