import type { ToolCall } from '@/api'

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
      // 参数续传：覆盖参数，保留既有条目的折叠态
      merged[idx] = { ...merged[idx], ...call }
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
 * 标记「本轮工具调用已结束」：该段落停止加载，其中的调用自动折叠。
 * 只处理末段——更早的轮次在各自结束时已经处理过。
 */
export function finishToolCallRound(chunks: Chat.MessageChunk[]): Chat.MessageChunk[] {
  const last = chunks[chunks.length - 1]
  if (!last || last.type !== 'tool_call')
    return chunks

  return [
    ...chunks.slice(0, -1),
    {
      ...last,
      loading: false,
      toolCalls: (last.toolCalls ?? []).map(call => ({ ...call, collapsed: true })),
    },
  ]
}

/** 判断结束原因是否代表「本轮工具调用结束」而非「整条消息结束」。 */
export function isToolCallFinishReason(finishReason?: string): boolean {
  return finishReason === 'tool_calls' || finishReason === 'tool_use'
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
