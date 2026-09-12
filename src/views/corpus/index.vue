<script setup lang='ts'>
import type { DataTableColumns, DataTableSortState } from 'naive-ui'
import type { CorpusSortField, CorpusSortOrder } from './utils'
import type { CorpusDocument } from '@/api/corpus'
import { NAlert, NButton, NDataTable, NInput, NPagination, NSpace, NTooltip, useDialog, useMessage } from 'naive-ui'
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { deleteCorpusDocument, fetchCorpusDocuments } from '@/api/corpus'
import { t } from '@/locales'
import { useAuthStore } from '@/store'
import DocumentDrawer from './components/DocumentDrawer.vue'
import { corpusErrorKey, mergeCorpusSearch, paginate, sortCorpusDocuments } from './utils'

/** 三路关键词查询各自的上限（morrigan 不支持跨字段 OR 搜索）。 */
const SEARCH_LIMIT = 200

const DEFAULT_SORT_FIELD: CorpusSortField = 'updated'
const DEFAULT_SORT_ORDER: CorpusSortOrder = 'descend'
const SORTABLE_FIELDS: CorpusSortField[] = ['updated', 'created', 'heading']

const authStore = useAuthStore()
const dialog = useDialog()
const message = useMessage()

const keyword = ref('')
const page = ref(1)
const pageSize = ref(20)
const sortField = ref<CorpusSortField>(DEFAULT_SORT_FIELD)
const sortOrder = ref<CorpusSortOrder>(DEFAULT_SORT_ORDER)
const loading = ref(false)
const error = ref<unknown>(null)
const rows = ref<CorpusDocument[]>([])
const total = ref(0)

const drawerVisible = ref(false)
const activeDocument = ref<CorpusDocument | null>(null)

const sortParam = computed(() => `${sortOrder.value === 'descend' ? '-' : ''}${sortField.value}`)

