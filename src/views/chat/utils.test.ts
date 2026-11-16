import type { ToolCall, ToolResult } from '@/api'
import { describe, expect, it } from 'vitest'
import {
  applyToolCalls,
  applyToolResult,
  finishToolCallRound,
  formatArguments,
  formatToolArguments,
  isToolCallFinishReason,
  settleToolCalls,
  summarizeToolArguments,
  TOOL_ERROR_FALLBACK_KEY,
  toolDurationDisplay,
  toolErrorKey,
  toolStatusKey,
} from './utils'

/** 构造一条后端下发的工具调用（后端实际不下发 index，此处仅为满足类型）。 */
function call(id: string, name: string, args: string): ToolCall {
  return { index: 0, id, function: { name, arguments: args } }
}

/** 构造一条后端下发的工具执行结果。 */
function result(callID: string, overrides: Partial<ToolResult> = {}): ToolResult {
  return { callID, status: 'ok', dur: 132, clen: 4096, ...overrides }
}

/** 取出所有段落里的调用，按到达顺序排列。 */
function allCalls(chunks: Chat.MessageChunk[]) {
  return chunks.flatMap(chunk => chunk.toolCalls ?? [])
}

describe('applyToolCalls', () => {
  /** AE1：三轮各带 finishReason，前一轮的调用不能被后一轮覆盖。 */
  it('keeps every round in its own paragraph', () => {
    let chunks: Chat.MessageChunk[] = []

    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{}'), call('a2', 'exec', '{}')], 'tool_calls')
    chunks = applyToolCalls(chunks, [call('b1', 'exec', '{}')], 'tool_calls')
    chunks = applyToolCalls(chunks, [call('c1', 'exec', '{}')], 'tool_calls')

    expect(chunks.filter(chunk => chunk.type === 'tool_call')).toHaveLength(3)
    expect(allCalls(chunks).map(item => item.id)).toEqual(['a1', 'a2', 'b1', 'c1'])
  })

  /** AE2：同一轮拆成多条消息下发（均无 finishReason），应并入同一段落。 */
  it('merges calls of the same round into one paragraph', () => {
    let chunks: Chat.MessageChunk[] = []

    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{}')])
    chunks = applyToolCalls(chunks, [call('a2', 'exec', '{}')])

    expect(chunks).toHaveLength(1)
    expect(allCalls(chunks)).toHaveLength(2)
  })

  /** AE3：同 id 再次到达是参数续传，覆盖原条目而不是追加。 */
  it('replaces the entry of the same id', () => {
    let chunks: Chat.MessageChunk[] = []

    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{"command":"ls"}')])
    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{"command":"pwd"}')])

    expect(allCalls(chunks)).toHaveLength(1)
    expect(allCalls(chunks)[0].arguments).toBe('{"command":"pwd"}')
  })

  /** AE4：没有 id 的调用按到达顺序追加，互不覆盖。 */
  it('appends calls without id', () => {
    let chunks: Chat.MessageChunk[] = []

    chunks = applyToolCalls(chunks, [{ index: 0, function: { name: 'exec', arguments: '{}' } }])
    chunks = applyToolCalls(chunks, [{ index: 1, function: { name: 'exec', arguments: '{}' } }])

    expect(allCalls(chunks)).toHaveLength(2)
  })

  it('starts a new paragraph when the last one is not a tool call', () => {
    let chunks: Chat.MessageChunk[] = [
      { type: 'text', content: 'hi', loading: true },
    ]

    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{}')])

    expect(chunks).toHaveLength(2)
    expect(chunks[1].type).toBe('tool_call')
  })

  it('keeps the collapsed state of an existing entry when arguments are updated', () => {
    let chunks: Chat.MessageChunk[] = []

    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{}')])
    chunks = applyToolResult(chunks, result('a1'))
    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{"command":"ls"}')])

    expect(allCalls(chunks)[0].collapsed).toBe(true)
  })

  /** 结果已落地终态后同 id 参数续传，状态不能被打回 running。 */
  it('keeps the settled status of an existing entry when arguments are updated', () => {
    let chunks: Chat.MessageChunk[] = []

    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{}')])
    chunks = applyToolResult(chunks, result('a1', { status: 'error', err: 'execution_failed' }))
    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{"command":"ls"}')])

    expect(allCalls(chunks)[0].status).toBe('error')
    expect(allCalls(chunks)[0].errorCode).toBe('execution_failed')
  })

  /** 新条目以「执行中 + 折叠」起步，参数默认只显示摘要。 */
  it('marks new entries as running and collapsed', () => {
    const chunks = applyToolCalls([], [call('a1', 'exec', '{}')])

    expect(allCalls(chunks)[0].status).toBe('running')
    expect(allCalls(chunks)[0].collapsed).toBe(true)
  })

  it('does not mutate the given chunks', () => {
    const chunks: Chat.MessageChunk[] = []
    const result = applyToolCalls(chunks, [call('a1', 'exec', '{}')])

    expect(chunks).toHaveLength(0)
    expect(result).toHaveLength(1)
  })
})

