<script setup lang='ts'>
import { NButton } from 'naive-ui'
import { useRouter } from 'vue-router'
import { SvgIcon } from '@/components/common'
import { t } from '@/locales'
import { useChatStore } from '@/store'
import SkillPanel from './components/SkillPanel.vue'

const chatStore = useChatStore()
const router = useRouter()

function handleBackToChat() {
  if (chatStore.active)
    router.push({ name: 'Chat', params: { csid: chatStore.active } })
  else
    router.push({ name: 'Chat' })
}
</script>

<template>
  <div class="flex flex-col h-full p-4 overflow-hidden md:p-6">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <NButton quaternary size="small" @click="handleBackToChat">
          <template #icon>
            <SvgIcon icon="ri:arrow-left-line" />
          </template>
          {{ t('skill.backToChat') }}
        </NButton>
        <h2 class="text-lg font-medium">
          {{ t('skill.title') }}
        </h2>
      </div>
    </div>

    <div class="flex-1 overflow-hidden">
      <SkillPanel />
    </div>
  </div>
</template>
