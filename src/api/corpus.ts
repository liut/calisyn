import { del, get, put } from '@/utils/request'

export interface CorpusDocument {
  id: string
  title: string
  heading: string
  content: string
  createdAt?: string | null
  updatedAt?: string | null
  creatorID?: string
  meta?: Record<string, unknown>
}

export interface CorpusQueryParams {
  page?: number
  limit?: number
  skip?: number
  sort?: string
  title?: string
  heading?: string
  content?: string
}

export interface CorpusListResult {
  data: CorpusDocument[]
  total: number
}

export interface CorpusEnvelope<T> {
  status: number
  result?: T
  message?: string
}

export type CorpusListPayload = CorpusEnvelope<CorpusListResult>

export type CorpusUpdatePayload = CorpusEnvelope<string>

export type CorpusDocumentPatch = Partial<Pick<CorpusDocument, 'title' | 'heading' | 'content'>>

/**
 * 查询语料文档列表（morrigan GET /api/corpus/documents）。
 * 返回信封 `{ status, result: { data, total } }`，调用方通过 `res.result` 取数。
 */
export function fetchCorpusDocuments(params: CorpusQueryParams = {}) {
  // 请求封装把 axios 响应体原样透传，但它声明的 `Response<T>` 描述的是 Express 的
  // `{ status, data }` 信封；morrigan 用的是 `{ status, result }`，这里做类型对齐。
  return get<CorpusListPayload>({ url: '/corpus/documents', data: params }) as unknown as Promise<CorpusListPayload>
}

/**
 * 更新语料文档（morrigan PUT /api/corpus/documents/:id）。
 */
export function updateCorpusDocument(id: string, patch: CorpusDocumentPatch) {
  return put<CorpusUpdatePayload>({ url: `/corpus/documents/${id}`, data: patch }) as unknown as Promise<CorpusUpdatePayload>
}

/**
 * 删除语料文档（morrigan DELETE /api/corpus/documents/:id）。
 */
export function deleteCorpusDocument(id: string) {
  return del<CorpusUpdatePayload>({ url: `/corpus/documents/${id}` }) as unknown as Promise<CorpusUpdatePayload>
}
