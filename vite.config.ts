import { defineConfig } from 'vite'

// /mr → Moonraker keeps the page same-origin (no CORS, works from the phone
// too, since the phone loads this dev server over the LAN).
export default defineConfig({
  server: {
    host: true,
    port: 5184,
    strictPort: true,
    proxy: { '/mr': { target: process.env.MOONRAKER ?? 'http://127.0.0.1:7125', rewrite: path => path.replace(/^\/mr/, '') } },
  },
  build: { target: 'esnext' },
})
