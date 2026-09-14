import type { SkillChannel, SkillDetail, SkillPatch } from '@/api/skill'
import { parse, stringify } from 'yaml'

/** 与后端 `skills.ValidName` 对齐：小写字母数字连字符，1–64 字符。 */
export const SKILL_NAME_MAX = 64
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** 与后端 `skills.MaxDescriptionLen` 对齐（按字符计，varchar(124) 语义）。 */
export const SKILL_DESCRIPTION_MAX = 124

export type SkillSortField = 'created' | 'updated'

export type SkillSortOrder = 'ascend' | 'descend'

/** 后端 `SkillSpec` 未扩展 `CanSort`，可排序列只有 `created` / `updated`。 */
export const SKILL_SORTABLE_FIELDS: SkillSortField[] = ['created', 'updated']

export const SKILL_DEFAULT_SORT_FIELD: SkillSortField = 'created'

export const SKILL_DEFAULT_SORT_ORDER: SkillSortOrder = 'descend'

/** 界面上可选的四个频道，顺序即表单与单选组里的呈现顺序。 */
export const SKILL_CHANNELS: SkillChannel[] = ['web', 'wecom', 'feishu', 'none']

/** 后端 `skills.Platform` 枚举只认这三个值；正文里其他平台名保留但不参与选择。 */
export const SKILL_PLATFORMS = ['linux', 'macos', 'windows'] as const

/** 平台名按小写比较：后端 `parsePlatforms` 同样忽略大小写与首尾空白。 */
export function isKnownPlatform(name: string): boolean {
  return (SKILL_PLATFORMS as readonly string[]).includes(name.trim().toLowerCase())
}

/** 元数据字符串字段的上限，与后端列宽（rune 计）一致；超出在提交时拦下。 */
export const SKILL_META_MAX = {
  version: 32,
  author: 128,
  license: 32,
  category: 32,
  homepage: 255,
} as const

/** 有列宽约束的元数据字段；`platforms` 与 `relatedSkills` 不受长度限制。 */
export type SkillMetaField = keyof typeof SKILL_META_MAX

/**
 * 提交时校验：返回超出后端列宽的字段。
 * 不做输入时限制、不显示字数提示——只在提交这一步拦住注定 400 的请求。
 */
export function invalidSkillMetaFields(meta: SkillMetaValues): SkillMetaField[] {
  return (Object.keys(SKILL_META_MAX) as SkillMetaField[])
    .filter(field => [...meta[field].trim()].length > SKILL_META_MAX[field])
}

/**
 * SKILL.md frontmatter 里的元数据（后端 v0.9.0 的 89f1631 补的七列）。
 * 除 name/description 外全部可空；空值在拼装时不写进正文。
 */
export interface SkillMetaValues {
  version: string
  /** 正文里 `author` 既可能是标量也可能是序列，这里统一成 `", "` 连接的字符串。 */
  author: string
  license: string
  /** 正文里 `platforms` 声明的平台名，含界面无法表示的未知值；保序、去重。 */
  platforms: string[]
  category: string
  homepage: string
  /** 正文里 `metadata.hermes.related_skills` 的技能名列表，去空白、去重。 */
  relatedSkills: string[]
}

export function emptySkillMeta(): SkillMetaValues {
  return {
    version: '',
    author: '',
    license: '',
    platforms: [],
    category: '',
    homepage: '',
    relatedSkills: [],
  }
}

export interface SkillForm {
  name: string
  description: string
  body: string
  channel: SkillChannel
  meta: SkillMetaValues
}

export interface SkillEditForm {
  description: string
  body: string
  channel: string
  meta: SkillMetaValues
}

export interface ParsedSkillContent {
  /** 解析出的 frontmatter 对象，保留未知键；解析失败时为空对象。 */
  frontmatter: Record<string, unknown>
  name: string
  description: string
  /** 去掉 frontmatter 的正文；解析失败时是原始内容整体。 */
  body: string
  /** 七个元数据字段；解析失败或字段缺失时为空值。 */
  meta: SkillMetaValues
}

