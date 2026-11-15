<script setup lang='ts'>
import { NDropdown, useMessage } from 'naive-ui'
import { computed, ref } from 'vue'
import { SvgIcon } from '@/components/common'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useIconRender } from '@/hooks/useIconRender'
import { t, waitingPool } from '@/locales'
import { copyToClip } from '@/utils/copy'
import AvatarComponent from './Avatar.vue'
import TextComponent from './Text.vue'

interface Props {
  dateTime?: string
  text?: string
  inversion?: boolean
  error?: boolean
  loading?: boolean
  toolCalling?: boolean
  toolCalls?: Chat.Tool[]
  chunks?: Chat.MessageChunk[]
}

interface Emit {
  (ev: 'regenerate'): void
  (ev: 'delete'): void
}

const props = defineProps<Props>()

const emit = defineEmits<Emit>()

const { isMobile } = useBasicLayout()

const { iconRender } = useIconRender()

const message = useMessage()

const textRef = ref<HTMLElement>()

const asRawText = ref(props.inversion)

const messageRef = ref<HTMLElement>()

// 每条消息固定一条等待提示：流式期间不跳动，切换语言时同步换语种
const waitingIndex = Math.floor(Math.random() * waitingPool().length)
const waitingTip = computed(() => waitingPool()[waitingIndex] ?? '')

const options = computed(() => {
  const common = [
    {
      label: t('chat.copy'),
      key: 'copyText',
      icon: iconRender({ icon: 'ri:file-copy-2-line' }),
    },
    {
      label: t('common.delete'),
      key: 'delete',
      icon: iconRender({ icon: 'ri:delete-bin-line' }),
    },
  ]

  if (!props.inversion) {
    common.unshift({
      label: asRawText.value ? t('chat.preview') : t('chat.showRawText'),
      key: 'toggleRenderType',
      icon: iconRender({ icon: asRawText.value ? 'ic:outline-code-off' : 'ic:outline-code' }),
    })
  }

  return common
})

function handleSelect(key: 'copyText' | 'delete' | 'toggleRenderType') {
  switch (key) {
    case 'copyText':
      handleCopy()
      return
    case 'toggleRenderType':
      asRawText.value = !asRawText.value
      return
    case 'delete':
      emit('delete')
  }
}

function handleRegenerate() {
  messageRef.value?.scrollIntoView()
  emit('regenerate')
}

async function handleCopy() {
  try {
    await copyToClip(props.text || '')
    message.success(t('chat.copied'))
  }
  catch {
    message.error(t('chat.copyFailed'))
  }
}
</script>

<template>
  <div
    ref="messageRef"
    class="flex w-full mb-6 overflow-hidden"
    :class="[{ 'flex-row-reverse': inversion }]"
  >
    <div
      class="flex items-center justify-center flex-shrink-0 h-8 overflow-hidden rounded-full basis-8"
      :class="[inversion ? 'ml-2' : 'mr-2']"
    >
      <AvatarComponent :image="inversion" />
    </div>
    <div class="overflow-hidden text-sm " :class="[inversion ? 'items-end' : 'items-start']">
      <p class="text-xs text-[#b4bbc4]" :class="[inversion ? 'text-right' : 'text-left']">
        {{ dateTime }}
      </p>
      <div
        class="flex items-end gap-1 mt-2"
        :class="[inversion ? 'flex-row-reverse' : 'flex-row']"
      >
        <TextComponent
          ref="textRef"
          :inversion="inversion"
          :error="error"
          :text="text"
          :loading="loading"
          :tool-calling="toolCalling"
          :tool-calls="toolCalls"
          :chunks="chunks"
          :waiting-tip="waitingTip"
          :as-raw-text="asRawText"
        />
        <div class="flex flex-col">
          <!-- 流式期间原地换成等待指示：与下方按钮同尺寸，流结束时布局不位移 -->
          <div
            v-if="loading"
            class="message-waiting-indicator mb-2 flex items-center justify-center text-neutral-300 dark:text-neutral-200"
            :title="waitingTip"
          >
            <SvgIcon icon="ri:loader-4-line" class="animate-spin" />
          </div>
          <button
            v-else-if="!inversion"
            class="message-regenerate mb-2 transition text-neutral-300 hover:text-neutral-800 dark:hover:text-neutral-300"
            @click="handleRegenerate"
          >
            <SvgIcon icon="ri:restart-line" />
          </button>
          <NDropdown
            v-if="!loading"
            :trigger="isMobile ? 'click' : 'hover'"
            :placement="!inversion ? 'right' : 'left'"
            :options="options"
            @select="handleSelect"
          >
            <button class="message-more transition text-neutral-300 hover:text-neutral-800 dark:hover:text-neutral-200">
              <SvgIcon icon="ri:more-2-fill" />
            </button>
          </NDropdown>
        </div>
      </div>
    </div>
  </div>
</template>
