import { defineConfig, type Plugin } from 'vite'

// The phone WebView has no devtools. The page posts its console output to
// /__log and it shows up in this terminal (dev server only).
const phoneLog: Plugin = {
  name: 'phone-log',
  configureServer(server) {
    server.middlewares.use('/__log', (req, res) => {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        console.log(`[${req.socket.remoteAddress}] ${body.slice(0, 2000)}`)
        res.end()
      })
    })
  },
}

// /mr → Moonraker keeps the page same-origin (no CORS, works from the phone
// too, since the phone loads this dev server over the LAN).
export default defineConfig({
  base: './', // a packaged .ehpk is not served from /
  plugins: [phoneLog],
  server: {
    host: true,
    port: 5184,
    strictPort: true,
    proxy: { '/mr': { target: process.env.MOONRAKER ?? 'http://127.0.0.1:7125', rewrite: path => path.replace(/^\/mr/, '') } },
  },
  build: { target: 'esnext' },
})
