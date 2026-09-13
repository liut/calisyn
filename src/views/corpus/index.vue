<script setup lang='ts'>
import { NAlert, NButton, NTabPane, NTabs } from 'naive-ui'
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { SvgIcon } from '@/components/common'
import { t } from '@/locales'
import { useChatStore } from '@/store'
import DocumentPanel from './components/DocumentPanel.vue'
import ImportTaskPanel from './components/ImportTaskPanel.vue'

type CorpusView = 'documents' | 'imports'

const chatStore = useChatStore()
const router = useRouter()

/** 两个面板都保持挂载（v-show 切换），切换视图不打断轮询、也不丢已加载数据。 */
const view = ref<CorpusView>('documents')
/** 导入面板上报的进行中任务数量：停留在文档视图也据此显示常驻提示（R11）。 */
const activeImportCount = ref(0)
/** 有任务进入终态后置位，切回文档视图时递增刷新触发器（R18）。 */
const docRefreshToken = ref(0)
let docRefreshPending = false

function handleImportFinished() {
  docRefreshPending = true
}

// 导入完成后不强制切换视图（用户可能正想看某个文档），
// 只在真正切回文档视图时刷新，避免打断当前阅读位置以外的操作。
watch(view, (value, previous) => {
  if (value !== 'documents' || previous === 'documents' || !docRefreshPending)
    return

  docRefreshPending = false
  docRefreshToken.value++
})

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
          {{ t('corpus.backToChat') }}
        </NButton>
        <h2 class="text-lg font-medium">
          {{ t('corpus.title') }}
        </h2>
      </div>
      <NTabs v-model:value="view" type="line" size="small" class="max-w-[240px]">
        <NTabPane name="documents" :tab="t('corpus.viewDocuments')" />
        <NTabPane name="imports" :tab="t('corpus.viewImports')" />
      </NTabs>
    </div>

    <NAlert v-if="activeImportCount > 0" class="mb-3" type="info">
      {{ t('corpus.importActiveHint', { count: activeImportCount }) }}
      <template #action>
        <NButton size="small" @click="view = 'imports'">
          {{ t('corpus.importViewTasks') }}
        </NButton>
      </template>
    </NAlert>

    <div class="flex-1 overflow-hidden">
      <DocumentPanel v-show="view === 'documents'" :refresh-token="docRefreshToken" />
      <ImportTaskPanel
        v-show="view === 'imports'"
        @update:active-count="activeImportCount = $event"
        @finished="handleImportFinished"
      />
    </div>
  </div>
</template>
