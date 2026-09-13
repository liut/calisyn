import type { AxiosProgressEvent } from 'axios'
import { del, get, put, upload } from '@/utils/request'

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
  /** 内容搜索关键词：走向量（语义）匹配，不做 like。 */
  match?: string
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

export type CorpusImportTaskStatus = 'pending' | 'processing' | 'succeeded' | 'failed'

export type CorpusImportFailureKind = 'failed' | 'skipped'

export interface CorpusImportFailure {
  /** 行号（表头为第 1 行，数据从第 2 行起） */
  line: number
  title: string
  reason: string
  /**
   * 明细类型。「失败行导出」依赖它区分失败与跳过；
   * morrigan 未部署该字段时缺省，调用方需按 reason 与计数降级判定。
   */
  kind?: CorpusImportFailureKind
}

export interface CorpusImportTask {
  id: string
  filename: string
  status: CorpusImportTaskStatus
  total: number
  success: number
  failed: number
  skipped: number
  errors?: CorpusImportFailure[]
  createdAt?: string | null
  updatedAt?: string | null
  startedAt?: string | null
  finishedAt?: string | null
}

export interface CorpusImportQueryParams {
  page?: number
  limit?: number
  status?: CorpusImportTaskStatus
  /** 文件名前缀匹配 */
  filename?: string
  sort?: string
}

export interface CorpusImportListResult {
  data: CorpusImportTask[]
  total: number
}

export type CorpusImportListPayload = CorpusEnvelope<CorpusImportListResult>

export type CorpusImportTaskPayload = CorpusEnvelope<CorpusImportTask>

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

/**
 * 上传 CSV 创建导入任务（morrigan POST /api/corpus/imports，multipart 字段名 `file`）。
 * 请求层不设置 Content-Type，multipart boundary 交给浏览器生成。
 */
export function createCorpusImport(
  file: File,
  options: { onUploadProgress?: (event: AxiosProgressEvent) => void } = {},
) {
  const form = new FormData()
  form.append('file', file)

  return upload<CorpusImportTaskPayload>({
    url: '/corpus/imports',
    data: form,
    onUploadProgress: options.onUploadProgress,
  }) as unknown as Promise<CorpusImportTaskPayload>
}

/**
 * 查询导入任务列表（morrigan GET /api/corpus/imports）。
 * 列表响应不含 CSV 原文与逐行明细，明细需按任务 ID 单独拉取。
 */
export function fetchCorpusImports(params: CorpusImportQueryParams = {}) {
  return get<CorpusImportListPayload>({ url: '/corpus/imports', data: params }) as unknown as Promise<CorpusImportListPayload>
}

/**
 * 查询导入任务详情（morrigan GET /api/corpus/imports/:id），含 `errors[]` 逐行明细。
 */
export function fetchCorpusImport(id: string) {
  return get<CorpusImportTaskPayload>({ url: `/corpus/imports/${id}` }) as unknown as Promise<CorpusImportTaskPayload>
}
