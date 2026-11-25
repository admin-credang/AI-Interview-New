import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Click effect: a clicked button turns dark (dark purple) for a moment.
// (the look lives in index.css -> "3D buttons")
document.addEventListener('click', (e) => {
  const btn = e.target.closest?.('button:not([data-plain]):not([role="switch"]), .btn-blue')
  if (!btn || btn.disabled) return
  btn.setAttribute('data-clicked', '')
  setTimeout(() => btn.removeAttribute('data-clicked'), 600)
})

// ------------------------------------------------------------
// 3D tilt for every element with data-tilt (pure visual effect).
// One listener for the whole app; turned off by Settings ->
// "Reduce card animations", by prefers-reduced-motion and on touch.
// ------------------------------------------------------------
const PREF_KEY = 'dashboard_preferences'
const applyMotionPref = () => {
  let reduce = false
  try {
    reduce = Boolean(JSON.parse(localStorage.getItem(PREF_KEY) || '{}').reduceMotion)
  } catch {
    reduce = false
  }
  document.documentElement.classList.toggle('reduce-motion', reduce)
}
applyMotionPref()
window.addEventListener('storage', applyMotionPref)
window.addEventListener('dashboard-preferences', applyMotionPref)

const MAX_TILT = 6 // degrees
const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
let tiltEl = null
let tiltFrame = 0

const resetTilt = (el) => {
  if (!el) return
  el.removeAttribute('data-tilting')
  el.style.setProperty('--rx', '0deg')
  el.style.setProperty('--ry', '0deg')
}

document.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return
  if (motionQuery?.matches || document.documentElement.classList.contains('reduce-motion')) return
  const el = e.target.closest?.('[data-tilt]')
  if (el !== tiltEl) {
    resetTilt(tiltEl)
    tiltEl = el
  }
  if (!el) return
  cancelAnimationFrame(tiltFrame)
  tiltFrame = requestAnimationFrame(() => {
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    const strength = Number(el.dataset.tilt) || 1
    el.setAttribute('data-tilting', '')
    el.style.setProperty('--ry', `${((px - 0.5) * 2 * MAX_TILT * strength).toFixed(2)}deg`)
    el.style.setProperty('--rx', `${((0.5 - py) * 2 * MAX_TILT * strength).toFixed(2)}deg`)
    el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`)
    el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`)
  })
}, { passive: true })

document.addEventListener('pointerleave', () => {
  resetTilt(tiltEl)
  tiltEl = null
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
