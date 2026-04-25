import type { PromptStore } from './helper'
import { defineStore } from 'pinia'
import { getLocalPromptList, setLocalPromptList } from './helper'

export const usePromptStore = defineStore('prompt-store', {
  state: (): PromptStore => getLocalPromptList(),

  actions: {
    updatePromptList(promptList: []) {
      this.$patch({ promptList })
      setLocalPromptList({ promptList })
    },
    getPromptList() {
      return this.$state
    },
  },
})
