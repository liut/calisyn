<script setup lang='ts'>
import type { CorpusImportTask } from '@/api/corpus'
import { NAlert, NButton, NModal, NProgress, NText, useMessage } from 'naive-ui'
import { computed, ref } from 'vue'
import { createCorpusImport } from '@/api/corpus'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { downloadCsv } from '../download'
import { buildImportTemplateCsv, decodeImportBytes, IMPORT_MAX_SIZE, validateImportFile } from '../import'
import { corpusErrorKey } from '../utils'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'created', task: CorpusImportTask | undefined): void
}>()

const message = useMessage()
const { isMobile } = useBasicLayout()

const fileInput = ref<HTMLInputElement | null>(null)
/** 只在提交成功后清空；失败时保留已选文件，允许直接重试（R7）。 */
const selectedFile = ref<{ name: string, size: number, file: File } | null>(null)
/** 预校验失败原因（i18n key）。 */
const errorKey = ref<string | null>(null)
/** 提交失败原因（服务端 message 或既有权限文案）。 */
const submitError = ref<string | null>(null)
const submitting = ref(false)
const percent = ref(0)

const canSubmit = computed(() => Boolean(selectedFile.value) && !errorKey.value && !submitting.value)

function formatSize(size: number) {
  if (size < 1024)
    return `${size} B`

  if (size < 1024 * 1024)
    return `${(size / 1024).toFixed(1)} KiB`

  return `${(size / 1024 / 1024).toFixed(2)} MiB`
}

function reset() {
  selectedFile.value = null
  errorKey.value = null
  submitError.value = null
  submitting.value = false
  percent.value = 0
}

function close() {
  emit('update:show', false)
}

function handleShowChange(visible: boolean) {
  // 取消或关闭弹窗时清空已选文件，下一次打开是干净状态。
  if (!visible)
    reset()

  emit('update:show', visible)
}

function pickFile() {
  if (submitting.value)
    return

  fileInput.value?.click()
}

async function selectFile(file: File) {
  selectedFile.value = { name: file.name, size: file.size, file }
  errorKey.value = null
  submitError.value = null
  percent.value = 0

  // 先做便宜的判定，不合格就不读文件内容。
  if (!file.name.toLowerCase().endsWith('.csv')) {
    errorKey.value = 'corpus.importInvalidType'
    return
  }

  if (file.size > IMPORT_MAX_SIZE) {
    errorKey.value = 'corpus.importTooLarge'
    return
  }

  const bytes = await file.arrayBuffer()
  // FileReader.readAsText 会把非法字节替换成 U+FFFD，必须用严格解码判定编码。
  const text = decodeImportBytes(bytes)

  if (text === null) {
    errorKey.value = 'corpus.importInvalidEncoding'
    return
  }

  errorKey.value = validateImportFile({ filename: file.name, size: file.size, text })
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  // 允许连续两次选中同一个文件。
  input.value = ''

  if (file)
    await selectFile(file)
}

async function handleSubmit() {
  const selected = selectedFile.value

  if (!selected || !canSubmit.value)
    return

  submitting.value = true
  submitError.value = null

  try {
    const res = await createCorpusImport(selected.file, {
      onUploadProgress: (event) => {
        if (event.total)
          percent.value = Math.round((event.loaded / event.total) * 100)
      },
    })

    message.success(t('corpus.importSuccess'))
    emit('created', res.result)
    reset()
    close()
  }
  catch (err) {
    // 保留已选文件与弹窗内容，展示服务端原因或既有权限文案（R7）。
    const key = corpusErrorKey(err)
    submitError.value = key ? t(key) : ((err as Error)?.message || t('corpus.importFailed'))
  }
  finally {
    submitting.value = false
  }
}

function downloadTemplate() {
  downloadCsv('corpus-import-template.csv', buildImportTemplateCsv())
}
</script>

<template>
  <NModal
    :show="props.show"
    preset="card"
    :title="t('corpus.importModalTitle')"
    :style="{ width: isMobile ? '92%' : '560px' }"
    @update:show="handleShowChange"
  >
    <div class="flex flex-col gap-4">
      <input ref="fileInput" class="hidden" type="file" accept=".csv,text/csv" @change="handleFileChange">

      <NButton dashed :disabled="submitting" @click="pickFile">
        {{ selectedFile ? t('corpus.importChangeFile') : t('corpus.importSelectFile') }}
      </NButton>

      <div v-if="selectedFile" class="flex flex-wrap items-center gap-2">
        <NText>{{ selectedFile.name }}</NText>
        <NText depth="3" class="text-xs">
          {{ formatSize(selectedFile.size) }}
        </NText>
      </div>

      <NAlert v-if="errorKey" type="warning">
        {{ t(errorKey) }}
      </NAlert>

      <NAlert v-if="submitError" type="error">
        {{ submitError }}
      </NAlert>

      <NProgress v-if="submitting && percent > 0" :percentage="percent" />

      <NText depth="3" class="text-xs whitespace-pre-line">
        {{ t('corpus.importFormatHint') }}
      </NText>

      <div>
        <NButton text type="primary" @click="downloadTemplate">
          {{ t('corpus.importDownloadTemplate') }}
        </NButton>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <NButton :disabled="submitting" @click="close">
          {{ t('common.cancel') }}
        </NButton>
        <NButton type="primary" :loading="submitting" :disabled="!canSubmit" @click="handleSubmit">
          {{ t('corpus.importSubmit') }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>
