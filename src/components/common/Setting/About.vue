<script setup lang='ts'>
import { NSpin } from 'naive-ui'
import { computed, onMounted, ref } from 'vue'
import { fetchChatConfig } from '@/api'
import { t } from '@/locales'
import { useAuthStore } from '@/store'
import pkg from '../../../../package.json'

interface ConfigState {
  timeoutMs?: number
  reverseProxy?: string
  provider?: string
  model?: string
  socksProxy?: string
  httpsProxy?: string
  usage?: string
}

const authStore = useAuthStore()

const loading = ref(false)

const config = ref<ConfigState>()

const hasAdvanced = computed<boolean>(() => !!authStore.hasAdvanced)

async function fetchConfig() {
  try {
    loading.value = true
    const { data } = await fetchChatConfig<ConfigState>()
    config.value = data
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchConfig()
})
</script>

<template>
  <NSpin :show="loading">
    <div class="p-4 space-y-4">
      <h2 class="text-xl font-bold">
        Version - {{ pkg.version }}
      </h2>
      <div class="p-2 space-y-2 rounded-md bg-neutral-100 dark:bg-neutral-700">
        <p>
          {{ t("setting.openSource") }}
          <a
            class="text-blue-600 dark:text-blue-500"
            href="https://github.com/liut/calisyn"
            target="_blank"
          >
            GitHub
          </a>
          {{ t("setting.freeMIT") }}
        </p>
        <p>
          {{ t("setting.stars") }}
        </p>
      </div>
      <p>{{ t("setting.api") }}：{{ config?.provider ?? '-' }}</p>
      <p>{{ t("setting.model") }}：{{ config?.model ?? '-' }}</p>
      <p v-if="hasAdvanced">
        {{ t("setting.monthlyUsage") }}：{{ config?.usage ?? '-' }}
      </p>
      <p v-if="!hasAdvanced">
        {{ t("setting.reverseProxy") }}：{{ config?.reverseProxy ?? '-' }}
      </p>
      <p>{{ t("setting.timeout") }}：{{ config?.timeoutMs ?? '-' }}</p>
      <p>{{ t("setting.socks") }}：{{ config?.socksProxy ?? '-' }}</p>
      <p>{{ t("setting.httpsProxy") }}：{{ config?.httpsProxy ?? '-' }}</p>
    </div>
  </NSpin>
</template>
