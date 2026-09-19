// Draws the KlipKommander icon in the Even Hub portal's 24x24 icon editor, which
// only offers a 2x2 brush. Paste this into the browser console (F12) while the
// editor is open with the brush selected, then click once on the drawing area
// when asked. It replays one brush stamp per '#' below as ordinary
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
  const stamps = CELLS.flatMap((row, cy) => [...row].flatMap((cell, cx) => cell === '#' ? [[cx * BRUSH, cy * BRUSH]] : []))
  console.log('%cClick once anywhere on the icon drawing area…', 'font-weight:bold')
  const target = await new Promise(resolve =>
    addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); resolve(event.target) }, { capture: true, once: true }))
  const box = target.getBoundingClientRect()
  const scale = box.width / SIZE
  const fire = (type, x, y, buttons) => {
    const init = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y,
      button: 0, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true, pressure: buttons ? 0.5 : 0 }
    target.dispatchEvent(new PointerEvent(`pointer${type}`, init))
    target.dispatchEvent(new MouseEvent(`mouse${type}`, init))
  }
  for (const [sx, sy] of stamps) {
    // Aim at the centre of the stamp.
    const x = box.left + (sx + BRUSH / 2) * scale
    const y = box.top + (sy + BRUSH / 2) * scale
    fire('move', x, y, 0); fire('down', x, y, 1); fire('move', x, y, 1); fire('up', x, y, 0)
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }))
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  console.log(`Done: ${stamps.length} stamps. If the first click left a stray mark, undo or erase it.`)
})()
