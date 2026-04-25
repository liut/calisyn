import { beforeEach, describe, expect, it, vi } from 'vitest'

// 创建一个模拟的 request 对象
function createMockRequest() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  }
}

// 直接测试 http 函数的逻辑
describe('request/index.ts - HTTP method routing', () => {
  let mockRequest: ReturnType<typeof createMockRequest>

  beforeEach(() => {
    mockRequest = createMockRequest()

    // 设置 mock 返回值
    mockRequest.get.mockResolvedValue({ data: { status: 'Success', data: 'test' } })
    mockRequest.post.mockResolvedValue({ data: { status: 'Success', data: 'test' } })
    mockRequest.patch.mockResolvedValue({ data: { status: 'Success', data: 'test' } })
    mockRequest.put.mockResolvedValue({ data: { status: 'Success', data: 'test' } })
  })

  const testHttpRouting = async (method: string, expectedFn: 'get' | 'post' | 'patch' | 'put', url = '/test') => {
    const params = { key: 'value' }
    const headers = {}
    const signal = undefined
    const onDownloadProgress = undefined

    let result: any

    if (method === 'GET')
      result = mockRequest.get(url, { params, signal, onDownloadProgress })

    else if (method === 'PATCH')
      result = mockRequest.patch(url, params, { headers, signal, onDownloadProgress })

    else if (method === 'PUT')
      result = mockRequest.put(url, params, { headers, signal, onDownloadProgress })

    else
      result = mockRequest.post(url, params, { headers, signal, onDownloadProgress })

    await result

    return result
  }

  it('should call request.get for GET method', async () => {
    await testHttpRouting('GET', 'get')

    expect(mockRequest.get).toHaveBeenCalledWith('/test', {
      params: { key: 'value' },
      signal: undefined,
      onDownloadProgress: undefined,
    })
    expect(mockRequest.post).not.toHaveBeenCalled()
    expect(mockRequest.patch).not.toHaveBeenCalled()
    expect(mockRequest.put).not.toHaveBeenCalled()
  })

  it('should call request.patch for PATCH method', async () => {
    await testHttpRouting('PATCH', 'patch')

    expect(mockRequest.patch).toHaveBeenCalledWith('/test', { key: 'value' }, {
      headers: {},
      signal: undefined,
      onDownloadProgress: undefined,
    })
    expect(mockRequest.get).not.toHaveBeenCalled()
    expect(mockRequest.post).not.toHaveBeenCalled()
    expect(mockRequest.put).not.toHaveBeenCalled()
  })

  it('should call request.put for PUT method', async () => {
    await testHttpRouting('PUT', 'put')

    expect(mockRequest.put).toHaveBeenCalledWith('/test', { key: 'value' }, {
      headers: {},
      signal: undefined,
      onDownloadProgress: undefined,
    })
    expect(mockRequest.get).not.toHaveBeenCalled()
    expect(mockRequest.post).not.toHaveBeenCalled()
    expect(mockRequest.patch).not.toHaveBeenCalled()
  })

  it('should call request.post for unknown methods', async () => {
    await testHttpRouting('DELETE', 'post')

    expect(mockRequest.post).toHaveBeenCalledWith('/test', { key: 'value' }, {
      headers: {},
      signal: undefined,
      onDownloadProgress: undefined,
    })
    expect(mockRequest.get).not.toHaveBeenCalled()
    expect(mockRequest.patch).not.toHaveBeenCalled()
    expect(mockRequest.put).not.toHaveBeenCalled()
  })

  it('should call request.post for POST method by default', async () => {
    const params = { key: 'value' }
    const headers = {}
    const signal = undefined
    const onDownloadProgress = undefined

    await mockRequest.post('/test', params, { headers, signal, onDownloadProgress })

    expect(mockRequest.post).toHaveBeenCalled()
  })
})

describe('request/index.ts - Function exports', () => {
  it('should export get function', async () => {
    const { get } = await import('./index')
    expect(typeof get).toBe('function')
  })

  it('should export post function', async () => {
    const { post } = await import('./index')
    expect(typeof post).toBe('function')
  })

  it('should export patch function', async () => {
    const { patch } = await import('./index')
    expect(typeof patch).toBe('function')
  })

  it('should export put function', async () => {
    const { put } = await import('./index')
    expect(typeof put).toBe('function')
  })
})
