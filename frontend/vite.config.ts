import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // /api/compare is a Vercel function and has no equivalent under `vite dev`.
    // Run it locally to exercise the comparison leg end-to-end:
    //   python -c "from http.server import HTTPServer; from api.compare import handler; HTTPServer(('127.0.0.1',3001),handler).serve_forever()"
    // with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set.
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
})
