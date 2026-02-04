import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// HTTPS: 使用证书时设置 SSL_CERT_DIR（Let's Encrypt 目录）或 SSL_KEY_PATH/SSL_CERT_PATH，或放置 cert/key.pem、cert/cert.pem
function resolveHttpsConfig(): { key: Buffer; cert: Buffer } | undefined {
  let keyPath: string
  let certPath: string
  if (process.env.SSL_CERT_DIR) {
    keyPath = path.join(process.env.SSL_CERT_DIR, 'privkey.pem')
    certPath = path.join(process.env.SSL_CERT_DIR, 'fullchain.pem')
  } else {
    keyPath =
      process.env.SSL_KEY_PATH ||
      path.resolve(__dirname, 'cert', 'key.pem')
    certPath =
      process.env.SSL_CERT_PATH ||
      path.resolve(__dirname, 'cert', 'cert.pem')
  }
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    }
  }
  return undefined
}

const httpsConfig = resolveHttpsConfig()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['pixi.js-legacy'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    ...(httpsConfig
      ? { https: httpsConfig }
      : {}),
  },
  preview: {
    port: 3000,
    host: true,
    ...(httpsConfig
      ? { https: httpsConfig }
      : {}),
  },
})