function formatTime(value?: string) {
  if (!value)
    return '—'

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function errorTip(err: unknown, fallbackKey: string) {
  return t(corpusErrorKey(err) ?? fallbackKey)
}

async function loadServerPage() {
  const res = await fetchCorpusDocuments({
    page: page.value,
    limit: pageSize.value,
    sort: sortParam.value,
  })

  rows.value = res.result?.data ?? []
  total.value = res.result?.total ?? 0
}

async function loadSearchResults(query: string) {
  // 后端三个字段过滤是 AND 且只做前缀匹配，因此并行三路查询后在前端合并去重。
  const [titleRes, headingRes, contentRes] = await Promise.all([
    fetchCorpusDocuments({ title: query, limit: SEARCH_LIMIT }),
    fetchCorpusDocuments({ heading: query, limit: SEARCH_LIMIT }),
    fetchCorpusDocuments({ content: query, limit: SEARCH_LIMIT }),
  ])

  const merged = mergeCorpusSearch([
    titleRes.result?.data ?? [],
    headingRes.result?.data ?? [],
    contentRes.result?.data ?? [],
  ])
  const sorted = sortCorpusDocuments(merged, sortField.value, sortOrder.value)
  const paged = paginate(sorted, page.value, pageSize.value)

  rows.value = paged.rows
  total.value = paged.total
}

async function load() {
  loading.value = true
  error.value = null

  try {
    const query = keyword.value.trim()

    if (query)
      await loadSearchResults(query)
    else
      await loadServerPage()
  }
  catch (err) {
    error.value = err
    rows.value = []
    total.value = 0
  }
  finally {
    loading.value = false
  }
}

/** 保存/删除后重载当前页；若当前页已被清空则回退一页。 */
async function reloadAfterMutation() {
  await load()

  if (!loading.value && rows.value.length === 0 && total.value > 0 && page.value > 1) {
    page.value -= 1
    await load()
  }
}

function sortOrderFor(field: CorpusSortField) {
  return sortField.value === field ? sortOrder.value : false
}

function openDrawer(document: CorpusDocument) {
  activeDocument.value = document
  drawerVisible.value = true
}

function handleDelete(document: CorpusDocument) {
  dialog.warning({
    title: t('corpus.deleteConfirmTitle'),
    content: t('corpus.deleteConfirmContent'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: async () => {
      try {
        await deleteCorpusDocument(document.id)
        message.success(t('common.deleteSuccess'))
        await reloadAfterMutation()
      }
      catch (err) {
        message.error(errorTip(err, 'corpus.deleteFailed'))
      }
    },
  })
}

function actionColumn(): DataTableColumns<CorpusDocument>[number] {
  // 本仓库安装了两份 @vue/runtime-core 类型，naive-ui 的 VNodeChild 与本地 h() 推断出的
  // VNode 互不兼容（PromptStore 已有同类报错），这里对整列定义做一次断言。
  const column = {
    key: 'action',
    title: t('common.action'),
    width: 160,
    render: (row: CorpusDocument) => {
      return h(NSpace, { justify: 'end' }, {
        default: () => [
          h(NButton, {
            size: 'small',
            tertiary: true,
            type: 'info',
            onClick: (event: MouseEvent) => {
              event.stopPropagation()
              openDrawer(row)
            },
          }, { default: () => t('common.edit') }),
          h(NButton, {
            size: 'small',
            tertiary: true,
            type: 'error',
            onClick: (event: MouseEvent) => {
              event.stopPropagation()
              handleDelete(row)
            },
          }, { default: () => t('common.delete') }),
        ],
      })
    },
  }

  return column as unknown as DataTableColumns<CorpusDocument>[number]
}

const columns = computed<DataTableColumns<CorpusDocument>>(() => {
  const result: DataTableColumns<CorpusDocument> = [
    {
      key: 'title',
      title: t('corpus.columnTitle'),
      minWidth: 180,
      ellipsis: { tooltip: true },
    },
    {
      key: 'heading',
      title: t('corpus.columnHeading'),
      minWidth: 160,
      ellipsis: { tooltip: true },
      sorter: 'default',
      sortOrder: sortOrderFor('heading'),
    },
    {
      key: 'content',
      title: t('corpus.columnContent'),
      minWidth: 240,
      ellipsis: { tooltip: true },
    },
    {
      key: 'created',
      title: t('corpus.createdAt'),
      width: 190,
      sorter: 'default',
      sortOrder: sortOrderFor('created'),
      render: row => formatTime(row.createdAt),
    },
    {
      key: 'updated',
      title: t('corpus.columnUpdatedAt'),
      width: 190,
      sorter: 'default',
      sortOrder: sortOrderFor('updated'),
      render: row => formatTime(row.updatedAt ?? row.createdAt),
    },
  ]

  if (authStore.isKeeper)
    result.push(actionColumn())

  return result
})

function handleSorterChange(sorter: DataTableSortState | DataTableSortState[] | null) {
  const state = Array.isArray(sorter) ? sorter[0] : sorter
  const field = state?.columnKey as CorpusSortField | undefined

  if (state?.order && field && SORTABLE_FIELDS.includes(field)) {
    sortField.value = field
    sortOrder.value = state.order
  }
  else {
    sortField.value = DEFAULT_SORT_FIELD
    sortOrder.value = DEFAULT_SORT_ORDER
  }

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

function rowProps(row: CorpusDocument) {
  return {
    style: 'cursor: pointer;',
    onClick: () => openDrawer(row),
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined

watch(keyword, () => {
  if (searchTimer)
    clearTimeout(searchTimer)

  searchTimer = setTimeout(() => {
    page.value = 1
    load()
  }, 300)
})

onMounted(load)

onUnmounted(() => {
  if (searchTimer)
    clearTimeout(searchTimer)
})
</script>

<template>
  <div class="flex flex-col h-full p-4 overflow-hidden md:p-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-medium">
        {{ t('corpus.title') }}
      </h2>
      <NTooltip trigger="hover">
        <template #trigger>
          <div class="inline-flex">
            <NButton size="small" disabled>
              {{ t('corpus.import') }}
            </NButton>
          </div>
        </template>
        {{ t('corpus.importDisabled') }}
      </NTooltip>
    </div>

    <div class="flex flex-wrap items-center gap-4 mb-3">
      <NInput
        v-model:value="keyword"
        class="max-w-[320px]"
        clearable
        :placeholder="t('corpus.searchPlaceholder')"
      />
      <span class="text-sm text-gray-500">{{ t('corpus.total', { total }) }}</span>
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
        @update:sorter="handleSorterChange"
      >
        <template #empty>
          <div class="py-10 text-center text-gray-400">
            {{ t('corpus.empty') }}
          </div>
        </template>
      </NDataTable>
    </div>

    <div class="flex justify-end mt-3">
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

    <DocumentDrawer
      v-model:show="drawerVisible"
      :doc="activeDocument"
      @saved="reloadAfterMutation"
      @deleted="reloadAfterMutation"
    />
  </div>
</template>
