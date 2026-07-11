import '@fontsource/inter/400.css'
import '@fontsource/inter/700.css'
import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { storageStatus, FILE_STORAGE_MSG } from './lib/storageGuard'

const root = createRoot(document.getElementById('root')!)
const status = storageStatus()

if (!status.ok) {
  // Offline single-file build opened in a browser that refuses storage under
  // file:// (Safari/Firefox) — fail loudly instead of silently losing data.
  root.render(
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-2xl font-bold">Studio Hours can't save data here</p>
      <p className="max-w-md text-ink-soft">{FILE_STORAGE_MSG}</p>
    </div>,
  )
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
