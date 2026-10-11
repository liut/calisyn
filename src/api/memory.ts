import { del, get, put } from '@/utils/request'

/** 分层：与后端记忆模型 `tier` 字段一致；UI 按已知值做标签与选项。 */
export type MemoryTier = 'working' | 'short-term' | 'long-term'

/**
 * 列表行：后端 `ExcludeColumn("content")`，元数据里没有正文。
 * 详情接口才会带正文，避免分页时把全部正文一并拉下来。
 */
export interface MemoryMeta {
  id: string
  ownerID: string
  key: string
  cate: string
  tier: string
  importanceScore: number
  lastAccessedAt?: string | null
  accessCount: number
  decayRate: number
  createdAt?: string | null
  updatedAt?: string | null
  creatorID: string
  meta?: Record<string, unknown>
}

/** 详情：仅在按 id 单独拉取时返回正文。 */
export interface MemoryDetail extends MemoryMeta {
  content: string
}

/**
 * 列表查询参数。
 * - 关键词对应后端 `key` 的前缀匹配（`SiftMatch` → `ILIKE 'kw%'`）。
 * - 分层精确匹配。
 * - 归属收窄不由调用方控制：`fetchMemories` 内部固定 `ownerID: 'me'`。
 */
export interface MemoryQueryParams {
  page?: number
  limit?: number
  skip?: number
  /** 排序白名单只有 `created` / `updated`（后端 `ModelSpec.CanSort`）。 */
  sort?: string
  /** key 的前缀匹配，不是包含匹配。 */
  key?: string
  tier?: MemoryTier | string
}

export interface MemoryListResult {
  data: MemoryMeta[]
  /** 后端 `ResultData.Total` 带 `omitempty`，总数为 0 时字段缺失，调用方按 `?? 0` 处理。 */
  total?: number
}

export interface MemoryEnvelope<T> {
  status: number
  result?: T
  message?: string
}

export type MemoryListPayload = MemoryEnvelope<MemoryListResult>
export type MemoryDetailPayload = MemoryEnvelope<MemoryDetail>
export type MemoryMutationPayload = MemoryEnvelope<string>

/**
 * 更新只提交改变的字段：`cate` / `content` / `tier`。
 * 分层在「未知值」分支下不产出 `tier`，避免被静默改写。
 */
export interface MemoryPatch {
  cate?: string
  content?: string
  tier?: MemoryTier
}

/**
 * 查询自己的记忆列表（morrigan GET /api/memories）。
 * 请求封装把 axios 响应体原样透传，但它声明的 `Response<T>` 描述的是 Express 的
 * `{ status, data }` 信封；morrigan 用的是 `{ status, result }`，这里做类型对齐。
 *
 * 列表请求固定带 `ownerID: 'me'`，让后端把范围收窄到本人：
 * - 普通用户身份下后端本来就强制收窄，这里是为了让 keeper 也只看到自己的记忆。
 * - 前端不再判断角色：页面语义始终是「本人」，不分 keeper 与普通用户。
 */
export function fetchMemories(params: MemoryQueryParams = {}) {
  const data = { ...params, ownerID: 'me' }

  return get<MemoryListPayload>({ url: '/memories', data }) as unknown as Promise<MemoryListPayload>
}

/**
 * 查询记忆详情（morrigan GET /api/memories/:id），含正文。
 * 不可见与不存在同样返回 404。
 */
export function fetchMemory(id: string) {
  return get<MemoryDetailPayload>({ url: `/memories/${id}` }) as unknown as Promise<MemoryDetailPayload>
}

/**
 * 更新自己的记忆（morrigan PUT /api/memories/:id）。
 * `key` 与 `ownerID` 不可变更；只提交实际改动的字段。
 */
export function updateMemory(id: string, patch: MemoryPatch) {
  return put<MemoryMutationPayload>({ url: `/memories/${id}`, data: patch }) as unknown as Promise<MemoryMutationPayload>
}

/**
 * 删除自己的记忆（morrigan DELETE /api/memories/:id）。
 */
export function deleteMemory(id: string) {
  return del<MemoryMutationPayload>({ url: `/memories/${id}` }) as unknown as Promise<MemoryMutationPayload>
}
