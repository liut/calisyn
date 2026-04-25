import { defineStore } from 'pinia'
import { t } from '@/locales'
import { router } from '@/router'
import { defaultState, getLocalState, setLocalState } from './helper'

export const useChatStore = defineStore('chat-store', {
  state: (): Chat.ChatState => getLocalState(),

  getters: {
    getChatHistoryByCurrentActive(state: Chat.ChatState) {
      const index = state.history.findIndex(item => item.csid === state.active)
      if (index !== -1)
        return state.history[index]
      return null
    },

    getChatByCsid(state: Chat.ChatState) {
      return (csid?: string) => {
        if (csid)
          return state.chat.find(item => item.csid === csid)?.data ?? []
        return state.chat.find(item => item.csid === state.active)?.data ?? []
      }
    },
  },

  actions: {
    setUsingContext(context: boolean) {
      this.usingContext = context
      this.recordState()
    },

    addHistory(history: Chat.History, chatData: Chat.Chat[] = []) {
      this.history.unshift(history)
      this.chat.unshift({ csid: history.csid, data: chatData })
      this.active = history.csid
      this.reloadRoute(history.csid)
    },

    updateHistory(csid: string, edit: Partial<Chat.History>) {
      const index = this.history.findIndex(item => item.csid === csid)
      if (index !== -1) {
        this.history[index] = { ...this.history[index], ...edit }
        this.recordState()
      }
    },

    async deleteHistory(index: number) {
      this.history.splice(index, 1)
      this.chat.splice(index, 1)

      if (this.history.length === 0) {
        this.active = null
        this.reloadRoute()
        return
      }

      if (index > 0 && index <= this.history.length) {
        const csid = this.history[index - 1].csid
        this.active = csid
        this.reloadRoute(csid)
        return
      }

      if (index === 0) {
        if (this.history.length > 0) {
          const csid = this.history[0].csid
          this.active = csid
          this.reloadRoute(csid)
        }
      }

      if (index > this.history.length) {
        const csid = this.history[this.history.length - 1].csid
        this.active = csid
        this.reloadRoute(csid)
      }
    },

    async setActive(csid: string) {
      this.active = csid
      return await this.reloadRoute(csid)
    },

    getChatByCsidAndIndex(csid: string, index: number) {
      if (!csid) {
        if (this.chat.length)
          return this.chat[0].data[index]
        return null
      }
      const chatIndex = this.chat.findIndex(item => item.csid === csid)
      if (chatIndex !== -1)
        return this.chat[chatIndex].data[index]
      return null
    },

    addChatByCsid(csid: string, chat: Chat.Chat) {
      if (!csid) {
        if (this.history.length === 0) {
          const csid = ''
          this.history.push({ csid, title: chat.text, isEdit: false })
          this.chat.push({ csid, data: [chat] })
          this.active = csid
          this.recordState()
        }
        else {
          this.chat[0].data.push(chat)
          if (this.history[0].title === t('chat.newChatTitle'))
            this.history[0].title = chat.text
          this.recordState()
        }
        return
      }

      const index = this.chat.findIndex(item => item.csid === csid)
      if (index !== -1) {
        this.chat[index].data.push(chat)
        if (this.history[index].title === t('chat.newChatTitle'))
          this.history[index].title = chat.text
        this.recordState()
      }
    },

    updateChatByCsid(csid: string, index: number, chat: Chat.Chat) {
      if (!csid) {
        if (this.chat.length) {
          this.chat[0].data[index] = chat
          this.recordState()
        }
        return
      }

      const chatIndex = this.chat.findIndex(item => item.csid === csid)
      if (chatIndex !== -1) {
        this.chat[chatIndex].data[index] = chat
        this.recordState()
      }
    },

    updateChatSomeByCsid(csid: string, index: number, chat: Partial<Chat.Chat>) {
      if (!csid) {
        if (this.chat.length) {
          this.chat[0].data[index] = { ...this.chat[0].data[index], ...chat }
          this.recordState()
        }
        return
      }

      const chatIndex = this.chat.findIndex(item => item.csid === csid)
      if (chatIndex !== -1) {
        this.chat[chatIndex].data[index] = { ...this.chat[chatIndex].data[index], ...chat }
        this.recordState()
      }
    },

    deleteChatByCsid(csid: string, index: number) {
      if (!csid) {
        if (this.chat.length) {
          this.chat[0].data.splice(index, 1)
          this.recordState()
        }
        return
      }

      const chatIndex = this.chat.findIndex(item => item.csid === csid)
      if (chatIndex !== -1) {
        this.chat[chatIndex].data.splice(index, 1)
        this.recordState()
      }
    },

    clearChatByCsid(csid: string) {
      if (!csid) {
        if (this.chat.length) {
          this.chat[0].data = []
          this.recordState()
        }
        return
      }

      const index = this.chat.findIndex(item => item.csid === csid)
      if (index !== -1) {
        this.chat[index].data = []
        this.recordState()
      }
    },

    clearHistory() {
      this.$state = { ...defaultState() }
      this.recordState()
    },

    async reloadRoute(csid?: string) {
      this.recordState()
      await router.push({ name: 'Chat', params: { csid } })
    },

    // 更新chat条目的csid（当SSE返回新的csid时调用）
    async updateCsid(oldCsid: string, newCsid: string) {
      // 更新chat数组中的csid
      const chatIndex = this.chat.findIndex(item => item.csid === oldCsid)
      if (chatIndex !== -1)
        this.chat[chatIndex].csid = newCsid

      // 更新history数组中的csid
      const historyIndex = this.history.findIndex(item => item.csid === oldCsid)
      if (historyIndex !== -1)
        this.history[historyIndex].csid = newCsid

      // 更新active
      if (this.active === oldCsid)
        this.active = newCsid

      // 更新路由
      await this.reloadRoute(newCsid)

      this.recordState()
    },

    recordState() {
      setLocalState(this.$state)
    },
  },
})
