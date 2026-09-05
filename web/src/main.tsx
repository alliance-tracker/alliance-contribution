import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initI18n } from './i18n'
import App from './App.tsx'

// Translations for the chosen language are loaded before anything renders, so no component ever
// suspends on i18n and KeyGate (above every Suspense boundary) is safe. If loading fails, render
// anyway — i18next falls back to rendering key paths, which beats a blank page.
initI18n()
  .catch((err) => console.error('i18n init failed', err))
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
