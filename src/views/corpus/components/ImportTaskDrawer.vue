<script setup lang='ts'>
import type { DataTableColumns } from 'naive-ui'
import type { ImportFailureRow } from '../import'
import type { CorpusImportTask } from '@/api/corpus'
import { NAlert, NButton, NDataTable, NDrawer, NDrawerContent, NSpace, NTag, NText, useMessage } from 'naive-ui'
import { computed, h, ref, watch } from 'vue'
import { fetchCorpusImport } from '@/api/corpus'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import {
  buildImportFailureCsv,
  hasImportFailureRows,
  importDetailCount,
  importFailureGroupKey,
  importFailureRows,
  importStatusKey,
} from '../import'
import { corpusErrorKey } from '../utils'

const props = defineProps<{
  show: boolean
  task: CorpusImportTask | null
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
}>()

const message = useMessage()
const { isMobile } = useBasicLayout()

/** 详情只在打开时拉取（列表接口不返回明细），关闭即丢弃。 */
const detail = ref<CorpusImportTask | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)

const width = computed(() => (isMobile.value ? '100%' : 760))
const title = computed(() => props.task?.filename || t('corpus.importDetailTitle'))
/** 拉取完成前先用列表行兜底，避免抽屉空白。 */
const current = computed(() => detail.value ?? props.task)
const counts = computed(() => {
  const task = current.value

  return {
    total: task?.total ?? 0,
    success: task?.success ?? 0,
    failed: task?.failed ?? 0,
    skipped: task?.skipped ?? 0,
  }
})
const rows = computed<ImportFailureRow[]>(() => (current.value ? importFailureRows(current.value) : []))
const detailCount = computed(() => importDetailCount(current.value ?? { errors: [], failed: 0, skipped: 0 }))
const canExport = computed(() => Boolean(current.value && hasImportFailureRows(current.value)))

const columns = computed<DataTableColumns<ImportFailureRow>>(() => [
  {
    key: 'line',
    title: t('corpus.importColumnLine'),
    width: 80,
  },
  {
    key: 'title',
    title: t('corpus.columnTitle'),
    minWidth: 140,
    ellipsis: { tooltip: true },
  },
  {
    key: 'reason',
    title: t('corpus.importColumnReason'),
    minWidth: 220,
    ellipsis: { tooltip: true },
  },
  {
    key: 'kind',
    title: t('corpus.importColumnKind'),
    width: 100,
    render: (row: ImportFailureRow) => h(
      NTag,
      {
        size: 'small',
        bordered: false,
        type: row.group === 'failed' ? 'error' : row.group === 'skipped' ? 'warning' : 'default',
      },
      { default: () => t(importFailureGroupKey(row.group)) },
    ),
  },
] as unknown as DataTableColumns<ImportFailureRow>)

function formatTime(value?: string | null) {
  if (!value)
    return '—'

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function errorTip(err: unknown, fallbackKey: string) {
  return t(corpusErrorKey(err) ?? fallbackKey)
}

/** 递增序号：关闭抽屉或切换任务时丢弃在飞的响应，避免旧数据回填。 */
let loadToken = 0

function reset() {
  loadToken++
  detail.value = null
  error.value = null
  loading.value = false
}

async function load() {
  const task = props.task

  if (!task)
    return

  const token = ++loadToken

  loading.value = true
  error.value = null

  try {
    const res = await fetchCorpusImport(task.id)

    if (token !== loadToken)
      return

    detail.value = res.result ?? null
  }
  catch (err) {
    if (token !== loadToken)
      return

    error.value = err
  }
  finally {
    if (token === loadToken)
      loading.value = false
  }
}

watch(() => [props.show, props.task?.id] as const, ([visible]) => {
  // 关闭或切换任务时清空本地状态，下一次打开不会闪现上一个任务的明细。
  reset()

  if (visible)
    load()
}, { immediate: true })

function handleExport() {
  const task = current.value

  if (!task)
    return

  const csv = buildImportFailureCsv(task)

  if (!csv) {
    message.warning(t('corpus.importExportEmpty'))
    return
  }

  // BOM 让 Excel 正确识别 UTF-8；morrigan 上传时会剥离 BOM 再校验表头。
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `${(task.filename || 'corpus').replace(/\.csv$/i, '')}-failed.csv`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <NDrawer :show="show" :width="width" placement="right" @update:show="emit('update:show', $event)">
    <NDrawerContent :title="title" closable>
      <div class="flex flex-col gap-4 h-full min-h-0">
        <div class="flex flex-wrap items-center gap-4">
          <NText depth="3" class="text-xs">
            {{ t('corpus.importFieldStatus') }}：{{ current ? t(importStatusKey(current.status)) : '—' }}
          </NText>
          <NText depth="3" class="text-xs">
            {{ t('corpus.importFieldTotal') }}：{{ counts.total }}
          </NText>
          <NText depth="3" class="text-xs">
            {{ t('corpus.importFieldSuccess') }}：{{ counts.success }}
          </NText>
          <NText depth="3" class="text-xs">
            {{ t('corpus.importFieldFailed') }}：{{ counts.failed }}
          </NText>
          <NText depth="3" class="text-xs">
            {{ t('corpus.importFieldSkipped') }}：{{ counts.skipped }}
          </NText>
        </div>

        <div class="flex flex-wrap gap-4">
          <NText depth="3" class="text-xs">
            {{ t('corpus.createdAt') }}：{{ formatTime(current?.createdAt) }}
          </NText>
          <NText depth="3" class="text-xs">
            {{ t('corpus.importStartedAt') }}：{{ formatTime(current?.startedAt) }}
          </NText>
          <NText depth="3" class="text-xs">
            {{ t('corpus.importFinishedAt') }}：{{ formatTime(current?.finishedAt) }}
          </NText>
        </div>

        <NAlert v-if="error" type="error">
          {{ errorTip(error, 'corpus.loadFailed') }}
          <template #action>
            <NButton size="small" @click="load">
              {{ t('corpus.retry') }}
            </NButton>
          </template>
        </NAlert>

        <NText v-if="detailCount.truncated" depth="3" class="text-xs">
          {{ t('corpus.importDetailTruncated', { shown: detailCount.shown, total: detailCount.total }) }}
        </NText>

        <div class="flex-1 min-h-0">
          <NDataTable
            :columns="columns"
            :data="rows"
            :loading="loading"
            :bordered="false"
            :max-height="isMobile ? 320 : 460"
          >
            <template #empty>
              <div class="py-8 text-center text-gray-400">
                {{ t('corpus.importDetailEmpty') }}
              </div>
            </template>
          </NDataTable>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-end w-full">
          <NSpace>
            <NButton tertiary :disabled="!canExport" @click="handleExport">
              {{ t('corpus.importExportFailedRows') }}
            </NButton>
            <NButton @click="emit('update:show', false)">
              {{ t('corpus.importClose') }}
            </NButton>
          </NSpace>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
