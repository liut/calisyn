import { del, get, post, put } from '@/utils/request'

/** 技能可用频道；后端是位掩码，但编解码只支持这四个单值。 */
export type SkillChannel = 'none' | 'web' | 'wecom' | 'feishu'

/** 列表行：后端 `ExcludeColumn("content")`，元数据里没有正文。 */
export interface SkillMeta {
  id: string
  name: string
  description: string
  /** 直接改库可能写入掩码组合（如 `channel 3`），界面按不可编辑处理。 */
  channel: SkillChannel | string
  /** 创建者 oid，与 `/api/session` 的 `user.oid` 同源，可直接字符串比较。 */
  owner: string
  /**
   * 记录级自定义元数据（jsonb，与 frontmatter 无关），例如 `{ owner: 'admin' }`。
   * 列表响应也带它；`meta.owner` 目前只作展示。
   */
  meta?: Record<string, unknown>
  createdAt?: string | null
  updatedAt?: string | null
}

/** 资源文件清单项：「技能详情」只返回文件名与元信息，不含文件内容。 */
export interface SkillFile {
  path: string
  mime?: string
  kind?: string
  size?: number
}

export interface SkillDetail extends SkillMeta {
  content: string
  files?: SkillFile[]
}

export interface SkillQueryParams {
  page?: number
  limit?: number
  skip?: number
  /** 排序白名单只有 `created` / `updated`（后端 `SkillSpec` 未扩展 `CanSort`）。 */
  sort?: string
  /** 技能名前缀匹配（`ILIKE 'kw%'`），不是包含匹配。 */
  name?: string
  /** 归属筛选走服务端参数，分页与总数在筛选下才正确。 */
  owner?: string
  channel?: SkillChannel
}

export interface SkillCreateInput {
  name: string
  description: string
  content: string
  channel?: SkillChannel
}

/** 更新只提交改变的字段：描述/正文变化时由调用方连带重建 `content`。 */
export interface SkillPatch {
  description?: string
  content?: string
  channel?: SkillChannel
}

export interface SkillListResult {
  data: SkillMeta[]
  /** 后端 `ResultData.Total` 带 `omitempty`，总数为 0 时字段缺失，调用方按 `?? 0` 处理。 */
  total?: number
}

export interface SkillCreateResult {
  id: string
}

export interface SkillEnvelope<T> {
  status: number
  result?: T
  message?: string
}

export type SkillListPayload = SkillEnvelope<SkillListResult>

export type SkillDetailPayload = SkillEnvelope<SkillDetail>

export type SkillCreatePayload = SkillEnvelope<SkillCreateResult>

export type SkillMutationPayload = SkillEnvelope<string>

/**
 * 查询可见技能列表（morrigan GET /api/skills）。
 * 服务端强制「频道投放 ∪ 自己创建」的可见性并裁剪正文，客户端无法绕过。
 */
export function fetchSkills(params: SkillQueryParams = {}) {
  // 请求封装把 axios 响应体原样透传，但它声明的 `Response<T>` 描述的是 Express 的
  // `{ status, data }` 信封；morrigan 用的是 `{ status, result }`，这里做类型对齐。
  return get<SkillListPayload>({ url: '/skills', data: params }) as unknown as Promise<SkillListPayload>
}

/**
 * 查询技能详情（morrigan GET /api/skills/:name），含全文与资源文件清单。
 * 不可见与不存在同样返回 404。
 */
export function fetchSkill(name: string) {
  return get<SkillDetailPayload>({ url: `/skills/${name}` }) as unknown as Promise<SkillDetailPayload>
}

/**
 * 创建技能（morrigan POST /api/skills）。
 * 必须走 JSON：绑定层对 multipart 只读带 `form` 标签的字段，用表单编码会让 `channel` 被静默丢弃。
 */
export function createSkill(input: SkillCreateInput) {
  return post<SkillCreatePayload>({ url: '/skills', data: input }) as unknown as Promise<SkillCreatePayload>
}

/** 更新自己的技能（morrigan PUT /api/skills/:name），name 不可变更。 */
export function updateSkill(name: string, patch: SkillPatch) {
  return put<SkillMutationPayload>({ url: `/skills/${name}`, data: patch }) as unknown as Promise<SkillMutationPayload>
}

/** 删除自己的技能（morrigan DELETE /api/skills/:name）。 */
export function deleteSkill(name: string) {
  return del<SkillMutationPayload>({ url: `/skills/${name}` }) as unknown as Promise<SkillMutationPayload>
}
