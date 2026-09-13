import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequest } = vi.hoisted(() => ({
  mockRequest: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

vi.mock('./axios', () => ({ default: mockRequest }))

const importRequest = () => import('./index')

describe('request/index.ts - HTTP method routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const ok = { status: 200, data: { status: 'Success', data: 'test' } }
    mockRequest.get.mockResolvedValue(ok)
    mockRequest.post.mockResolvedValue(ok)
    mockRequest.patch.mockResolvedValue(ok)
    mockRequest.put.mockResolvedValue(ok)
    mockRequest.delete.mockResolvedValue(ok)
  })

  it('routes GET through request.get with params', async () => {
    const { get } = await importRequest()
    await get({ url: '/test', data: { key: 'value' } })

    expect(mockRequest.get).toHaveBeenCalledWith('/test', {
      params: { key: 'value' },
      signal: undefined,
      onDownloadProgress: undefined,
    })
    expect(mockRequest.post).not.toHaveBeenCalled()
    expect(mockRequest.delete).not.toHaveBeenCalled()
  })

  it('routes POST through request.post with the body', async () => {
    const { post } = await importRequest()
    await post({ url: '/test', data: { key: 'value' } })

    expect(mockRequest.post).toHaveBeenCalledWith('/test', { key: 'value' }, {
      headers: undefined,
      signal: undefined,
      onDownloadProgress: undefined,
    })
    expect(mockRequest.get).not.toHaveBeenCalled()
  })

  it('routes PATCH through request.patch with the body', async () => {
    const { patch } = await importRequest()
    await patch({ url: '/test', data: { key: 'value' } })

    expect(mockRequest.patch).toHaveBeenCalledWith('/test', { key: 'value' }, {
      headers: undefined,
      signal: undefined,
      onDownloadProgress: undefined,
    })
    expect(mockRequest.post).not.toHaveBeenCalled()
  })

  it('routes PUT through request.put with the body', async () => {
    const { put } = await importRequest()
    await put({ url: '/test', data: { key: 'value' } })

    expect(mockRequest.put).toHaveBeenCalledWith('/test', { key: 'value' }, {
      headers: undefined,
      signal: undefined,
      onDownloadProgress: undefined,
    })
    expect(mockRequest.post).not.toHaveBeenCalled()
  })

  it('routes DELETE through request.delete with params and headers', async () => {
    const { del } = await importRequest()
    await del({ url: '/corpus/documents/abc', data: { key: 'value' }, headers: { 'X-Test': '1' } })

    expect(mockRequest.delete).toHaveBeenCalledWith('/corpus/documents/abc', {
      params: { key: 'value' },
      headers: { 'X-Test': '1' },
      signal: undefined,
      onDownloadProgress: undefined,
    })
    expect(mockRequest.post).not.toHaveBeenCalled()
    expect(mockRequest.get).not.toHaveBeenCalled()
  })

  it('falls back to request.post for unknown methods', async () => {
    const { get } = await importRequest()
    await get({ url: '/test', data: { key: 'value' }, method: 'OPTIONS' })

    expect(mockRequest.post).toHaveBeenCalledWith('/test', { key: 'value' }, {
      headers: undefined,
      signal: undefined,
      onDownloadProgress: undefined,
    })
    expect(mockRequest.get).not.toHaveBeenCalled()
  })
})

describe('request/index.ts - response handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves with the raw response body on success', async () => {
    mockRequest.get.mockResolvedValue({ status: 200, data: { status: 0, result: { data: [], total: 0 } } })

    const { get } = await importRequest()
    const res = await get({ url: '/corpus/documents' })

    expect(res).toEqual({ status: 0, result: { data: [], total: 0 } })
  })

  it('preserves the server message and HTTP status on failure', async () => {
    mockRequest.delete.mockRejectedValue({
      message: 'Request failed with status code 403',
      response: { status: 403, data: { status: 403, message: '无权限' } },
    })

    const { del } = await importRequest()
    await expect(del({ url: '/corpus/documents/abc' })).rejects.toMatchObject({
      message: '无权限',
      status: 403,
    })
  })

  it('falls back to the axios message when the server sends no message', async () => {
    mockRequest.get.mockRejectedValue({
      message: 'Request failed with status code 500',
      response: { status: 500, data: {} },
    })

    const { get } = await importRequest()
    await expect(get({ url: '/corpus/documents' })).rejects.toMatchObject({
      message: 'Request failed with status code 500',
      status: 500,
    })
  })

  it('keeps the axios message and leaves status undefined for network errors', async () => {
    mockRequest.get.mockRejectedValue({ message: 'Network Error' })

    const { get } = await importRequest()
    await expect(get({ url: '/corpus/documents' })).rejects.toMatchObject({
      message: 'Network Error',
      status: undefined,
    })
  })
})

describe('request/index.ts - Function exports', () => {
  it.each(['get', 'post', 'patch', 'put', 'del', 'upload'])('exports %s', async (name) => {
    const mod = await importRequest()
    expect(typeof mod[name as keyof typeof mod]).toBe('function')
  })

  it('defaults to post', async () => {
    const { default: requestDefault, post } = await importRequest()
    expect(requestDefault).toBe(post)
  })
})

describe('request/index.ts - upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequest.post.mockResolvedValue({ status: 200, data: { status: 'Success', data: { id: 't1' } } })
  })

  it('hands the FormData straight to axios without touching Content-Type', async () => {
    const { upload } = await importRequest()
    const form = new FormData()
    form.append('file', new File(['title,heading,content\n'], 'doc.csv', { type: 'text/csv' }))

    await upload({ url: '/corpus/imports', data: form })

    expect(mockRequest.post).toHaveBeenCalledWith('/corpus/imports', form, {
      headers: undefined,
      signal: undefined,
      onUploadProgress: undefined,
    })
    expect(mockRequest.post.mock.calls[0][1]).toBe(form)
    expect(mockRequest.post.mock.calls[0][2].headers).toBeUndefined()
  })

  it('forwards onUploadProgress to axios', async () => {
    const { upload } = await importRequest()
    const onUploadProgress = vi.fn()

    await upload({ url: '/corpus/imports', data: new FormData(), onUploadProgress })

    expect(mockRequest.post).toHaveBeenCalledWith('/corpus/imports', expect.any(FormData), {
      headers: undefined,
      signal: undefined,
      onUploadProgress,
    })
  })

  it('calls beforeRequest and afterRequest hooks', async () => {
    const { upload } = await importRequest()
    const beforeRequest = vi.fn()
    const afterRequest = vi.fn()

    await upload({ url: '/corpus/imports', data: new FormData(), beforeRequest, afterRequest })

    expect(beforeRequest).toHaveBeenCalledTimes(1)
    expect(afterRequest).not.toHaveBeenCalled()
  })

  it('preserves the server message and HTTP status when the upload is rejected', async () => {
    mockRequest.post.mockRejectedValue({
      message: 'Request failed with status code 413',
      response: { status: 413, data: { status: 413, message: '文件超过 10 MiB' } },
    })

    const { upload } = await importRequest()
    const afterRequest = vi.fn()

    await expect(upload({ url: '/corpus/imports', data: new FormData(), afterRequest })).rejects.toMatchObject({
      message: '文件超过 10 MiB',
      status: 413,
    })
    expect(afterRequest).toHaveBeenCalledTimes(1)
  })

  it('resolves with the raw response body on success', async () => {
    const { upload } = await importRequest()

    const res = await upload({ url: '/corpus/imports', data: new FormData() })

    expect(res).toEqual({ status: 'Success', data: { id: 't1' } })
  })
})
