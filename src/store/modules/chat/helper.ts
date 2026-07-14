import { t } from '@/locales'
import { ss } from '@/utils/storage'

const LOCAL_NAME = 'chatStorage'

export function defaultState(): Chat.ChatState {
  const csid = ''
  return {
    active: csid,
    usingContext: true,
    history: [{ csid, title: t('chat.newChatTitle'), isEdit: false }],
    chat: [{ csid, data: [] }],
    runningStreams: {},
  }
}

export function getLocalState(): Chat.ChatState {
  const localState = ss.get(LOCAL_NAME)

  // 迁移旧数据：将uuid转换为带下划线的csid
  if (localState?.history) {
    localState.history = localState.history.map((item: any) => ({
      ...item,
      csid: item.csid || (item.uuid ? `_${item.uuid.toString()}` : ''),
      uuid: undefined, // 移除旧字段
    }))
  }
  if (localState?.chat) {
    localState.chat = localState.chat.map((item: any) => ({
      ...item,
      csid: item.csid || (item.uuid ? `_${item.uuid.toString()}` : ''),
      uuid: undefined, // 移除旧字段
    }))
  }
  if (localState?.active)
    localState.active = localState.active.toString()

  // runningStreams 是运行时字段，刷新后清空（避免 AbortController 走 JSON.stringify 退化）
  if (localState?.runningStreams)
    delete localState.runningStreams

  return { ...defaultState(), ...localState }
}

export function setLocalState(state: Chat.ChatState) {
  // 过滤运行时字段，AbortController 等不可序列化对象不应进入 localStorage
  const { runningStreams: _runningStreams, ...persisted } = state
  ss.set(LOCAL_NAME, persisted)
}
