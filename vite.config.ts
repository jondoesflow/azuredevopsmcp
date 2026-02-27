import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const externalOnboardingApiPort = env.EXTERNAL_ONBOARDING_API_PORT || '8787'

  return {
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://localhost:${externalOnboardingApiPort}`,
          changeOrigin: true,
        },
      },
    },
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          {
            src: 'node_modules/govuk-frontend/dist/govuk/assets/fonts/*',
            dest: 'assets/fonts',
          },
          {
            src: 'node_modules/govuk-frontend/dist/govuk/assets/images/*',
            dest: 'assets/images',
          },
        ],
      }),
    ],
  }
})
