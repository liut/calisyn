import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 线上部署的 API 前缀，登录入口即 `${VITE_API_PATH}/auth/login` */
const API_PATH = '/api/m'
const LOGIN_URL = '/api/m/auth/login'
const REDIRECT_CACHE_KEY = 'redirect-cache'
const CURRENT_URL = 'https://example.com/apps/assistant/#/chat/abc'

interface StubLocation {
  pathname: string
  href: string
  origin: string
  search: string
}

let navigations: string[]
const originalLocation = window.location

function stubLocation(options: Partial<StubLocation> = {}) {
  let href = options.href ?? CURRENT_URL

  navigations = []

  const location = {
    pathname: options.pathname ?? '/chat/abc',
    origin: options.origin ?? 'https://example.com',
    search: '',
    get href() {
      return href
    },
    set href(value: string) {
      href = value
      navigations.push(value)
    },
  } as StubLocation

  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: location })
}

function restoreLocation() {
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: originalLocation })
}

async function importUnauthorized() {
  return import('./unauthorized')
}

async function importAuthStore() {
  const { useAuthStore } = await import('@/store/modules/auth')
  return useAuthStore()
}

describe('utils/request/unauthorized.ts', () => {
  beforeEach(() => {
    // 跳转标记是模块级状态，逐个用例重置，避免相互影响
    vi.resetModules()
    // store 依赖图（vue-router）在 import 时读取 window.location，先还原成真实的 jsdom 实现
    restoreLocation()
    window.localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    restoreLocation()
  })

  it('builds the login entry from the api prefix', async () => {
    vi.stubEnv('VITE_API_PATH', API_PATH)

    const { resolveLoginUrl } = await importUnauthorized()

    expect(resolveLoginUrl()).toBe(LOGIN_URL)
  })

  it('falls back to /api and tolerates a trailing slash', async () => {
    const { resolveLoginUrl } = await importUnauthorized()

    // 仓库 .env 的默认值
    expect(resolveLoginUrl()).toBe(LOGIN_URL)

    vi.stubEnv('VITE_API_PATH', '')
    expect(resolveLoginUrl()).toBe('/api/auth/login')

    vi.stubEnv('VITE_API_PATH', `${API_PATH}/`)
    expect(resolveLoginUrl()).toBe(LOGIN_URL)
  })

  it('redirects to the login entry, remembering where the user was', async () => {
    vi.stubEnv('VITE_API_PATH', API_PATH)
    const authStore = await importAuthStore()
    authStore.setToken('secret-key')

    const { redirectToLogin } = await importUnauthorized()
    stubLocation()
    redirectToLogin()

    expect(navigations).toEqual([LOGIN_URL])
    expect(window.localStorage.getItem(REDIRECT_CACHE_KEY)).toBe(CURRENT_URL)
    expect(authStore.token).toBeUndefined()
  })

  it('does nothing when the user is already on the login entry', async () => {
    vi.stubEnv('VITE_API_PATH', API_PATH)

    const { redirectToLogin } = await importUnauthorized()
    stubLocation({ pathname: LOGIN_URL })
    redirectToLogin()

    expect(navigations).toEqual([])
  })

  it('navigates only once when several requests fail with 401 in a row', async () => {
    vi.stubEnv('VITE_API_PATH', API_PATH)

    const { redirectToLogin } = await importUnauthorized()
    stubLocation()

    redirectToLogin()
    redirectToLogin()

    expect(navigations).toEqual([LOGIN_URL])
  })

  it('detects the login entry path, tolerating a trailing slash', async () => {
    const { isOnLoginPage } = await importUnauthorized()
    stubLocation()

    expect(isOnLoginPage(LOGIN_URL, '/chat')).toBe(false)
    expect(isOnLoginPage(LOGIN_URL, LOGIN_URL)).toBe(true)
    expect(isOnLoginPage(LOGIN_URL, `${LOGIN_URL}/`)).toBe(true)
    expect(isOnLoginPage('', '/chat')).toBe(false)
  })
})
