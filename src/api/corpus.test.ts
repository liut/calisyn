import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCorpusImport, deleteCorpusDocument, fetchCorpusDocuments, fetchCorpusImport, fetchCorpusImports, updateCorpusDocument } from './corpus'

const { getMock, putMock, delMock, uploadMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  uploadMock: vi.fn(),
}))

vi.mock('@/utils/request', () => ({
  get: getMock,
  put: putMock,
  del: delMock,
  upload: uploadMock,
}))

describe('corpus API layer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchCorpusDocuments passes query params to GET /corpus/documents', async () => {
    getMock.mockResolvedValue({ status: 0, result: { data: [{ id: 'd1', title: 't', heading: 'h', content: 'c' }], total: 1 } })

    const params = { page: 2, limit: 20, sort: '-updated', title: 'kw' }
    const res = await fetchCorpusDocuments(params)

    expect(getMock).toHaveBeenCalledWith({ url: '/corpus/documents', data: params })
    expect(res.result?.total).toBe(1)
  })

  it('fetchCorpusDocuments works without params', async () => {
    getMock.mockResolvedValue({ status: 0 })

    await fetchCorpusDocuments()

    expect(getMock).toHaveBeenCalledWith({ url: '/corpus/documents', data: {} })
  })

  it('fetchCorpusDocuments forwards the semantic match keyword', async () => {
    getMock.mockResolvedValue({ status: 0, result: { data: [], total: 0 } })

    await fetchCorpusDocuments({ page: 1, limit: 20, sort: '-updated', match: 'kv cache' })

    expect(getMock).toHaveBeenCalledWith({
      url: '/corpus/documents',
      data: { page: 1, limit: 20, sort: '-updated', match: 'kv cache' },
    })
  })

  it('updateCorpusDocument PUTs to the document URL with the patch body', async () => {
    putMock.mockResolvedValue({ status: 0, result: 'ok' })

    const patch = { title: '新标题', content: 'x' }
    const res = await updateCorpusDocument('doc1', patch)

    expect(putMock).toHaveBeenCalledWith({ url: '/corpus/documents/doc1', data: patch })
    expect(res.result).toBe('ok')
  })

  it('deleteCorpusDocument DELETEs the document URL', async () => {
    delMock.mockResolvedValue({ status: 0, result: 'ok' })

    const res = await deleteCorpusDocument('doc1')

    expect(delMock).toHaveBeenCalledWith({ url: '/corpus/documents/doc1' })
    expect(res.result).toBe('ok')
  })
})

describe('corpus import API layer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createCorpusImport posts the selected file as the multipart `file` field', async () => {
    uploadMock.mockResolvedValue({ status: 0, result: { id: 't1', status: 'pending' } })
    const file = new File(['title,heading,content\n'], 'doc.csv', { type: 'text/csv' })

    const res = await createCorpusImport(file)

    expect(uploadMock).toHaveBeenCalledTimes(1)
    const call = uploadMock.mock.calls[0][0] as { url: string, data: FormData, onUploadProgress?: unknown }
    expect(call.url).toBe('/corpus/imports')
    expect(call.data).toBeInstanceOf(FormData)
    expect(call.data.get('file')).toBe(file)
    expect(call.onUploadProgress).toBeUndefined()
    expect(res.result?.id).toBe('t1')
  })

  it('createCorpusImport forwards the upload progress callback', async () => {
    uploadMock.mockResolvedValue({ status: 0, result: { id: 't1' } })
    const onUploadProgress = vi.fn()

    await createCorpusImport(new File(['x'], 'doc.csv'), { onUploadProgress })

    expect(uploadMock).toHaveBeenCalledWith(expect.objectContaining({ onUploadProgress }))
  })

  it('fetchCorpusImports passes query params to GET /corpus/imports', async () => {
    getMock.mockResolvedValue({ status: 0, result: { data: [{ id: 't1', filename: 'a.csv', status: 'pending' }], total: 1 } })

    const params = { page: 2, limit: 20, status: 'pending' as const, sort: '-created' }
    const res = await fetchCorpusImports(params)

    expect(getMock).toHaveBeenCalledWith({ url: '/corpus/imports', data: params })
    expect(res.result?.total).toBe(1)
  })

  it('fetchCorpusImports tolerates a list response without details', async () => {
    getMock.mockResolvedValue({ status: 0, result: { data: [{ id: 't1', filename: 'a.csv', status: 'processing', total: 0, success: 0, failed: 0, skipped: 0 }], total: 1 } })

    const res = await fetchCorpusImports()

    expect(getMock).toHaveBeenCalledWith({ url: '/corpus/imports', data: {} })
    expect(res.result?.data[0].errors).toBeUndefined()
  })

  it('fetchCorpusImport GETs the task detail URL', async () => {
    getMock.mockResolvedValue({ status: 0, result: { id: 't9', errors: [] } })

    const res = await fetchCorpusImport('t9')

    expect(getMock).toHaveBeenCalledWith({ url: '/corpus/imports/t9' })
    expect(res.result?.id).toBe('t9')
  })
})