describe('finishToolCallRound', () => {
  it('stops loading without changing the collapsed state', () => {
    let chunks: Chat.MessageChunk[] = []
    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{}')], 'tool_calls')
    chunks = finishToolCallRound(chunks)

    expect(chunks[0].loading).toBe(false)
    expect(allCalls(chunks)[0].collapsed).toBe(true)
  })

  it('leaves the chunks untouched when the last paragraph is not a tool call', () => {
    const chunks: Chat.MessageChunk[] = [
      { type: 'text', content: 'hi', loading: true },
    ]

    expect(finishToolCallRound(chunks)).toBe(chunks)
  })
})

describe('isToolCallFinishReason', () => {
  it('treats tool_calls and tool_use as the end of a tool round', () => {
    expect(isToolCallFinishReason('tool_calls')).toBe(true)
    expect(isToolCallFinishReason('tool_use')).toBe(true)
  })

  it('does not treat other reasons as the end of a tool round', () => {
    expect(isToolCallFinishReason('stop')).toBe(false)
    expect(isToolCallFinishReason('length')).toBe(false)
    expect(isToolCallFinishReason(undefined)).toBe(false)
  })
})

describe('toolDurationDisplay', () => {
  it('keeps milliseconds below one second', () => {
    expect(toolDurationDisplay(0)).toEqual({ key: 'chat.toolDurationMs', params: { duration: 0 } })
    expect(toolDurationDisplay(999)).toEqual({ key: 'chat.toolDurationMs', params: { duration: 999 } })
  })

  it('shows seconds with two decimals from one second up to a minute', () => {
    expect(toolDurationDisplay(1000)).toEqual({ key: 'chat.toolDurationSeconds', params: { seconds: '1.00' } })
    expect(toolDurationDisplay(1020)).toEqual({ key: 'chat.toolDurationSeconds', params: { seconds: '1.02' } })
    expect(toolDurationDisplay(59_999)).toEqual({ key: 'chat.toolDurationSeconds', params: { seconds: '60.00' } })
  })

  it('shows minutes and remaining seconds from one minute up', () => {
    expect(toolDurationDisplay(60_000)).toEqual({ key: 'chat.toolDurationMinutes', params: { minutes: 1, seconds: '0.00' } })
    expect(toolDurationDisplay(62_030)).toEqual({ key: 'chat.toolDurationMinutes', params: { minutes: 1, seconds: '2.03' } })
    expect(toolDurationDisplay(132_000)).toEqual({ key: 'chat.toolDurationMinutes', params: { minutes: 2, seconds: '12.00' } })
  })
})

describe('formatToolArguments', () => {
  it('pretty prints valid json', () => {
    expect(formatToolArguments('{"command":"ls"}')).toBe('{\n  "command": "ls"\n}')
  })

  it('returns the raw text when it is not valid json', () => {
    expect(formatToolArguments('not json')).toBe('not json')
  })
})

describe('formatArguments', () => {
  it('flattens an object into key value pairs', () => {
    expect(formatArguments('{"command":"ls","timeout":30}')).toBe('command: ls, timeout: 30')
  })

  it('returns the raw text when it is not valid json', () => {
    expect(formatArguments('not json')).toBe('not json')
  })
})

describe('summarizeToolArguments', () => {
  it('keeps short arguments as they are', () => {
    expect(summarizeToolArguments('{"command":"ls"}')).toBe('command: ls')
  })

  it('truncates long arguments and appends an ellipsis', () => {
    const summary = summarizeToolArguments(JSON.stringify({ command: 'x'.repeat(200) }))

    expect(summary.length).toBeLessThanOrEqual(121)
    expect(summary.endsWith('…')).toBe(true)
  })

  it('folds newlines into spaces', () => {
    expect(summarizeToolArguments('{"a":{"b":1}}')).not.toContain('\n')
  })
})

