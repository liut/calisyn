import { useChatStore } from '@/store'

export function useChat() {
  const chatStore = useChatStore()

  const getChatByCsidAndIndex = (csid: string, index: number) => {
    return chatStore.getChatByCsidAndIndex(csid, index)
  }

  const addChat = (csid: string, chat: Chat.Chat) => {
    chatStore.addChatByCsid(csid, chat)
  }

  const updateChat = (csid: string, index: number, chat: Chat.Chat) => {
    chatStore.updateChatByCsid(csid, index, chat)
  }

  const updateChatSome = (csid: string, index: number, chat: Partial<Chat.Chat>) => {
    chatStore.updateChatSomeByCsid(csid, index, chat)
  }

  return {
    addChat,
    updateChat,
    updateChatSome,
    getChatByCsidAndIndex,
  }
}
