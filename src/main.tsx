import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App'
import { AuthProvider } from './hooks/useAuth'
import { registerServiceWorker } from './lib/registerServiceWorker'
import { aplicarTema } from './lib/tema'
import './index.css'

// index.html ya aplico el tema antes del primer pintado; esto solo lo
// reafirma una vez que el modulo esta cargado, para que el estado del
// documento y el del modulo arranquen sincronizados.
aplicarTema()

// Tras un despliegue, una pestana abierta pide archivos con nombre viejo que ya
// no existen: se recarga una sola vez (la marca evita un bucle si el problema es otro).
window.addEventListener('vite:preloadError', () => {
  const marca = 'recarga-por-version'
  try {
    if (sessionStorage.getItem(marca)) return
    sessionStorage.setItem(marca, '1')
  } catch {
    return
  }
  window.location.reload()
})

// dist/sw.js solo existe en el build de produccion (lo genera el plugin
// de vite.config.ts); en `npm run dev` no hay nada que registrar.
if (import.meta.env.PROD) registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster position="bottom-right" richColors closeButton />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
