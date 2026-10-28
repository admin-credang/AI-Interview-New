import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Click effect: a clicked violet button turns dark violet for a moment.
// (the colour itself lives in index.css -> --btn-click-bg)
document.addEventListener('click', (e) => {
  const btn = e.target.closest?.('button:not([data-plain]):not([role="switch"]), .btn-blue')
  if (!btn || btn.disabled) return
  btn.setAttribute('data-clicked', '')
  setTimeout(() => btn.removeAttribute('data-clicked'), 600)
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
