/**
 * BrasilDados API — Servidor HTTP local
 * Porta padrão: 3737
 *
 * Produção: Cloudflare Worker (brasildados-api.jonasponcianor.workers.dev)
 * Dashboard: https://brasildados-8o0.pages.dev
 */

import http from 'http'
import { createApp, toResponse } from './app.mjs'
import { loadAll } from './data.mjs'

const PORT = process.env.PORT ?? 3737

const app = createApp({
  dashboardUrl: process.env.BRASILDADOS_UI_URL ?? 'http://localhost:3000/apps/brasildados',
  loadData: loadAll,
})

async function route(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const accept = req.headers.accept ?? ''
  const result = await app.handle(url, accept)
  const response = toResponse(result)
  const body = await response.text()
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
  res.end(body)
}

app.boot().then(() => {
  http.createServer(route).listen(PORT, () => {
    console.log(`\nBrasilDados API — http://localhost:${PORT}`)
    console.log(`Dashboard local: http://localhost:3000/apps/brasildados`)
    console.log(`Produção: https://brasildados-8o0.pages.dev\n`)
  })
}).catch(err => { console.error('Erro ao iniciar:', err); process.exit(1) })
