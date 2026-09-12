import type { CorpusDocument, CorpusDocumentPatch } from '@/api/corpus'

export type CorpusSortField = 'updated' | 'created' | 'heading'

export type CorpusSortOrder = 'ascend' | 'descend'

export interface PagedResult<T> {
  rows: T[]
  total: number
}

/**
 * 只提交用户实际改动的字段。抽屉的表单来自可能已经过期的列表快照，
 * 整体提交会把陈旧字段一起写回服务端，覆盖其他 keeper 的修改。
 */
export function buildCorpusPatch(
  original: CorpusDocument | null,
  form: CorpusDocumentPatch,
): CorpusDocumentPatch {
  const patch: CorpusDocumentPatch = {}

  if (!original)
    return patch

  if (form.title !== undefined && form.title !== original.title)
    patch.title = form.title

  if (form.heading !== undefined && form.heading !== original.heading)
    patch.heading = form.heading

  if (form.content !== undefined && form.content !== original.content)
    patch.content = form.content

  return patch
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
