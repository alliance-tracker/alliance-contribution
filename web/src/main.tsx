import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initI18n } from './i18n'
import App from './App.tsx'

// Translations for the chosen language are loaded before anything renders, so no component ever
// suspends on i18n and KeyGate (above every Suspense boundary) is safe.
initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
