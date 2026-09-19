// Draws the KlipKommander icon in the Even Hub portal's 24x24 icon editor, which
// only offers a 4x4 brush. Paste this into the browser console (F12) while the
// editor is open with the 4x4 brush selected, then click once on the drawing
// area when asked. It replays 24 brush stamps as ordinary pointer/mouse events.
//
// Every stamp is 4x4; only the nozzle (x = 10) sits off the 4 px grid. If the
// editor snaps to a grid, set SNAP = true and the nozzle becomes 8 px wide.
(async () => {
  const SNAP = false
  const SIZE = 24, BRUSH = 4
  const stamps = [
    [0, 0], [4, 0], [8, 0], [12, 0], [16, 0], [20, 0],          // top beam
    [0, 4], [0, 8], [0, 12], [0, 16], [20, 4], [20, 8], [20, 12], [20, 16], // uprights
    ...(SNAP ? [[8, 4], [12, 4], [8, 8], [12, 8]] : [[10, 4], [10, 8]]),    // nozzle
    [8, 16], [12, 16],                                          // printed part
    [0, 20], [4, 20], [8, 20], [12, 20], [16, 20], [20, 20],    // bed
  ]
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
    // Aim at the centre of the 4x4 stamp.
    const x = box.left + (sx + BRUSH / 2) * scale
    const y = box.top + (sy + BRUSH / 2) * scale
    fire('move', x, y, 0); fire('down', x, y, 1); fire('move', x, y, 1); fire('up', x, y, 0)
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }))
    await new Promise(resolve => setTimeout(resolve, 60))
  }
  console.log(`Done: ${stamps.length} stamps. If the first click left a stray mark, undo or erase it.`)
})()
