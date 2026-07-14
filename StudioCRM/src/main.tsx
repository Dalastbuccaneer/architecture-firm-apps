import '@fontsource/inter/400.css'
import '@fontsource/inter/700.css'
import './index.css'
// NOTE: StudioCRM has no print.css — the plan's scaffold step calls this out
// ("No print.css needed in v1"); StudioLog's main.tsx (source of this file)
// imports one, but that import was dropped here on purpose. Do not re-add it
// without also adding src/print.css, or every screen fails to load (Vite
// can't resolve the import).

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
      <p className="text-2xl font-bold">StudioCRM can't save data here</p>
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
