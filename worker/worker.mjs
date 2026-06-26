import { createApp, toResponse } from '../api/app.mjs'
import { hydrateBundle } from '../api/load-bundle.mjs'
import bundle from './data-bundle.json' with { type: 'json' }

let app = null

export default {
  async fetch(request, env) {
    if (!app) {
      app = createApp({
        dashboardUrl: env.BRASILDADOS_UI_URL ?? 'https://brasildados-8o0.pages.dev',
        loadData: async () => hydrateBundle(bundle),
      })
    }
    const url = new URL(request.url)
    const accept = request.headers.get('accept') ?? ''
    const result = await app.handle(url, accept)
    return toResponse(result)
  },
}