export interface ChannelOption {
  labelKey: string
  /** 只有四个合法单值可写；掩码组合或未知值必须只读，避免被静默改写成 0。 */
  editable: boolean
}

function validateSkillName(name: string): string | null {
  const value = name.trim()

  if (!value)
    return 'skill.nameRequired'

  if ([...value].length > SKILL_NAME_MAX)
    return 'skill.nameLength'

  if (!SKILL_NAME_PATTERN.test(value))
    return 'skill.nameFormat'

  return null
}

/** 描述必填且不超长；按字符（码点）计，与后端 `RuneCountInString` 口径一致。 */
export function validateSkillDescription(description: string): string | null {
  const value = description.trim()

  if (!value)
    return 'skill.descriptionRequired'

  if ([...value].length > SKILL_DESCRIPTION_MAX)
    return 'skill.descriptionTooLong'

  return null
}

/** 正文必填（仅空白视为空）。 */
export function validateSkillBody(body: string): string | null {
  return body.trim() ? null : 'skill.bodyRequired'
}

/**
 * 本地校验：返回 i18n key 或 null（通过），取第一个失败项。校验口径与后端一致，
 * 「正文非空」是前端为「建出来的技能确实可用」补的一条（后端只要求 frontmatter 合法：
 * 一个只带 frontmatter 的技能在对话里加载不到任何指令）。
 */
export function validateSkillForm(form: { name: string, description: string, body: string }): string | null {
  return validateSkillName(form.name)
    ?? validateSkillDescription(form.description)
    ?? validateSkillBody(form.body)
}

/**
 * 解析 SKILL.md 的 YAML frontmatter，与后端 `cutFrontmatter` 语义对齐：
 * 容忍开头 BOM，要求以 `---` 起始且后面存在 `---` 分隔行。
 *
 * 任何一步不成立（没有 frontmatter、YAML 非法、结果不是对象、name/description 为空）
 * 都不抛错，而是把整段内容当作正文返回——这条分支用于防御直接改库的数据，
 * 重新保存时会产出「新 frontmatter + 原文」，不丢内容。
 */
