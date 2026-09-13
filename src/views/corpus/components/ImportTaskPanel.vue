<script setup lang='ts'>
import type { DataTableColumns } from 'naive-ui'
import type { CorpusImportTask, CorpusImportTaskStatus } from '@/api/corpus'
import { NAlert, NButton, NDataTable, NPagination, NSelect, NTag, NTooltip, useMessage } from 'naive-ui'
import { computed, h, onMounted, onUnmounted, ref } from 'vue'
import { fetchCorpusImports } from '@/api/corpus'
import { t } from '@/locales'
import {
  activeImportCount,
  importStatusKey,
  importSummaryParams,
  isImportTaskActive,
  newlyFinishedImports,
  showsImportCounts,
} from '../import'
import { corpusErrorKey } from '../utils'
import ImportTaskDrawer from './ImportTaskDrawer.vue'
import ImportUploadModal from './ImportUploadModal.vue'

const emit = defineEmits<{
  (e: 'update:activeCount', count: number): void
  (e: 'finished', task: CorpusImportTask): void
}>()

const message = useMessage()

/** 轮询间隔：后端在任务结束时才写回计数，3 秒足以覆盖逐行 embedding 的耗时。 */
const POLL_INTERVAL = 3000
const DEFAULT_SORT = '-created'
const PLACEHOLDER = '—'

const page = ref(1)
const pageSize = ref(20)
/** 空串表示「全部」，与 NSelect 的 value 类型保持一致。 */
const statusFilter = ref<CorpusImportTaskStatus | ''>('')
const loading = ref(false)
const error = ref<unknown>(null)
const rows = ref<CorpusImportTask[]>([])
const total = ref(0)

const uploadVisible = ref(false)
const detailVisible = ref(false)
const activeTask = ref<CorpusImportTask | null>(null)

/** 本会话中观察到过的「进行中」任务：只有它们进入终态才提示，历史任务不打扰 keeper。 */
const watchedIds = new Set<string>()
/** 已经提示过完成摘要的任务，轮询多次返回同一终态不会重复提示（R12）。 */
const notifiedIds = new Set<string>()

const statusOptions = computed(() => [
  { label: t('corpus.importFilterAll'), value: '' },
  { label: t('corpus.importStatusPending'), value: 'pending' },
  { label: t('corpus.importStatusProcessing'), value: 'processing' },
  { label: t('corpus.importStatusSucceeded'), value: 'succeeded' },
  { label: t('corpus.importStatusFailed'), value: 'failed' },
])

/** 递增请求序号：筛选、翻页与轮询可能同时在飞，只接受最后一次发起的响应。 */
let loadToken = 0
let pollTimer: ReturnType<typeof setInterval> | null = null

function statusTagType(status: CorpusImportTaskStatus) {
  if (status === 'succeeded')
    return 'success'

  if (status === 'failed')
    return 'error'

  if (status === 'processing')
    return 'info'

  return 'default'
}

/** 处理中的任务不展示行级计数：后端结束时才写回，显示 0 会被误读成「0 行成功」。 */
function countCell(task: CorpusImportTask, value: number) {
  return showsImportCounts(task.status) ? String(value) : PLACEHOLDER
}

