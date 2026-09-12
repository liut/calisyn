<script setup lang='ts'>
import type { CorpusDocument, CorpusDocumentPatch } from '@/api/corpus'
import { NButton, NDrawer, NDrawerContent, NInput, NSpace, NText, useDialog, useMessage } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { deleteCorpusDocument, updateCorpusDocument } from '@/api/corpus'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { buildCorpusPatch, corpusErrorKey } from '../utils'

const props = defineProps<{
  show: boolean
  doc: CorpusDocument | null
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'saved', document: CorpusDocument): void
  (e: 'deleted', id: string): void
}>()

const dialog = useDialog()
const message = useMessage()
const { isMobile } = useBasicLayout()

const form = ref<Required<CorpusDocumentPatch>>({
  title: '',
  heading: '',
  content: '',
})
const saving = ref(false)
const deleting = ref(false)

const width = computed(() => (isMobile.value ? '100%' : 720))

const title = computed(() => props.doc?.title || t('corpus.detailTitle'))

function resetForm() {
  const doc = props.doc

  form.value = {
    title: doc?.title ?? '',
    heading: doc?.heading ?? '',
    content: doc?.content ?? '',
  }
}

watch(() => props.doc, resetForm, { immediate: true })

// 每次打开抽屉都从当前行重新初始化，避免上一次未保存的编辑在重新打开时"复活"。
watch(() => props.show, (visible) => {
  if (visible)
    resetForm()
})

function formatTime(value?: string) {
  if (!value)
    return '—'

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function errorTip(error: unknown, fallbackKey: string) {
  return t(corpusErrorKey(error) ?? fallbackKey)
}

function close() {
  emit('update:show', false)
}

async function handleSave() {
  const doc = props.doc

  if (!doc || saving.value)
    return

  const patch = buildCorpusPatch(doc, form.value)

  if (Object.keys(patch).length === 0) {
    close()
    return
  }

  saving.value = true

  try {
    await updateCorpusDocument(doc.id, patch)
    message.success(t('common.saveSuccess'))
    // 保存成功才刷新列表行；失败时保留本地编辑内容，不关闭抽屉。
    emit('saved', { ...doc, ...patch })
    close()
  }
  catch (error) {
    message.error(errorTip(error, 'corpus.saveFailed'))
  }
  finally {
    saving.value = false
  }
}

function handleDelete() {
  const doc = props.doc

  if (!doc || deleting.value)
    return

  dialog.warning({
    title: t('corpus.deleteConfirmTitle'),
    content: t('corpus.deleteConfirmContent'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: async () => {
      deleting.value = true

      try {
        await deleteCorpusDocument(doc.id)
        message.success(t('common.deleteSuccess'))
        emit('deleted', doc.id)
        close()
      }
      catch (error) {
        message.error(errorTip(error, 'corpus.deleteFailed'))
      }
      finally {
        deleting.value = false
      }
    },
  })
}
</script>

<template>
  <NDrawer :show="show" :width="width" placement="right" @update:show="emit('update:show', $event)">
    <NDrawerContent :title="title" closable>
      <div v-if="doc" class="flex flex-col gap-4 h-full">
        <div class="flex flex-col gap-1">
          <NText depth="3" class="text-xs">
            {{ t('corpus.createdAt') }}：{{ formatTime(doc.createdAt) }}
          </NText>
          <NText depth="3" class="text-xs">
            {{ t('corpus.updatedAt') }}：{{ formatTime(doc.updatedAt) }}
          </NText>
        </div>

        <div class="flex flex-col gap-1">
          <NText depth="3" class="text-xs">
            {{ t('corpus.fieldTitle') }}
          </NText>
          <NInput v-model:value="form.title" :placeholder="t('corpus.fieldTitle')" />
        </div>

        <div class="flex flex-col gap-1">
          <NText depth="3" class="text-xs">
            {{ t('corpus.fieldHeading') }}
          </NText>
          <NInput v-model:value="form.heading" :placeholder="t('corpus.fieldHeading')" />
        </div>

        <div class="flex flex-col flex-1 gap-1 min-h-0">
          <NText depth="3" class="text-xs">
            {{ t('corpus.fieldContent') }}
          </NText>
          <NInput
            v-model:value="form.content"
            type="textarea"
            :autosize="{ minRows: 10 }"
            :placeholder="t('corpus.fieldContent')"
          />
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between w-full">
          <NButton tertiary type="error" :loading="deleting" @click="handleDelete">
            {{ t('common.delete') }}
          </NButton>
          <NSpace>
            <NButton :disabled="saving" @click="close">
              {{ t('common.cancel') }}
            </NButton>
            <NButton type="primary" :loading="saving" @click="handleSave">
              {{ t('common.save') }}
            </NButton>
          </NSpace>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