describe('applyToolResult', () => {
  /** AE2：结果按 callID 配对，状态与元信息落到条目上并自动折叠。 */
  it('writes status and metadata to the matching entry and collapses it', () => {
    let chunks: Chat.MessageChunk[] = []
    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{}')], 'tool_calls')

    chunks = applyToolResult(chunks, result('a1', { dur: 132, clen: 4096 }))
    const entry = allCalls(chunks)[0]

    expect(entry.status).toBe('ok')
    expect(entry.duration).toBe(132)
    expect(entry.resultLength).toBe(4096)
    expect(entry.collapsed).toBe(true)
  })

  /** AE4：失败结果写入错误码枚举原文。 */
  it('writes the error code of a failed result', () => {
    let chunks: Chat.MessageChunk[] = []
    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{}')])

    chunks = applyToolResult(chunks, result('a1', { status: 'error', err: 'execution_failed' }))

    expect(allCalls(chunks)[0].status).toBe('error')
    expect(allCalls(chunks)[0].errorCode).toBe('execution_failed')
  })

  /** AE3：配对不上时静默忽略，引用不变、不抛错。 */
  it('ignores results whose callID matches no entry', () => {
    let chunks: Chat.MessageChunk[] = []
    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{}')])

    const next = applyToolResult(chunks, result('call_999'))

    expect(next).toBe(chunks)
  })

  /** 同一 id 重复收到结果时以最新一次为准。 */
  it('lets a newer result overwrite the previous one', () => {
    let chunks: Chat.MessageChunk[] = []
    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{}')])

    chunks = applyToolResult(chunks, result('a1', { status: 'ok', dur: 100 }))
    chunks = applyToolResult(chunks, result('a1', { status: 'error', err: 'panic', dur: 200 }))

    const entry = allCalls(chunks)[0]
    expect(entry.status).toBe('error')
    expect(entry.errorCode).toBe('panic')
    expect(entry.duration).toBe(200)
  })

  /** 结果可能落在较早轮次的段落里（末段不是该调用所在段落）。 */
  it('matches entries in earlier paragraphs', () => {
    let chunks: Chat.MessageChunk[] = []
    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{}')], 'tool_calls')
    chunks = finishToolCallRound(chunks)
    chunks = applyToolCalls(chunks, [call('b1', 'exec', '{}')], 'tool_calls')

    chunks = applyToolResult(chunks, result('a1'))

    expect(allCalls(chunks)[0].status).toBe('ok')
    expect(allCalls(chunks)[1].status).toBe('running')
  })

  it('does not mutate the given chunks', () => {
    const chunks = applyToolCalls([], [call('a1', 'exec', '{}')])
    applyToolResult(chunks, result('a1'))

    expect(allCalls(chunks)[0].status).toBe('running')
    expect(allCalls(chunks)[0].collapsed).toBe(true)
  })
})

describe('settleToolCalls', () => {
  it('settles running entries and leaves settled ones untouched', () => {
    let chunks: Chat.MessageChunk[] = []
    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{}')], 'tool_calls')
    chunks = finishToolCallRound(chunks)
    chunks = applyToolCalls(chunks, [call('b1', 'exec', '{}')], 'tool_calls')
    chunks = applyToolResult(chunks, result('a1'))

    chunks = settleToolCalls(chunks, 'unknown')
    const [a1, b1] = allCalls(chunks)

    expect(a1.status).toBe('ok')
    expect(a1.collapsed).toBe(true)
    expect(b1.status).toBe('unknown')
    expect(b1.collapsed).toBe(true)
  })

  /** 缺状态的条目（后端未升级的老数据）同样收束。 */
  it('settles entries without a status', () => {
    const chunks: Chat.MessageChunk[] = [
      { type: 'tool_call', content: '', loading: false, toolCalls: [{ name: 'exec', id: 'a1' }] },
    ]

    const next = settleToolCalls(chunks, 'unknown')

    expect(allCalls(next)[0].status).toBe('unknown')
    expect(allCalls(next)[0].collapsed).toBe(true)
  })

  it('is idempotent', () => {
    let chunks: Chat.MessageChunk[] = []
    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{}')], 'tool_calls')

    const once = settleToolCalls(chunks, 'aborted')
    const twice = settleToolCalls(once, 'aborted')

    expect(twice).toEqual(once)
    expect(allCalls(twice)[0].status).toBe('aborted')
  })

  it('returns the same reference when nothing is running', () => {
    let chunks: Chat.MessageChunk[] = []
    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{}')])
    chunks = applyToolResult(chunks, result('a1'))

    expect(settleToolCalls(chunks, 'unknown')).toBe(chunks)
  })
})

describe('toolStatusKey', () => {
  it('maps every status to a locale key', () => {
    expect(toolStatusKey('running')).toBe('chat.toolStatusRunning')
    expect(toolStatusKey('ok')).toBe('chat.toolStatusOk')
    expect(toolStatusKey('error')).toBe('chat.toolStatusError')
    expect(toolStatusKey('rejected')).toBe('chat.toolStatusRejected')
    expect(toolStatusKey('aborted')).toBe('chat.toolStatusAborted')
    expect(toolStatusKey('unknown')).toBe('chat.toolStatusUnknown')
  })

  it('treats a missing status as running', () => {
    expect(toolStatusKey(undefined)).toBe('chat.toolStatusRunning')
  })
})

describe('toolErrorKey', () => {
  it('maps every known error code to its locale key', () => {
    expect(toolErrorKey('invalid_arguments')).toBe('chat.toolErrorInvalidArguments')
    expect(toolErrorKey('unsupported_type')).toBe('chat.toolErrorUnsupportedType')
    expect(toolErrorKey('panic')).toBe('chat.toolErrorPanic')
    expect(toolErrorKey('execution_failed')).toBe('chat.toolErrorExecutionFailed')
    expect(toolErrorKey('tool_error')).toBe('chat.toolErrorToolError')
    expect(toolErrorKey('permission_denied')).toBe('chat.toolErrorPermissionDenied')
    expect(toolErrorKey('rejected')).toBe('chat.toolErrorRejected')
  })

  /** AE10：枚举外的错误码兜底展示原文。 */
  it('falls back to the raw-code key for unknown codes', () => {
    expect(toolErrorKey('some_new_code')).toBe(TOOL_ERROR_FALLBACK_KEY)
  })

  it('falls back when the code is missing', () => {
    expect(toolErrorKey(undefined)).toBe(TOOL_ERROR_FALLBACK_KEY)
  })
})
