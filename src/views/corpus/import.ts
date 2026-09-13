import type { CorpusImportFailure, CorpusImportFailureKind, CorpusImportTask, CorpusImportTaskStatus } from '@/api/corpus'

/** 上传大小上限，与 morrigan 的 `maxImportUploadSize`（10 MiB）对齐。 */
export const IMPORT_MAX_SIZE = 10 * 1024 * 1024

/** 必需表头，与 morrigan `ValidHead` 对齐：前 3 列大小写不敏感，允许额外列。 */
export const IMPORT_REQUIRED_HEADERS = ['title', 'heading', 'content']

/** 「下载模板」的内容：只有表头行。 */
export const IMPORT_TEMPLATE_CSV = 'title,heading,content\n'

/**
 * 失败行导出的表头：前 3 列与导入入口一致（后端允许额外列），
 * 后两列是给 keeper 定位与修正用的行号与原因，重新上传时会被后端忽略。
 */
export const IMPORT_FAILURE_CSV_HEADER = 'title,heading,content,line,reason'

/** 后端为跳过行硬编码的原因前缀，仅用于 `kind` 缺失时的降级判定。 */
const SKIP_REASON_PREFIX = '重复文档'

export type ImportFailureGroup = CorpusImportFailureKind | 'unknown'

export interface ImportFailureRow extends CorpusImportFailure {
  group: ImportFailureGroup
}

export interface ImportFailureGroups {
  failed: ImportFailureRow[]
  skipped: ImportFailureRow[]
  /** kind 缺失且无法与计数交叉校验的条目：导出时保留，宁可多导一行也不漏失败行。 */
  unknown: ImportFailureRow[]
}

export interface ImportValidationInput {
  filename: string
  size: number
  text: string
}

const IMPORT_STATUS_KEYS: Record<CorpusImportTaskStatus, string> = {
  pending: 'corpus.importStatusPending',
  processing: 'corpus.importStatusProcessing',
  succeeded: 'corpus.importStatusSucceeded',
  failed: 'corpus.importStatusFailed',
}

function stripBom(text: string) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
}

/**
 * 取 CSV 首条记录的字段，按 RFC4180 处理引号包裹与转义引号。
 * 只需解析表头，遇到第一个记录结束符即停止。
 */
function parseFirstRecord(text: string): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false
  let started = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        }
        else {
          quoted = false
        }
      }
      else {
        field += char
      }
      continue
    }

    if (char === '"' && !started) {
      quoted = true
      started = true
      continue
    }

    if (char === ',') {
      fields.push(field)
      field = ''
      started = false
      continue
    }

    if (char === '\n' || char === '\r') {
      if (field !== '' || started)
        fields.push(field)
      return fields
    }

    field += char
    started = true
  }

  if (field !== '' || started)
    fields.push(field)

  return fields
}

/**
 * 严格按 UTF-8 解码文件字节；非法字节序列返回 null。
 * `FileReader.readAsText` 会把非法字节替换成 U+FFFD，因此上传前必须走这里。
 */
export function decodeImportBytes(bytes: ArrayBuffer | Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  catch {
    return null
  }
}

/** 表头是否为 `title,heading,content`（去 BOM、大小写不敏感、允许额外列）。 */
export function hasImportHeader(text: string): boolean {
  const fields = parseFirstRecord(stripBom(text))

  if (fields.length < IMPORT_REQUIRED_HEADERS.length)
    return false

  return IMPORT_REQUIRED_HEADERS.every((expected, index) => fields[index].trim().toLowerCase() === expected)
}

