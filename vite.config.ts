import type { PluginOption } from 'vite'
import path from 'node:path'
import process from 'node:process'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

function setupPlugins(env: ImportMetaEnv): PluginOption[] {
  return [
    vue(),
    env.VITE_PWA_ENABLE === 'true' && VitePWA({
      injectRegister: 'auto',
      manifest: {
        name: 'chatGPT',
        short_name: 'chatGPT',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ]
}

export default defineConfig((env) => {
  const viteEnv = loadEnv(env.mode, import.meta.dirname) as unknown as ImportMetaEnv
  const apiProxyTo = viteEnv.VITE_API_PROXY_TO || 'http://127.0.0.1:3002'

  return {
    base: viteEnv.VITE_BASE_PATH || '',
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), 'src'),
      },
    },
    plugins: setupPlugins(viteEnv),
    server: {
      host: '0.0.0.0',
      port: Number(process.env.PORT) || 1002,
      open: false,
      proxy: {
        '/auth': {
          target: apiProxyTo,
          changeOrigin: true, // 允许跨域
        },
        '/api': {
          target: apiProxyTo,
          changeOrigin: true, // 允许跨域
          // rewrite: path => path.replace('/api/', '/'),
        },
      },
    },
    build: {
      reportCompressedSize: false,
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
      commonjsOptions: {
        ignoreTryCatch: false,
      },
      rollupOptions: {
        output: {
          advancedChunks: {
            groups: [
              { name: 'vendor-katex', test: /[\\/]node_modules[\\/].*katex/ },
            ],
          },
        },
      },
    },
  }
})
