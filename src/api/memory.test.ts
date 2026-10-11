import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteMemory, fetchMemories, fetchMemory, updateMemory } from './memory'

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

describe('memory API layer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchMemories always pins ownerID to "me" so list never leaks others', async () => {
    getMock.mockResolvedValueOnce({ status: 'Success', result: { data: [], total: 0 } })

    await fetchMemories({ page: 1, limit: 20, sort: '-created' })

    expect(getMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/memories',
        data: expect.objectContaining({
          page: 1,
          limit: 20,
          sort: '-created',
          ownerID: 'me',
        }),
      }),
    )
  })

  it('fetchMemories merges keyword and tier with the pinned ownerID', async () => {
    getMock.mockResolvedValueOnce({ status: 'Success', result: { data: [], total: 0 } })

    await fetchMemories({ key: 'foo', tier: 'long-term', page: 2, limit: 10 })

    const call = getMock.mock.calls[0][0]

    expect(call.url).toBe('/memories')
    expect(call.data).toMatchObject({
      key: 'foo',
      tier: 'long-term',
      page: 2,
      limit: 10,
      ownerID: 'me',
    })
  })

  it('fetchMemories works without params and still pins ownerID', async () => {
    getMock.mockResolvedValueOnce({ status: 'Success', result: { data: [], total: 0 } })

    await fetchMemories()

    expect(getMock.mock.calls[0][0].data).toMatchObject({ ownerID: 'me' })
  })

  it('fetchMemories tolerates a payload without result', async () => {
    getMock.mockResolvedValueOnce({ status: 'Success' })

    const res = await fetchMemories()

    expect(res.result).toBeUndefined()
  })

  it('fetchMemories lets callers treat a missing total as zero', async () => {
    getMock.mockResolvedValueOnce({ status: 'Success', result: { data: [] } })

    const res = await fetchMemories()

    expect(res.result?.total).toBeUndefined()
  })

  it('fetchMemory GETs the memory detail URL by id', async () => {
    getMock.mockResolvedValueOnce({ status: 'Success', result: null })

    await fetchMemory('abc-123')

    expect(getMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/memories/abc-123' }),
    )
  })

  it('updateMemory PUTs only the fields the caller actually changed', async () => {
    putMock.mockResolvedValueOnce({ status: 'Success' })

    await updateMemory('m-1', { content: 'new content' })

    expect(putMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/memories/m-1',
        data: { content: 'new content' },
      }),
    )
  })

  it('updateMemory forwards multiple changed fields together', async () => {
    putMock.mockResolvedValueOnce({ status: 'Success' })

    await updateMemory('m-2', { cate: 'preference', tier: 'long-term', content: 'x' })

    expect(putMock.mock.calls[0][0].data).toEqual({
      cate: 'preference',
      tier: 'long-term',
      content: 'x',
    })
  })

  it('deleteMemory DELETEs the memory URL', async () => {
    delMock.mockResolvedValueOnce({ status: 'Success' })

    await deleteMemory('m-3')

    expect(delMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/memories/m-3' }),
    )
  })
})