function csvField(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * 上传前预校验：返回 i18n key，通过则返回 null。
 * 口径与 morrigan 对齐，服务端的 400/413 仍作为兜底。
 */
export function validateImportFile({ filename, size, text }: ImportValidationInput): string | null {
  if (!filename.toLowerCase().endsWith('.csv'))
    return 'corpus.importInvalidType'

  if (size > IMPORT_MAX_SIZE)
    return 'corpus.importTooLarge'

  if (!hasImportHeader(text))
    return 'corpus.importInvalidHeader'

  return null
}

/** 排队中与处理中视为「进行中」，其余为终态。 */
export function isImportTaskActive(status: CorpusImportTaskStatus): boolean {
  return status === 'pending' || status === 'processing'
}

export function isImportTaskFinished(status: CorpusImportTaskStatus): boolean {
  return status === 'succeeded' || status === 'failed'
}

export function importStatusKey(status: CorpusImportTaskStatus | string): string {
  return IMPORT_STATUS_KEYS[status as CorpusImportTaskStatus] ?? String(status)
}

/** 后端只在任务结束时写回计数，进行中展示计数会误导成「0 行成功」。 */
export function showsImportCounts(status: CorpusImportTaskStatus): boolean {
  return isImportTaskFinished(status)
}

export function activeImportCount(tasks: CorpusImportTask[]): number {
  return tasks.filter(task => isImportTaskActive(task.status)).length
}

/**
 * 找出「尚未提示过」的终态任务。调用方把返回任务的 id 记入已提示集合，
 * 轮询多次返回同一终态任务时就不会重复提示（R12）。
 */
export function newlyFinishedImports(
  tasks: CorpusImportTask[],
  notified: ReadonlySet<string>,
): CorpusImportTask[] {
  return tasks.filter(task => isImportTaskFinished(task.status) && !notified.has(task.id))
}

function isSkipReason(reason: string | undefined) {
  return (reason ?? '').startsWith(SKIP_REASON_PREFIX)
}

/**
 * 给每条明细标注失败 / 跳过 / 未分类，保持后端返回的原始顺序。
 *
 * `kind` 是 U1 新增字段：老数据与未部署 U1 的实例没有它，此时先按 reason
 * 前缀猜测，猜完必须与后端的 failed / skipped 计数完全对上才采纳；对不上就整批
 * 归入未分类，交给导出兜底（多导一行无害，漏掉失败行有害）。
 */
export function importFailureRows(
  task: Pick<CorpusImportTask, 'errors' | 'failed' | 'skipped'>,
): ImportFailureRow[] {
  const errors = task.errors ?? []
  const pending = errors.filter(entry => entry.kind !== 'failed' && entry.kind !== 'skipped')

  let guess: Map<CorpusImportFailure, CorpusImportFailureKind> | null = null

  if (pending.length > 0) {
    const guessedSkipped = pending.filter(entry => isSkipReason(entry.reason)).length
    const explicitFailed = errors.filter(entry => entry.kind === 'failed').length
    const explicitSkipped = errors.filter(entry => entry.kind === 'skipped').length
    const consistent = explicitSkipped + guessedSkipped === task.skipped
      && explicitFailed + (pending.length - guessedSkipped) === task.failed

    if (consistent) {
      guess = new Map(pending.map(entry => [
        entry,
        isSkipReason(entry.reason) ? 'skipped' as const : 'failed' as const,
      ]))
    }
  }

  return errors.map((entry) => {
    const explicit = entry.kind === 'failed' || entry.kind === 'skipped' ? entry.kind : null

    return { ...entry, group: explicit ?? guess?.get(entry) ?? 'unknown' }
  })
}

export function classifyImportFailures(
  task: Pick<CorpusImportTask, 'errors' | 'failed' | 'skipped'>,
): ImportFailureGroups {
  const groups: ImportFailureGroups = { failed: [], skipped: [], unknown: [] }

  for (const row of importFailureRows(task))
    groups[row.group].push(row)

  return groups
}

/** 可导出的行：失败与未分类；跳过行代表「已存在、无需处理」，不进导出。 */
export function importExportableRows(
  task: Pick<CorpusImportTask, 'errors' | 'failed' | 'skipped'>,
): ImportFailureRow[] {
  return importFailureRows(task).filter(row => row.group !== 'skipped')
}

export function hasImportFailureRows(
  task: Pick<CorpusImportTask, 'errors' | 'failed' | 'skipped'>,
): boolean {
  return importExportableRows(task).length > 0
}

/** 后端对每条任务的明细有条数上限，明细短于失败 + 跳过计数时说明被截断。 */
export function importDetailCount(
  task: Pick<CorpusImportTask, 'errors' | 'failed' | 'skipped'>,
): { shown: number, total: number, truncated: boolean } {
  const shown = (task.errors ?? []).length
  const total = task.failed + task.skipped

  return { shown, total, truncated: shown < total }
}

/**
 * 生成失败行 CSV：含导入表头、只含失败（与未分类）行。
 * 字段按 RFC4180 转义；没有任何可导出行时返回空串，调用方据此不提供下载。
 */
export function buildImportFailureCsv(
  task: Pick<CorpusImportTask, 'errors' | 'failed' | 'skipped'>,
): string {
  const rows = importExportableRows(task)

  if (rows.length === 0)
    return ''

  const lines = [IMPORT_FAILURE_CSV_HEADER]

  for (const row of rows) {
    lines.push([
      csvField(row.title ?? ''),
      '',
      '',
      csvField(String(row.line ?? '')),
      csvField(row.reason ?? ''),
    ].join(','))
  }

  return `${lines.join('\n')}\n`
}

/** 「下载模板」：仅表头行。 */
export function buildImportTemplateCsv(): string {
  return IMPORT_TEMPLATE_CSV
}

/** 完成摘要的插值参数；文案在组件层通过 i18n 拼装。 */
export function importSummaryParams(task: CorpusImportTask) {
  return {
    total: task.total,
    success: task.success,
    failed: task.failed,
    skipped: task.skipped,
  }
}
