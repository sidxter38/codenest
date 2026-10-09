import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/global.css'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

// Configure @monaco-editor/react to use local bundled monaco instance instead of CDN
loader.config({ monaco })

// Intercept Monaco internal error handler at source to prevent assertion throws
try {
  // @ts-ignore
  const { errorHandler } = require('monaco-editor/esm/vs/base/common/errors.js')
  if (errorHandler && typeof errorHandler.unexpectedErrorHandler === 'function') {
    const origHandler = errorHandler.unexpectedErrorHandler
    errorHandler.unexpectedErrorHandler = function (e: any) {
      const msg = e?.message || String(e || '')
      if (
        msg.includes('TextModel got disposed before DiffEditorWidget model got reset') ||
        msg.includes('DiffEditorWidget model got reset') ||
        msg.includes('TextModel got disposed')
      ) {
        return
      }
      return origHandler.call(this, e)
    }
  }
} catch {
  // Ignore
}

// Suppress harmless browser ResizeObserver loop notifications, cross-origin iframe "Script error.", and Monaco DiffEditor TextModel unmount disposal assertions
window.addEventListener('error', (e) => {
  const msg = e.message || ''
  if (
    msg.includes('ResizeObserver loop completed with undelivered notifications') ||
    msg.includes('ResizeObserver loop limit exceeded') ||
    msg.includes('TextModel got disposed before DiffEditorWidget model got reset') ||
    msg.includes('DiffEditorWidget model got reset') ||
    msg.includes('TextModel got disposed') ||
    msg === 'Script error.' ||
    msg.includes('Script error')
  ) {
    e.stopImmediatePropagation()
    e.preventDefault()
  }
})

window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message || String(e.reason || '')
  if (
    msg.includes('TextModel got disposed before DiffEditorWidget model got reset') ||
    msg.includes('DiffEditorWidget model got reset') ||
    msg.includes('ResizeObserver')
  ) {
    e.stopImmediatePropagation()
    e.preventDefault()
  }
})

const container = document.getElementById('root')!
const root = createRoot(container)

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
