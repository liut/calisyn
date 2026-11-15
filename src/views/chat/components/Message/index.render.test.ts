import { NMessageProvider } from 'naive-ui'
import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { setLocale, waitingPool } from '@/locales'
import Message from './index.vue'

/** 挂载 Message（外层套 NMessageProvider 以满足 useMessage）并返回容器。 */
async function mountMessage(props: Record<string, unknown>) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  createApp({
    render: () => h(NMessageProvider, null, { default: () => h(Message, props) }),
  }).mount(el)
  await nextTick()
  return el
}

/** 流式等待指示。 */
function indicator(el: HTMLElement) {
  return el.querySelector('.message-waiting-indicator')
}

/** 流式输出底部的等待提示。 */
function streamWaitingTip(el: HTMLElement) {
  return el.querySelector('.message-stream-waiting-tip')
}

/** 重新生成按钮。 */
function regenerate(el: HTMLElement) {
  return el.querySelector('.message-regenerate')
}

/** 「更多」菜单触发按钮。 */
function more(el: HTMLElement) {
  return el.querySelector('.message-more')
}

describe('message 动作列的等待状态', () => {
  it('流式期间：显示等待指示，隐藏重新生成与更多菜单', async () => {
    const el = await mountMessage({ text: '思考中', loading: true, inversion: false })

    expect(indicator(el)).not.toBeNull()
    expect(streamWaitingTip(el)).not.toBeNull()
    expect(regenerate(el)).toBeNull()
    expect(more(el)).toBeNull()
  })

  it('流式结束：恢复重新生成与更多菜单，清除等待指示与输出底部提示', async () => {
    const el = await mountMessage({ text: '完成', loading: false, inversion: false })

    expect(indicator(el)).toBeNull()
    expect(streamWaitingTip(el)).toBeNull()
    expect(regenerate(el)).not.toBeNull()
    expect(more(el)).not.toBeNull()
  })

  it('用户消息：只有更多菜单，不显示等待指示与重新生成按钮', async () => {
    const el = await mountMessage({ text: '你好', inversion: true })

    expect(indicator(el)).toBeNull()
    expect(regenerate(el)).toBeNull()
    expect(more(el)).not.toBeNull()
  })

  it('等待指示的提示取自等待短语库', async () => {
    const el = await mountMessage({ text: '思考中', loading: true, inversion: false })
    const title = indicator(el)?.getAttribute('title')

    expect(title).toBeTruthy()
    expect(waitingPool()).toContain(title)
    expect(streamWaitingTip(el)?.textContent?.trim()).toBe(title)
  })

  it('切换语言后提示同步换成另一种语言的说法', async () => {
    const el = await mountMessage({ text: '思考中', loading: true, inversion: false })
    const before = indicator(el)?.getAttribute('title')

    setLocale('zh-CN')
    await nextTick()

    const after = indicator(el)?.getAttribute('title')
    expect(after).not.toBe(before)
    expect(waitingPool()).toContain(after)
    expect(streamWaitingTip(el)?.textContent?.trim()).toBe(after)

    setLocale('en-US')
  })
})
