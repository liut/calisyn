import type { ToolCall } from '@/api'
import { describe, expect, it } from 'vitest'
import {
  applyToolCalls,
  finishToolCallRound,
  formatArguments,
  formatToolArguments,
  isToolCallFinishReason,
  summarizeToolArguments,
} from './utils'

/** 构造一条后端下发的工具调用（后端实际不下发 index，此处仅为满足类型）。 */
function call(id: string, name: string, args: string): ToolCall {
  return { index: 0, id, function: { name, arguments: args } }
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
    chunks = finishToolCallRound(chunks)
    chunks = applyToolCalls(chunks, [call('a1', 'exec', '{"command":"ls"}')])

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
  it('stops loading and collapses the calls of the last paragraph', () => {
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