function formatTime(value?: string | null) {
  if (!value)
    return PLACEHOLDER

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function errorTip(err: unknown, fallbackKey: string) {
  return t(corpusErrorKey(err) ?? fallbackKey)
}

const columns = computed<DataTableColumns<CorpusImportTask>>(() => [
  {
    key: 'filename',
    title: t('corpus.importColumnFilename'),
    minWidth: 180,
    ellipsis: { tooltip: true },
  },
  {
    key: 'status',
    title: t('corpus.importColumnStatus'),
    width: 110,
    render: (task: CorpusImportTask) => h(
      NTag,
      { size: 'small', bordered: false, type: statusTagType(task.status) },
      { default: () => t(importStatusKey(task.status)) },
    ),
  },
  {
    key: 'total',
    title: t('corpus.importColumnTotal'),
    width: 90,
    render: (task: CorpusImportTask) => countCell(task, task.total),
  },
  {
    key: 'success',
    title: t('corpus.importColumnSuccess'),
    width: 80,
    render: (task: CorpusImportTask) => countCell(task, task.success),
  },
  {
    key: 'failed',
    title: t('corpus.importColumnFailed'),
    width: 80,
    render: (task: CorpusImportTask) => countCell(task, task.failed),
  },
  {
    key: 'skipped',
    title: t('corpus.importColumnSkipped'),
    width: 80,
    render: (task: CorpusImportTask) => countCell(task, task.skipped),
  },
  {
    key: 'created',
    title: t('corpus.createdAt'),
    width: 180,
    render: (task: CorpusImportTask) => formatTime(task.createdAt),
  },
  {
    key: 'finished',
    title: t('corpus.importFinishedAt'),
    width: 180,
    render: (task: CorpusImportTask) => formatTime(task.finishedAt),
  },
] as unknown as DataTableColumns<CorpusImportTask>)

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/** 只有列表里存在排队中/处理中任务时才周期性刷新，全部进入终态即停（R10）。 */
function syncPolling() {
  if (activeImportCount(rows.value) === 0) {
    stopPolling()
    return
  }

  if (pollTimer !== null)
    return

  pollTimer = setInterval(() => {
    // 上一次请求还没回来就跳过这一轮，避免响应互相覆盖。
    if (!loading.value)
      load()
  }, POLL_INTERVAL)
}

/** 只为本会话见过「进行中」的任务提示完成摘要，历史任务不打扰 keeper（R12）。 */
function reportFinished() {
  const candidates: CorpusImportTask[] = []

  for (const task of rows.value) {
    if (isImportTaskActive(task.status))
      watchedIds.add(task.id)
    else if (watchedIds.has(task.id))
      candidates.push(task)
  }

  for (const task of newlyFinishedImports(candidates, notifiedIds)) {
    notifiedIds.add(task.id)
    message.success(t('corpus.importCompleted', importSummaryParams(task)))
    emit('finished', task)
  }
}

async function load() {
  const token = ++loadToken

  loading.value = true
  error.value = null

  try {
    const res = await fetchCorpusImports({
      page: page.value,
      limit: pageSize.value,
      sort: DEFAULT_SORT,
      ...(statusFilter.value ? { status: statusFilter.value } : {}),
    })

    if (token !== loadToken)
      return

    rows.value = res.result?.data ?? []
    total.value = res.result?.total ?? 0
    emit('update:activeCount', activeImportCount(rows.value))
    reportFinished()
    syncPolling()
  }
  catch (err) {
    if (token !== loadToken)
      return

    // 保留上一次成功的数据：刷新失败不应清空列表。
    error.value = err
    stopPolling()
  }
  finally {
    if (token === loadToken)
      loading.value = false
  }
}

function handleStatusChange() {
  page.value = 1
  load()
}

function handlePageChange(value: number) {
  page.value = value
  load()
}

function handlePageSizeChange(value: number) {
  pageSize.value = value
  page.value = 1
  load()
}

function openDetail(task: CorpusImportTask) {
  activeTask.value = task
  detailVisible.value = true
}

function rowProps(task: CorpusImportTask) {
  return {
    style: 'cursor: pointer;',
    onClick: () => openDetail(task),
  }
}

/** 上传成功后立刻把新任务纳入观察，即使它在下一次刷新前就跑完也会提示一次。 */
function handleCreated(task: CorpusImportTask | undefined) {
  if (task?.id) {
    watchedIds.add(task.id)
    page.value = 1
  }

  load()
}

onMounted(load)

onUnmounted(stopPolling)
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
      <NSelect
        v-model:value="statusFilter"
        class="max-w-[180px]"
        :options="statusOptions"
        @update:value="handleStatusChange"
      />
      <NTooltip trigger="hover">
        <template #trigger>
          <NButton size="small" type="primary" @click="uploadVisible = true">
            {{ t('corpus.importUpload') }}
          </NButton>
        </template>
        {{ t('corpus.importFormatHint') }}
      </NTooltip>
    </div>

    <NAlert v-if="error" class="mb-3" type="error">
      {{ errorTip(error, 'corpus.loadFailed') }}
      <template #action>
        <NButton size="small" @click="load">
          {{ t('corpus.retry') }}
        </NButton>
      </template>
    </NAlert>

    <div class="flex-1 overflow-hidden">
      <NDataTable
        class="h-full"
        :columns="columns"
        :data="rows"
        :loading="loading"
        :remote="true"
        :row-props="rowProps"
        :bordered="false"
        :scroll-x="1000"
        flex-height
      >
        <template #empty>
          <div class="py-10 text-center text-gray-400">
            {{ t('corpus.importEmpty') }}
          </div>
        </template>
      </NDataTable>
    </div>

    <div class="flex items-center justify-between mt-3">
      <span class="text-sm text-gray-500">{{ t('corpus.total', { total }) }}</span>
      <NPagination
        :page="page"
        :page-size="pageSize"
        :item-count="total"
        :page-sizes="[20, 50, 100]"
        show-size-picker
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </div>

    <ImportUploadModal v-model:show="uploadVisible" @created="handleCreated" />
    <ImportTaskDrawer v-model:show="detailVisible" :task="activeTask" />
  </div>
</template>