export function parseSkillContent(content: string): ParsedSkillContent {
  const failed: ParsedSkillContent = {
    frontmatter: {},
    name: '',
    description: '',
    body: content,
    meta: emptySkillMeta(),
  }
  const text = content.replace(/^\uFEFF/, '')

  if (!text.startsWith('---'))
    return failed

  const firstBreak = text.indexOf('\n')

  if (firstBreak < 0)
    return failed

  const rest = text.slice(firstBreak + 1)
  // '\n---' 长度是 4；正文从分隔行之后开始，再剥掉分隔行自己的换行。
  const end = rest.indexOf('\n---')

  if (end < 0)
    return failed

  let parsed: unknown

  try {
    parsed = parse(rest.slice(0, end))
  }
  catch {
    return failed
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return failed

  const { name, description } = parsed as { name?: unknown, description?: unknown }
  const fmName = typeof name === 'string' ? name.trim() : ''
  const fmDescription = typeof description === 'string' ? description.trim() : ''

  if (!fmName || !fmDescription)
    return failed

  // 分隔行自己的换行，加上约定的一个空行，都算 frontmatter 块的格式，不进正文。
  // 只剥这两层：正文自身的前导空行（第 2 层之后）保持原样，往返才稳定。
  const body = rest
    .slice(end + 4)
    .replace(/^\r?\n/, '')
    .replace(/^\r?\n/, '')

  return {
    frontmatter: parsed as Record<string, unknown>,
    name: fmName,
    description: fmDescription,
    body,
    meta: readSkillMeta(parsed as Record<string, unknown>),
  }
}

/** 读成字符串：只接受标量字符串，其余（数字、布尔、对象）一律当空。 */
function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 读成字符串列表：标量与序列都接受（`author` 两种写法在语料里都出现过），
 * 逐项 trim、丢掉空项与重复项、保持原顺序。
 */
function readList(value: unknown): string[] {
  const items = typeof value === 'string' ? [value] : Array.isArray(value) ? value : []
  const out: string[] = []

  for (const item of items) {
    const text = readText(item)

    if (text && !out.includes(text))
      out.push(text)
  }

  return out
}

/** 只把普通对象当对象看：数组与标量一律忽略，避免 `metadata: linux` 这类脏数据抛错。 */
function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/**
 * 从 frontmatter 里读七个元数据字段。开放标准把位置分成两处：
 * `version`/`author`/`license`/`platforms` 在顶层，`category`/`homepage`/`related_skills`
 * 在 `metadata.hermes` 下——与后端 `rawFrontmatter` 的收敛方式一致。
 */
function readSkillMeta(frontmatter: Record<string, unknown>): SkillMetaValues {
  const hermes = readRecord(readRecord(frontmatter.metadata).hermes)

  return {
    version: readText(frontmatter.version),
    author: readList(frontmatter.author).join(', '),
    license: readText(frontmatter.license),
    platforms: readList(frontmatter.platforms),
    category: readText(hermes.category),
    homepage: readText(hermes.homepage),
    relatedSkills: readList(hermes.related_skills),
  }
}

/** 非空才写、空值删键：用户清空某个字段时正文里的键要消失，而不是留空串。 */
function writeOrDelete(target: Record<string, unknown>, key: string, value: string | string[]) {
  const empty = typeof value === 'string' ? value.trim() === '' : value.length === 0

  if (empty)
    delete target[key]
  else
    target[key] = typeof value === 'string' ? value.trim() : value
}

/**
 * 把元数据写回各自的 frontmatter 位置，保留两处对象里的其他未知键
 * （如 `metadata.hermes.tags`）；清空后不留空的 `metadata.hermes` / `metadata`。
 */
function writeSkillMeta(frontmatter: Record<string, unknown>, meta: SkillMetaValues) {
  writeOrDelete(frontmatter, 'version', meta.version)
  writeOrDelete(frontmatter, 'author', meta.author)
  writeOrDelete(frontmatter, 'license', meta.license)
  writeOrDelete(frontmatter, 'platforms', meta.platforms)

  const metadata = { ...readRecord(frontmatter.metadata) }
  const hermes = { ...readRecord(metadata.hermes) }

  writeOrDelete(hermes, 'category', meta.category)
  writeOrDelete(hermes, 'homepage', meta.homepage)
  writeOrDelete(hermes, 'related_skills', meta.relatedSkills)

  if (Object.keys(hermes).length > 0)
    metadata.hermes = hermes
  else
    delete metadata.hermes

  if (Object.keys(metadata).length > 0)
    frontmatter.metadata = metadata
  else
    delete frontmatter.metadata
}

/**
 * 拼装完整 content：在保留原 frontmatter 未知键的前提下覆盖 name/description 与七个元数据字段。
 * 用 yaml 库序列化而不是手写模板——描述含 `:`、引号、`#`、换行或非 ASCII 时，
 * 手写模板会产出后端 yaml.v3 解析不了的 YAML，那正是要消灭的失败模式。
 */
export function composeSkillContent(input: {
  frontmatter?: Record<string, unknown>
  name: string
  description: string
  body: string
  meta?: SkillMetaValues
}): string {
  const original = input.frontmatter ?? {}
  const frontmatter = {
    ...original,
    name: input.name,
    description: input.description,
  }

  // 不传 meta 时沿用正文里已有的元数据：默认「保留」而不是「清空」，
  // 避免调用方漏传字段就把库里的值抹掉。要清空某个字段就显式传空串。
  writeSkillMeta(frontmatter, input.meta ?? readSkillMeta(original))

  // lineWidth: 0 关闭折行，否则长描述会被写成多行标量。
  const text = stringify(frontmatter, { lineWidth: 0 })

  return `---\n${text}---\n\n${input.body}`
}

/**
 * 只提交用户实际改动的字段。抽屉的表单来自可能已经过期的列表快照，
 * 整体提交会把陈旧字段写回服务端。
 *
 * 描述或正文变化时连带重建 `content`：只改记录字段会让 frontmatter 里的描述变陈旧，
 * 而 frontmatter 会被注入模型可见的技能索引。
 * 七个元数据字段同理——后端从正文派生这些列，只改记录字段同样会被正文覆盖。
 */
export function buildSkillPatch(original: SkillDetail | null, form: SkillEditForm): SkillPatch {
  const patch: SkillPatch = {}

  if (!original)
    return patch

  const parsed = parseSkillContent(original.content)
  const descriptionChanged = form.description !== original.description
  const bodyChanged = form.body !== parsed.body
  const metaChanged = !sameSkillMeta(parsed.meta, form.meta)

  if (descriptionChanged)
    patch.description = form.description

  // 元数据也必须在正文里重建：后端从正文派生这七列，只改列会被正文覆盖。
  if (descriptionChanged || bodyChanged || metaChanged) {
    patch.content = composeSkillContent({
      frontmatter: parsed.frontmatter,
      name: original.name,
      description: form.description,
      body: form.body,
      meta: form.meta,
    })
  }

  // 原值不是合法单值时永不产出 channel：一次无关编辑会把位掩码静默改写成 0。
  if (channelOption(original.channel).editable && form.channel !== original.channel)
    patch.channel = form.channel as SkillChannel

  return patch
}

/** 元数据比较：字符串按去空白后比、列表按顺序逐项比（拼装时也会 trim）。 */
export function sameSkillMeta(a: SkillMetaValues, b: SkillMetaValues): boolean {
  const sameList = (x: string[], y: string[]) => x.length === y.length && x.every((item, index) => item === y[index])

  return a.version.trim() === b.version.trim()
    && a.author.trim() === b.author.trim()
    && a.license.trim() === b.license.trim()
    && a.category.trim() === b.category.trim()
    && a.homepage.trim() === b.homepage.trim()
    && sameList(a.platforms, b.platforms)
    && sameList(a.relatedSkills, b.relatedSkills)
}

/** 仅当 oid 非空且与 owner 严格相等时算自己创建；两边都空不能认领他人技能。 */
export function isOwnSkill(owner?: string | null, oid?: string | null): boolean {
  return Boolean(oid) && owner === oid
}

/**
 * 记录级 `meta.owner`：只有非空字符串算存在，缺失、非字符串、空白一律返回空串
 * （展示与否由数据决定，调用方不需要额外开关）。
 */
export function skillMetaOwner(meta?: Record<string, unknown> | null): string {
  return readText(meta?.owner)
}

/**
 * 请求错误到文案 key：先看状态码（401/403 由请求层保留），
 * 再看服务端 message 是否是名称占用，其余回落到调用方提供的兜底文案。
 */
export function skillErrorKey(error: unknown, fallbackKey: string): string {
  const err = error as { status?: number, message?: string } | undefined

  if (err?.status === 403)
    return 'skill.permissionDenied'

  if (err?.status === 401)
    return 'skill.authExpired'

  if (typeof err?.message === 'string' && err.message.toLowerCase().includes('already exists'))
    return 'skill.nameTaken'

  return fallbackKey
}

const CHANNEL_LABEL_KEYS: Record<string, string> = {
  none: 'skill.channelNone',
  web: 'skill.channelWeb',
  wecom: 'skill.channelWecom',
  feishu: 'skill.channelFeishu',
}

/** 频道呈现：四个合法单值可编辑并各有文案，其余值（掩码、未知）只读。 */
export function channelOption(value?: string | null): ChannelOption {
  const labelKey = typeof value === 'string' ? CHANNEL_LABEL_KEYS[value] : undefined

  if (!labelKey)
    return { labelKey: 'skill.channelUnknown', editable: false }

  return { labelKey, editable: true }
}

/** 排序参数：`descend` 用前导 `-` 表达，与语料面板的 `sortParam` 同形。 */
export function skillSortParam(field: SkillSortField, order: SkillSortOrder): string {
  return `${order === 'descend' ? '-' : ''}${field}`
}
