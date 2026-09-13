import { useAuthStore } from '@/store'

/** 平台登录成功后用于回跳的 localStorage key，与平台前端的 common/redirect.js 保持一致。 */
const REDIRECT_CACHE_KEY = 'redirect-cache'

/** 401 可能同时来自多个并发请求，用该标记保证只触发一次跳转。 */
let redirectingToLogin = false

function normalizePath(path: string) {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/** 登录入口：API 前缀 + `/auth/login`（服务端 `/session` 下发的 uri 也是这个地址）。 */
export function resolveLoginUrl() {
  const apiPath = (import.meta.env.VITE_API_PATH || '/api').replace(/\/+$/, '')
  return `${apiPath}/auth/login`
}

/** 是否已经在登录入口上，避免反复跳转。 */
export function isOnLoginPage(loginUrl: string, pathname = window.location.pathname) {
  if (!loginUrl)
    return false

  try {
    return normalizePath(new URL(loginUrl, window.location.origin).pathname) === normalizePath(pathname)
  }
  catch {
    return false
  }
}

/**
 * 未授权（HTTP 401）统一处理：清理本地登录态、记录回跳地址并跳转登录入口。
 *
 * 会话失效时各调用方自行处理容易出现「只弹错不跳转」，或刷新当前页面后仍是 401 的循环，
 * 因此统一收敛到这里。
 */
export function redirectToLogin() {
  if (redirectingToLogin)
    return

  redirectingToLogin = true

  const loginUrl = resolveLoginUrl()

  // 已经在登录入口上就无需再跳
  if (isOnLoginPage(loginUrl)) {
    redirectingToLogin = false
    return
  }

  // 应用自身的密钥登录态作废；平台级 token 由平台登录页接管，这里不动。
  try {
    useAuthStore().removeToken()
  }
  catch {
    // Pinia 尚未初始化（测试或极早期请求）时忽略
  }

  try {
    window.localStorage.setItem(REDIRECT_CACHE_KEY, window.location.href)
  }
  catch {
    // localStorage 不可用（隐私模式等）时忽略，不影响跳转
  }

  console.warn(`Unauthorized (401), redirecting to ${loginUrl}`)
  window.location.href = loginUrl
}
