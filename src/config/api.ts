/**
 * 后端 API / WebSocket 地址
 * - 支持环境变量 VITE_API_BASE_URL（如 https://localhost:8765）
 * - 未设置时根据当前页面协议自动使用 http/ws 或 https/wss，便于 HTTPS 部署
 */
const DEF_PORT = '8765'
const DEF_HOST = 'localhost'

function getApiBaseUrl(): string {
  const envBase = import.meta.env.VITE_API_BASE_URL
  if (envBase && typeof envBase === 'string') {
    return envBase.replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'https:' : 'http:'
    const host = window.location.hostname || DEF_HOST
    return `${proto}//${host}:${DEF_PORT}`
  }
  return `http://${DEF_HOST}:${DEF_PORT}`
}

function getWsUrl(): string {
  const base = getApiBaseUrl()
  const wsProto = base.startsWith('https') ? 'wss' : 'ws'
  const rest = base.replace(/^https?:\/\//, '')
  return `${wsProto}://${rest}/ws`
}

export function getApiBase(): string {
  return getApiBaseUrl()
}

export function getWsEndpoint(): string {
  return getWsUrl()
}
