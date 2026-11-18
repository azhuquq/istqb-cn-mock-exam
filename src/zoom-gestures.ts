// Trackpad pinch gestures arrive as Ctrl+wheel in Chromium browsers.
document.addEventListener('wheel', event => {
  if (event.ctrlKey) event.preventDefault()
}, {passive: false})

// Safari can ignore viewport zoom limits; suppress its native pinch gestures.
for (const type of ['gesturestart', 'gesturechange']) {
  document.addEventListener(type, event => event.preventDefault(), {passive: false})
}
document.addEventListener('touchmove', event => {
  if (event.touches.length > 1) event.preventDefault()
}, {passive: false})
