import { defineConfig } from 'nitro'
// nitro.config.ts
export default defineConfig({
  routeRules: {
    '/api/**': { proxy:   process.env.VITE_BACKEND_URL || 'http://localhost:3001' + "/**" },
  }
})
