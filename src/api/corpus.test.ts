import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteCorpusDocument, fetchCorpusDocuments, updateCorpusDocument } from './corpus'

const { getMock, putMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
}))

vi.mock('@/utils/request', () => ({
  get: getMock,
  put: putMock,
  del: delMock,
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
