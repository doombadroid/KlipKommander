// Draws the KlipKommander icon in the Even Hub portal's 24x24 icon editor, which
// only offers a 2x2 brush. Paste this into the browser console (F12) while the
// editor is open with 2x2 and Draw selected, then click once on the grid when
// asked. It replays one brush stamp per '#' below as ordinary
// pointer/mouse events.
//
// The icon is laid out on a 12x12 grid of 2x2 cells, so it comes out the same
// whether or not the editor snaps the brush to a grid.
(async () => {
  const CELLS = [
    '.##########.', // gantry beam
    '.#........#.',
    '.##########.',
    '.#..####..#.', // hotend
    '.#...##...#.', // nozzle tip
    '.#........#.',
    '.#...##...#.', // printed part
    '.#..####..#.',
    '.#.######.#.', // bed
    '............',
    '############', // base
    '##.######.##',
  ]
  const SIZE = 24, BRUSH = 2
  // If the result lands one cell off (the brush may anchor on its centre rather
  // than its top-left cell), nudge here and run again after Clear.
  const OFFSET_X = 0, OFFSET_Y = 0
  const stamps = CELLS.flatMap((row, cy) => [...row].flatMap((cell, cx) => cell === '#' ? [[cx * BRUSH, cy * BRUSH]] : []))

  console.log('%cClick once anywhere on the icon grid…', 'font-weight:bold')
  const clicked = await new Promise(resolve =>
    addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); resolve(event.target) }, { capture: true, once: true }))
  // The click may land on a single cell: climb to the square element that is the whole grid.
  let grid = clicked
  for (let node = clicked; node && node !== document.body; node = node.parentElement) {
    const { width, height } = node.getBoundingClientRect()
    if (width >= 200 && Math.abs(width - height) < 8) { grid = node; break }
  }
  const box = grid.getBoundingClientRect()
  const cell = box.width / SIZE
  // Start from a clean grid (also removes the mark the first click may have left).
  const clear = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Clear')
  if (clear) { clear.click(); await new Promise(resolve => setTimeout(resolve, 200)) }

  const fire = (element, type, x, y, buttons) => {
    const init = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y,
      button: 0, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true, pressure: buttons ? 0.5 : 0 }
    element.dispatchEvent(new PointerEvent(`pointer${type}`, init))
    element.dispatchEvent(new MouseEvent(`mouse${type}`, init))
  }
  for (const [sx, sy] of stamps) {
    // Aim at the centre of the stamp's top-left cell; works for a canvas and for a grid of elements.
    const x = box.left + (sx + OFFSET_X + 0.5) * cell
    const y = box.top + (sy + OFFSET_Y + 0.5) * cell
    const element = document.elementFromPoint(x, y) ?? grid
    fire(element, 'over', x, y, 0); fire(element, 'enter', x, y, 0); fire(element, 'move', x, y, 0)
    fire(element, 'down', x, y, 1); fire(element, 'move', x, y, 1); fire(element, 'up', x, y, 0)
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }))
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  console.log(`Done: ${stamps.length} stamps on a ${Math.round(box.width)} px grid (${grid.tagName.toLowerCase()}). Compare with public/icon/printer-24-stamps.png.`)
})()
