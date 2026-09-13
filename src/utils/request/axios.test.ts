import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { redirectToLoginMock } = vi.hoisted(() => ({ redirectToLoginMock: vi.fn() }))

vi.mock('./unauthorized', () => ({ redirectToLogin: redirectToLoginMock }))

const importService = async () => (await import('./axios')).default

/** 用自定义 adapter 直接抛出带响应对象的错误，跳过真实请求。 */
function adapterRejectingWith(status: number) {
  return () => Promise.reject(
    Object.assign(new Error(`Request failed with status code ${status}`), {
      response: { status, data: null },
    }),
  )
}

describe('utils/request/axios.ts - unauthorized handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    setActivePinia(createPinia())
  })

  it('redirects to login when a request fails with 401', async () => {
    const service = await importService()

    await expect(service.get('/corpus/documents', { adapter: adapterRejectingWith(401) })).rejects.toBeTruthy()

    expect(redirectToLoginMock).toHaveBeenCalledTimes(1)
  })

  it('leaves other failures to the caller', async () => {
    const service = await importService()

    await expect(service.get('/corpus/documents', { adapter: adapterRejectingWith(403) })).rejects.toBeTruthy()

    expect(redirectToLoginMock).not.toHaveBeenCalled()
  })
})
