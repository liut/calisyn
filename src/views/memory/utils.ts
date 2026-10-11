import type { MemoryDetail, MemoryPatch, MemoryTier } from '@/api/memory'

/** 与后端记忆模型 `tier` 枚举对齐；UI 按已知值做标签与选项。 */
export const MEMORY_TIERS: MemoryTier[] = ['working', 'short-term', 'long-term']

export type MemorySortField = 'created' | 'updated' | 'key'
export type MemorySortOrder = 'ascend' | 'descend'

/** 后端 `ModelSpec.CanSort` 白名单：`created` / `updated` 是时间字段，`key` 是名称字段。 */
export const MEMORY_SORTABLE_FIELDS: MemorySortField[] = ['created', 'updated', 'key']
export const MEMORY_DEFAULT_SORT_FIELD: MemorySortField = 'created'
export const MEMORY_DEFAULT_SORT_ORDER: MemorySortOrder = 'descend'
export interface MemoryTierOption {
  labelKey: string
  /** 是否可在抽屉里改；未知值只能读。 */
  editable: boolean
}

const TIER_LABEL_KEYS: Record<MemoryTier, string> = {
  'working': 'memory.tierWorking',
  'short-term': 'memory.tierShortTerm',
  'long-term': 'memory.tierLongTerm',
}

/**
 * 分层呈现：三个已知值可编辑并各有文案；其余值（包括空串与历史脏数据）只读。
 * 未知值在保存时不会产出 `tier` 字段，避免被静默改写成已知枚举。
 */
export function memoryTierOption(value?: string | null): MemoryTierOption {
  if (typeof value === 'string' && value in TIER_LABEL_KEYS)
    return { labelKey: TIER_LABEL_KEYS[value as MemoryTier], editable: true }

  return { labelKey: 'memory.tierUnknown', editable: false }
}

/** 抽屉的编辑态：分类、正文、分层；分层在「不可编辑」分支下不参与 patch。 */
export interface MemoryEditForm {
  cate: string
  content: string
  tier: string
}

export function emptyMemoryForm(): MemoryEditForm {
  return { cate: '', content: '', tier: '' }
}

/**
 * 更新 patch：与详情快照逐字段比较，只产出真正变化的 `cate` / `content` / `tier`。
 * - 分层不可编辑时不产出 `tier`。
 * - 三项都没变时返回空对象，调用方据此禁用保存按钮。
 */
export function buildMemoryPatch(
  original: MemoryDetail | null,
  form: MemoryEditForm,
): MemoryPatch {
  const patch: MemoryPatch = {}

  if (!original) {
    if (form.cate)
      patch.cate = form.cate

    if (form.content)
      patch.content = form.content

    if (form.tier)
      patch.tier = form.tier as MemoryTier

    return patch
  }

  const originalCate = original.cate ?? ''
  const originalContent = original.content ?? ''

  if (form.cate !== originalCate)
    patch.cate = form.cate

  if (form.content !== originalContent)
    patch.content = form.content

  const option = memoryTierOption(original.tier)

  if (option.editable && form.tier !== original.tier && form.tier)
    patch.tier = form.tier as MemoryTier

  return patch
}

/**
 * 请求错误到文案 key：401/403 是全局鉴权态，与具体资源无关；
 * 404 在抽屉里表示「条目不存在」，但列表场景里大概率是路径级错误，
 * 因此不在这条公共规则里硬绑，由各调用方自己读 `err.status === 404`。
 */
export function memoryErrorKey(error: unknown, fallbackKey: string): string {
  const err = error as { status?: number, message?: string } | undefined

  if (err?.status === 403)
    return 'memory.permissionDenied'

  if (err?.status === 401)
    return 'memory.authExpired'

  return fallbackKey
}

/** 错误对象是否为 404：抽屉用这个分支决定「条目不在了」语义。 */
export function isNotFoundError(error: unknown): boolean {
  return (error as { status?: number } | undefined)?.status === 404
}

/** 排序参数：`descend` 用前导 `-` 表达，与语料、技能面板同形。 */
export function memorySortParam(field: MemorySortField, order: MemorySortOrder): string {
  return `${order === 'descend' ? '-' : ''}${field}`
}
