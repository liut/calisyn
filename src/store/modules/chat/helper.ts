import { ss } from '@/utils/storage'
import { t } from '@/locales'

const LOCAL_NAME = 'chatStorage'

export function defaultState(): Chat.ChatState {
  const csid = ''
  return {
    active: csid,
    usingContext: true,
    history: [{ csid, title: t('chat.newChatTitle'), isEdit: false }],
    chat: [{ csid, data: [] }],
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

  return { ...defaultState(), ...localState }
}

export function setLocalState(state: Chat.ChatState) {
  ss.set(LOCAL_NAME, state)
}
