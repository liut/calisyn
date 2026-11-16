import type { ToolCall, ToolResult } from '@/api'

/**
 * 工具调用落地的纯函数。
 *
 * 后端每轮工具调用下发一条消息，携带该轮的完整调用数组；轮次边界由消息是否
 * 携带 `finishReason` 判定。落地规则（段落只增不减）：
 *
 * - 携带 `finishReason`：新一轮，另起一个 tool_call 段落；
 * - 未携带 `finishReason`：同一轮的后续消息，并入上一个 tool_call 段落；
 * - 同 `id` 的调用再次到达视为参数续传，覆盖原条目而非追加。
 */

/** 把后端下发的原始调用映射成前端结构，缺失字段降级为空串而不抛错。 */
export function normalizeToolCalls(rawCalls: ToolCall[]): Chat.Tool[] {
  return (rawCalls ?? []).map(tc => ({
    id: tc?.id || '',
    name: tc?.function?.name || '',
    arguments: tc?.function?.arguments || '',
    status: 'running' as Chat.ToolStatus,
    // 一律默认折叠（含执行中的调用），参数仅展示摘要，用户点击后展开
    collapsed: true,
  }))
}

/**
 * 把一轮工具调用并入段落列表，返回新的段落数组（不修改入参）。
 *
 * @param chunks 当前消息的段落列表
 * @param rawCalls 本次消息携带的工具调用
 * @param finishReason 本次消息携带的结束原因，携带时视为新一轮边界
 */
export function applyToolCalls(
  chunks: Chat.MessageChunk[],
  rawCalls: ToolCall[],
  finishReason?: string,
): Chat.MessageChunk[] {
  const incoming = normalizeToolCalls(rawCalls)
  if (incoming.length === 0)
    return chunks

  const last = chunks[chunks.length - 1]
  // 同一轮的后续消息才并入末段；末段不是工具调用段落时也另起一段
  const sameRound = !finishReason && last?.type === 'tool_call'

  if (!sameRound) {
    return [
      ...chunks,
      {
        type: 'tool_call',
        content: '',
        toolCalls: incoming,
        loading: true,
      },
    ]
  }

  const merged = [...(last.toolCalls ?? [])]
  for (const call of incoming) {
    // 无 id 的调用按到达顺序追加，互不覆盖
    const idx = call.id ? merged.findIndex(item => item.id === call.id) : -1
    if (idx >= 0) {
      // 参数续传：只覆盖名字与参数，保留既有条目的折叠态与状态
      // （结果可能已落地终态，不能被打回 running）
      merged[idx] = { ...merged[idx], name: call.name, arguments: call.arguments }
    }
    else {
      merged.push(call)
    }
  }

  return [
    ...chunks.slice(0, -1),
    { ...last, toolCalls: merged, loading: true },
  ]
}

/**
 * 标记「本轮工具调用已结束」：该段落停止加载。
 * 只处理末段——更早的轮次在各自结束时已经处理过。
 * 条目的折叠不再随轮次状态变化：新条目落地即折叠（见 normalizeToolCalls），
 * 此函数只负责停止加载，不触碰折叠态。
 */
export function finishToolCallRound(chunks: Chat.MessageChunk[]): Chat.MessageChunk[] {
  const last = chunks[chunks.length - 1]
  if (!last || last.type !== 'tool_call')
    return chunks

  return [
    ...chunks.slice(0, -1),
    { ...last, loading: false },
  ]
}

/**
 * 把一条工具执行结果落到配对的调用条目上，返回新的段落数组（不修改入参）。
 *
 * 配对主键是 `result.callID` ↔ 条目的 `id`；从后往前找，结果消息总是跟在
 * 对应调用之后。配对成功时写入状态与元信息并把条目折叠；配对不上时静默
 * 忽略——不新建条目、不抛错、不影响其余渲染。
 */
export function applyToolResult(
  chunks: Chat.MessageChunk[],
  result: ToolResult,
): Chat.MessageChunk[] {
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i]
    if (chunk.type !== 'tool_call')
      continue

    const tools = chunk.toolCalls ?? []
    const idx = tools.findIndex(tool => tool.id === result.callID)
    if (idx < 0)
      continue

    const updated = [...tools]
    updated[idx] = {
      ...updated[idx],
      status: result.status,
      errorCode: result.err,
      duration: result.dur,
      resultLength: result.clen,
      collapsed: true,
    }

    const next = [...chunks]
    next[i] = { ...chunk, toolCalls: updated }
    return next
  }

  return chunks
}

/**
 * 流结束时收束仍处于「执行中」的条目：取消 → `aborted`，正常结束无结果 →
 * `unknown`。已经是终态的条目不动；函数幂等，可重复调用。
 */
export function settleToolCalls(
  chunks: Chat.MessageChunk[],
  status: 'aborted' | 'unknown',
): Chat.MessageChunk[] {
  let changed = false
  const next = chunks.map((chunk) => {
    if (chunk.type !== 'tool_call')
      return chunk

    let chunkChanged = false
    const tools = (chunk.toolCalls ?? []).map((tool) => {
      if (tool.status && tool.status !== 'running')
        return tool

      chunkChanged = true
      return { ...tool, status, collapsed: true }
    })

    if (chunkChanged)
      changed = true

    return chunkChanged ? { ...chunk, toolCalls: tools } : chunk
  })

  return changed ? next : chunks
}

