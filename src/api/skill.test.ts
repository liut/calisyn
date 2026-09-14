import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSkill, deleteSkill, fetchSkill, fetchSkills, updateSkill } from './skill'

const { getMock, postMock, putMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
}))

vi.mock('@/utils/request', () => ({
  get: getMock,
  post: postMock,
  put: putMock,
  del: delMock,
}))

describe('skill API layer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchSkills passes paging and sort params to GET /skills', async () => {
    getMock.mockResolvedValue({ status: 0, result: { data: [{ id: 'sk1', name: 'invoice' }], total: 1 } })

    const params = { page: 2, limit: 20, sort: '-created' }
    const res = await fetchSkills(params)

    expect(getMock).toHaveBeenCalledWith({ url: '/skills', data: params })
    expect(res.result?.total).toBe(1)
  })

  it('fetchSkills forwards name and owner together', async () => {
    getMock.mockResolvedValue({ status: 0, result: { data: [], total: 0 } })

    await fetchSkills({ name: 'inv', owner: 'us-1' })

    expect(getMock).toHaveBeenCalledWith({ url: '/skills', data: { name: 'inv', owner: 'us-1' } })
  })

  it('fetchSkills works without params', async () => {
    getMock.mockResolvedValue({ status: 0 })

    await fetchSkills()

    expect(getMock).toHaveBeenCalledWith({ url: '/skills', data: {} })
  })

  it('fetchSkills tolerates a payload without result', async () => {
    getMock.mockResolvedValue({ status: 0, message: 'boom' })

    const res = await fetchSkills()

    // 调用方按 `res.result?.data ?? []` / `res.result?.total ?? 0` 取值，不抛错。
    expect(res.result?.data ?? []).toEqual([])
    expect(res.result?.total ?? 0).toBe(0)
  })

  it('fetchSkills lets callers treat a missing total as zero', async () => {
    getMock.mockResolvedValue({ status: 0, result: { data: [{ id: 'sk1', name: 'invoice' }] } })

    const res = await fetchSkills({ page: 1 })

    expect(res.result?.total ?? 0).toBe(0)
  })

  it('fetchSkill GETs the skill detail URL', async () => {
    getMock.mockResolvedValue({ status: 0, result: { id: 'sk1', name: 'invoice', content: 'body' } })

    const res = await fetchSkill('invoice')

    expect(getMock).toHaveBeenCalledWith({ url: '/skills/invoice' })
    expect(res.result?.content).toBe('body')
  })

  it('fetchSkill treats a missing file list as empty', async () => {
    getMock.mockResolvedValue({ status: 0, result: { id: 'sk1', name: 'invoice' } })

    const res = await fetchSkill('invoice')

    expect(res.result?.files ?? []).toEqual([])
  })

  it('createSkill POSTs the full JSON body including channel', async () => {
    postMock.mockResolvedValue({ status: 0, result: { id: 'sk1' } })

    const input = { name: 'invoice', description: 'desc', content: '---\nname: invoice\n---\nbody', channel: 'web' as const }
    const res = await createSkill(input)

    expect(postMock).toHaveBeenCalledWith({ url: '/skills', data: input })
    expect(res.result?.id).toBe('sk1')
  })

  it('updateSkill PUTs the patch body to the skill URL', async () => {
    putMock.mockResolvedValue({ status: 0, result: 'ok' })

    const patch = { description: 'x' }
    const res = await updateSkill('invoice', patch)

    expect(putMock).toHaveBeenCalledWith({ url: '/skills/invoice', data: patch })
    expect(res.result).toBe('ok')
  })

  it('deleteSkill DELETEs the skill URL', async () => {
    delMock.mockResolvedValue({ status: 0, result: 'ok' })

    const res = await deleteSkill('invoice')

    expect(delMock).toHaveBeenCalledWith({ url: '/skills/invoice' })
    expect(res.result).toBe('ok')
  })
})
