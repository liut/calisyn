import type { CorpusDocument } from '@/api/corpus'

export type CorpusSortField = 'updated' | 'created' | 'heading'

export type CorpusSortOrder = 'ascend' | 'descend'

function timeValue(value?: string): number {
  if (!value)
    return 0

  const time = Date.parse(value)

  return Number.isNaN(time) ? 0 : time
}

/**
 * 合并标题/小节/内容三路关键词查询结果。
 * 按 id 去重（后出现的结果不覆盖先出现的），并按更新时间倒序（缺省回退创建时间）。
 */
export function mergeCorpusSearch(results: CorpusDocument[][]): CorpusDocument[] {
  const byId = new Map<string, CorpusDocument>()

  results.flat().forEach((document) => {
    if (document?.id && !byId.has(document.id))
      byId.set(document.id, document)
  })

  return [...byId.values()].sort((a, b) =>
    timeValue(b.updatedAt ?? b.createdAt) - timeValue(a.updatedAt ?? a.createdAt),
  )
}

/**
 * 客户端排序。关键词搜索时结果在前端合并，排序也需在前端完成；
 * 无关键词时由 morrigan 的 `sort` 参数在服务器侧排序。
 */
export function sortCorpusDocuments(
  documents: CorpusDocument[],
  field: CorpusSortField,
  order: CorpusSortOrder,
): CorpusDocument[] {
  const factor = order === 'ascend' ? 1 : -1

  return [...documents].sort((a, b) => {
    if (field === 'heading')
      return factor * (a.heading ?? '').localeCompare(b.heading ?? '')

    const key = field === 'created' ? 'createdAt' : 'updatedAt'

    return factor * (timeValue(a[key]) - timeValue(b[key]))
  })
}

export interface PagedResult<T> {
  rows: T[]
  total: number
}

/** 把请求错误映射到语料文案 key；非权限类错误返回 null，由调用方选择兜底文案。 */
export function corpusErrorKey(error: unknown): string | null {
  const status = (error as { status?: number } | undefined)?.status

  if (status === 403)
    return 'corpus.permissionDenied'

  if (status === 401)
    return 'corpus.authExpired'

  return null
}

/** 客户端分页：关键词搜索时对合并后的结果集切片。 */
export function paginate<T>(items: T[], page: number, pageSize: number): PagedResult<T> {
  const size = Math.max(1, Math.floor(pageSize) || 1)
  const current = Math.max(1, Math.floor(page) || 1)
  const start = (current - 1) * size

  return {
    rows: items.slice(start, start + size),
    total: items.length,
  }
}
