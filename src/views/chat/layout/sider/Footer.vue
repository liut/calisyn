<script setup lang='ts'>
import { defineAsyncComponent, ref } from 'vue'
import { useRouter } from 'vue-router'
import { HoverButton, SvgIcon, UserAvatar } from '@/components/common'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAppStore, useAuthStore } from '@/store'

const Setting = defineAsyncComponent(() => import('@/components/common/Setting/index.vue'))

const router = useRouter()
const appStore = useAppStore()
const authStore = useAuthStore()
const { isMobile } = useBasicLayout()

const show = ref(false)

function handleCorpusEntry() {
  if (isMobile.value)
    appStore.setSiderCollapsed(true)

  router.push({ name: 'Corpus' })
}

// 技能页对所有登录用户开放：入口不带 keeper 限制，可见范围由服务端按频道与归属判定。
function handleSkillEntry() {
  if (isMobile.value)
    appStore.setSiderCollapsed(true)

  router.push({ name: 'Skills' })
}
</script>

<template>
  <footer class="flex items-center justify-between min-w-0 p-4 overflow-hidden border-t dark:border-neutral-800">
    <div class="flex-1 flex-shrink-0 overflow-hidden">
      <UserAvatar />
    </div>

    <HoverButton v-if="authStore.isKeeper" :tooltip="t('corpus.entry')" @click="handleCorpusEntry">
      <span class="text-xl text-[#4f555e] dark:text-white">
        <SvgIcon icon="ri:book-open-line" />
      </span>
    </HoverButton>

    <HoverButton :tooltip="t('skill.entry')" @click="handleSkillEntry">
      <span class="text-xl text-[#4f555e] dark:text-white">
        <SvgIcon icon="ri:lightbulb-line" />
      </span>
    </HoverButton>

    <HoverButton v-if="true" @click="show = true">
      <span class="text-xl text-[#4f555e] dark:text-white">
        <SvgIcon icon="ri:settings-4-line" />
      </span>
    </HoverButton>

    <Setting v-if="show" v-model:visible="show" />
  </footer>
</template>
