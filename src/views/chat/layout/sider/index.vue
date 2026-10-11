<script setup lang='ts'>
import type { CSSProperties } from 'vue'
import { NButton, NLayoutSider, useDialog } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { HoverButton, PromptStore, SvgIcon } from '@/components/common'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAppStore, useAuthStore, useChatStore } from '@/store'
import Footer from './Footer.vue'
import List from './List.vue'

const appStore = useAppStore()
const chatStore = useChatStore()
const authStore = useAuthStore()
const router = useRouter()

const dialog = useDialog()

const { isMobile } = useBasicLayout()
const show = ref(false)

const collapsed = computed(() => appStore.siderCollapsed)

function handleAdd() {
  chatStore.addHistory({ title: t('chat.newChatTitle'), csid: `_${Date.now()}`, isEdit: false })
  if (isMobile.value)
    appStore.setSiderCollapsed(true)
}

function handleUpdateCollapsed() {
  appStore.setSiderCollapsed(!collapsed.value)
}

function handleClearAll() {
  dialog.warning({
    title: t('chat.deleteMessage'),
    content: t('chat.clearHistoryConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: () => {
      chatStore.clearHistory()
      if (isMobile.value)
        appStore.setSiderCollapsed(true)
    },
  })
}

// 顶部导航行：记忆 / 技能 / 语料库入口。语料库仅 keeper 可见。
function navigateTo(name: 'Memory' | 'Skills' | 'Corpus') {
  if (isMobile.value)
    appStore.setSiderCollapsed(true)
  router.push({ name })
}

const getMobileClass = computed<CSSProperties>(() => {
  if (isMobile.value) {
    return {
      position: 'fixed',
      zIndex: 50,
    }
  }
  return {}
})

const mobileSafeArea = computed(() => {
  if (isMobile.value) {
    return {
      paddingBottom: 'env(safe-area-inset-bottom)',
    }
  }
  return {}
})

watch(
  isMobile,
  (val) => {
    appStore.setSiderCollapsed(val)
  },
  {
    immediate: true,
    flush: 'post',
  },
)
</script>

<template>
  <NLayoutSider
    :collapsed="collapsed"
    :collapsed-width="0"
    :width="260"
    :show-trigger="isMobile ? false : 'arrow-circle'"
    collapse-mode="transform"
    position="absolute"
    bordered
    :style="getMobileClass"
    @update-collapsed="handleUpdateCollapsed"
  >
    <div class="flex flex-col h-full" :style="mobileSafeArea">
      <main class="flex flex-col flex-1 min-h-0">
        <nav class="flex items-center justify-around px-2 pt-3 pb-1">
          <HoverButton :tooltip="t('memory.entry')" @click="navigateTo('Memory')">
            <span class="text-xl text-[#4f555e] dark:text-white">
              <SvgIcon icon="ri:brain-line" />
            </span>
          </HoverButton>

          <HoverButton :tooltip="t('skill.entry')" @click="navigateTo('Skills')">
            <span class="text-xl text-[#4f555e] dark:text-white">
              <SvgIcon icon="ri:lightbulb-line" />
            </span>
          </HoverButton>

          <HoverButton v-if="authStore.isKeeper" :tooltip="t('corpus.entry')" @click="navigateTo('Corpus')">
            <span class="text-xl text-[#4f555e] dark:text-white">
              <SvgIcon icon="ri:book-open-line" />
            </span>
          </HoverButton>
        </nav>
        <div class="px-4 py-3">
          <NButton dashed block @click="handleAdd">
            {{ t('chat.newChatButton') }}
          </NButton>
        </div>
        <div class="flex-1 min-h-0 pb-4 overflow-hidden">
          <List />
        </div>
        <div class="flex items-center p-4 space-x-4">
          <div v-if="false" class="flex-1">
            <NButton block @click="show = true">
              {{ t('store.siderButton') }}
            </NButton>
          </div>
          <NButton v-if="false" @click="handleClearAll">
            <SvgIcon icon="ri:close-circle-line" />
          </NButton>
        </div>
      </main>
      <Footer />
    </div>
  </NLayoutSider>
  <template v-if="isMobile">
    <div v-show="!collapsed" class="fixed inset-0 z-40 w-full h-full bg-black/40" @click="handleUpdateCollapsed" />
  </template>
  <PromptStore v-model:visible="show" />
</template>
