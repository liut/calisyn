import { describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import Text from './Text.vue'

/** 挂载 Text 并返回容器。 */
async function mountText(props: Record<string, unknown>) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  createApp(Text, props).mount(el)
  await nextTick()
  return el
}

/** 可见的工具调用条目（折叠块）。 */
function visibleToolCalls(el: HTMLElement) {
  return Array.from(el.querySelectorAll<HTMLElement>('.tool-call-content'))
    .filter(node => node.style.display !== 'none')
}

/** 可见的工具调用头部。 */
function visibleHeaders(el: HTMLElement) {
  return Array.from(el.querySelectorAll<HTMLElement>('.tool-call-header'))
    .filter(node => node.style.display !== 'none')
}

const calls = [
  { id: 'call_1', name: 'strata__exec', arguments: '{"command":"uname -a"}' },
  { id: 'call_2', name: 'strata__exec', arguments: '{"command":"which python3"}' },
]

describe('text.vue 工具调用渲染', () => {
  it('折叠态：每个调用只出一行，参数体隐藏', async () => {
    const el = await mountText({
      chunks: [
        {
          type: 'tool_call',
          content: '',
          loading: false,
          toolCalls: calls.map(call => ({ ...call, collapsed: true })),
        },
      ],
    })

    expect(visibleHeaders(el)).toHaveLength(2)
    expect(visibleToolCalls(el)).toHaveLength(0)
  })

  it('展开态：头部与参数体同时可见', async () => {
    const el = await mountText({
      chunks: [
        { type: 'tool_call', content: '', loading: false, toolCalls: calls },
      ],
    })

    expect(visibleHeaders(el)).toHaveLength(2)
    expect(visibleToolCalls(el)).toHaveLength(2)
  })

  it('不同轮次的调用分属不同段落，互不合并', async () => {
    const el = await mountText({
      chunks: [
        { type: 'tool_call', content: '', loading: false, toolCalls: [calls[0]] },
        { type: 'tool_call', content: '', loading: false, toolCalls: [calls[1]] },
      ],
    })

    expect(visibleHeaders(el)).toHaveLength(2)
  })
})