/** 工具状态到文案 key 的映射；缺状态视为「执行中」（收束前）。 */
const TOOL_STATUS_KEYS: Record<Chat.ToolStatus, string> = {
  running: 'chat.toolStatusRunning',
  ok: 'chat.toolStatusOk',
  error: 'chat.toolStatusError',
  rejected: 'chat.toolStatusRejected',
  aborted: 'chat.toolStatusAborted',
  unknown: 'chat.toolStatusUnknown',
}

export function toolStatusKey(status?: Chat.ToolStatus): string {
  return TOOL_STATUS_KEYS[status ?? 'running']
}

/** 错误码枚举到文案 key 的映射；枚举外的码兜底展示原文（含 code 插值）。 */
const TOOL_ERROR_KEYS: Record<string, string> = {
  invalid_arguments: 'chat.toolErrorInvalidArguments',
  unsupported_type: 'chat.toolErrorUnsupportedType',
  panic: 'chat.toolErrorPanic',
  execution_failed: 'chat.toolErrorExecutionFailed',
  tool_error: 'chat.toolErrorToolError',
  permission_denied: 'chat.toolErrorPermissionDenied',
  rejected: 'chat.toolErrorRejected',
}

export const TOOL_ERROR_FALLBACK_KEY = 'chat.toolErrorUnknown'

export function toolErrorKey(code?: string): string {
  if (!code)
    return TOOL_ERROR_FALLBACK_KEY

  return TOOL_ERROR_KEYS[code] ?? TOOL_ERROR_FALLBACK_KEY
}

/** 判断结束原因是否代表「本轮工具调用结束」而非「整条消息结束」。 */
export function isToolCallFinishReason(finishReason?: string): boolean {
  return finishReason === 'tool_calls' || finishReason === 'tool_use'
}

const TOOL_DURATION_KEYS = {
  ms: 'chat.toolDurationMs',
  seconds: 'chat.toolDurationSeconds',
  minutes: 'chat.toolDurationMinutes',
} as const

/**
 * 把工具调用耗时（毫秒）分级格式化为 i18n key + 插值参数：
 * - < 1000 ms：原值毫秒；
 * - < 60 s：秒，保留 2 位小数；
 * - ≥ 60 s：整分钟 + 余数秒（2 位小数）。
 */
export function toolDurationDisplay(ms: number): { key: string, params: Record<string, string | number> } {
  if (ms < 1000)
    return { key: TOOL_DURATION_KEYS.ms, params: { duration: ms } }

  if (ms < 60_000)
    return { key: TOOL_DURATION_KEYS.seconds, params: { seconds: (ms / 1000).toFixed(2) } }

  const minutes = Math.floor(ms / 60_000)
  const seconds = ((ms % 60_000) / 1000).toFixed(2)
  return { key: TOOL_DURATION_KEYS.minutes, params: { minutes, seconds } }
}

/**
 * 递归格式化值，支持嵌套对象。输出为扁平单行（`key: value, key: value`），
 * 用于折叠态的摘要。
 */
export function formatValue(value: unknown, indent = 0): string {
  if (value === null || value === undefined)
    return String(value)

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value)

  if (Array.isArray(value)) {
    if (value.length === 0)
      return '[]'
    const items = value.map(item => formatValue(item, indent + 1))
    if (indent === 0 || items.every(item => !item.includes('\n') && item.length < 30))
      return `[${items.join(', ')}]`

    return items.map(item => indent > 0 ? `${'  '.repeat(indent)}- ${item}` : item).join('\n')
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0)
      return '{}'

    const formattedEntries = entries.map(([key, val]) => {
      const formattedVal = formatValue(val, indent + 1)
      if (typeof val === 'object' && val !== null) {
        // 嵌套对象显示为 key: {...} 或多行列出
        if (formattedVal.includes('\n'))
          return `${key}:\n${formattedVal}`

        return `${key}: ${formattedVal}`
      }
      return `${key}: ${formattedVal}`
    })

    if (formattedEntries.length === 1 && !formattedEntries[0].includes('\n'))
      return formattedEntries[0]

    const prefix = indent > 0 ? '  '.repeat(indent) : ''
    return formattedEntries.map(entry => `${prefix}${entry}`).join(', ')
  }

  return String(value)
}

/** 参数的单行扁平表示，用于折叠态摘要。 */
export function formatArguments(args: string): string {
  try {
    const parsed = JSON.parse(args)
    return formatValue(parsed)
  }
  catch {
    return args
  }
}

/** 展开态文本：合法 JSON 按缩进 2 空格美化，不是合法 JSON 则原样返回。 */
export function formatToolArguments(args: string): string {
  try {
    const parsed = JSON.parse(args)
    return JSON.stringify(parsed, null, 2)
  }
  catch {
    return args
  }
}

/** 折叠态摘要：参数的单行表示，超长时截断并补省略号。 */
export function summarizeToolArguments(args: string, limit = 120): string {
  const flat = formatArguments(args).replace(/\s*\n\s*/g, ' ').trim()
  if (flat.length <= limit)
    return flat

  return `${flat.slice(0, limit)}…`
}
