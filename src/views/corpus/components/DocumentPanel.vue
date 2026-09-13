<script setup lang='ts'>
import type { DataTableColumns, DataTableSortState } from 'naive-ui'
import type { CorpusSortField, CorpusSortOrder, PagedResult } from '../utils'
import type { CorpusDocument, CorpusQueryParams } from '@/api/corpus'
import { NAlert, NButton, NDataTable, NInput, NPagination, NSpace, NTooltip, useDialog, useMessage } from 'naive-ui'
import { computed, h, onMounted, ref, watch } from 'vue'
import { deleteCorpusDocument, fetchCorpusDocuments } from '@/api/corpus'
import { SvgIcon } from '@/components/common'
import { t } from '@/locales'
import { useAuthStore } from '@/store'
import { corpusErrorKey } from '../utils'
import DocumentDrawer from './DocumentDrawer.vue'

const props = withDefaults(defineProps<{
  /** 容器递增该值即触发一次刷新：导入任务进入终态后切回文档视图时使用（R18）。 */
  refreshToken?: number
}>(), {
  refreshToken: 0,
})

const DEFAULT_SORT_FIELD: CorpusSortField = 'updated'
const DEFAULT_SORT_ORDER: CorpusSortOrder = 'descend'
const SORTABLE_FIELDS: CorpusSortField[] = ['updated', 'created', 'heading']

const authStore = useAuthStore()
const dialog = useDialog()
const message = useMessage()

const keyword = ref('')
const submittedKeyword = ref('')
const page = ref(1)
const pageSize = ref(20)
const sortField = ref<CorpusSortField>(DEFAULT_SORT_FIELD)
const sortOrder = ref<CorpusSortOrder>(DEFAULT_SORT_ORDER)
/** 用户是否显式点过列头排序：默认为 false，此时搜索请求可以省略 sort。 */
const sortExplicit = ref(false)
const loading = ref(false)
const error = ref<unknown>(null)
const rows = ref<CorpusDocument[]>([])
const total = ref(0)

const drawerVisible = ref(false)
const activeDocument = ref<CorpusDocument | null>(null)
const deletingId = ref<string | null>(null)

const sortParam = computed(() => `${sortOrder.value === 'descend' ? '-' : ''}${sortField.value}`)

function formatTime(value?: string | null) {
  if (!value)
    return '—'

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function errorTip(err: unknown, fallbackKey: string) {
  return t(corpusErrorKey(err) ?? fallbackKey)
}

async function fetchPage(): Promise<PagedResult<CorpusDocument>> {
  const params: CorpusQueryParams = {
    page: page.value,
    limit: pageSize.value,
  }

  // morrigan 的 match 参数走向量（语义）匹配，单次请求即可。
  // 传了 match 时后端暂不支持与 sort 组合：默认排序省略 sort，只有用户显式指定排序字段才带上。
  if (submittedKeyword.value) {
    params.match = submittedKeyword.value

    if (sortExplicit.value)
      params.sort = sortParam.value
  }
  else {
    params.sort = sortParam.value
  }

  const res = await fetchCorpusDocuments(params)

  return {
    rows: res.result?.data ?? [],
    total: res.result?.total ?? 0,
  }
}

/**
 * 递增的请求序号：搜索防抖、翻页、排序切换可能让多个 load 同时在飞，
 * 只接受最后一次发起的请求结果，避免旧响应覆盖新数据。
 */
let loadToken = 0

async function load() {
  const token = ++loadToken

  loading.value = true
  error.value = null

  try {
    const result = await fetchPage()

    if (token !== loadToken)
      return

    rows.value = result.rows
    total.value = result.total
  }
  catch (err) {
    if (token !== loadToken)
      return

    // 保留上一次成功的数据：刷新失败（例如删除后的重载失败）不应清空列表。
    error.value = err
  }
  finally {
    if (token === loadToken)
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
  // 已有删除在进行/待确认时不再开第二个确认框，避免重复 DELETE。
  if (deletingId.value)
    return

  dialog.warning({
    title: t('corpus.deleteConfirmTitle'),
    content: t('corpus.deleteConfirmContent'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: async () => {
      if (deletingId.value)
        return

      deletingId.value = document.id

      try {
        await deleteCorpusDocument(document.id)
        message.success(t('common.deleteSuccess'))
        await reloadAfterMutation()
      }
      catch (err) {
        message.error(errorTip(err, 'corpus.deleteFailed'))
      }
      finally {
        deletingId.value = null
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
      render: row => formatTime(row.updatedAt),
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
    sortExplicit.value = true
  }
  else {
    sortField.value = DEFAULT_SORT_FIELD
    sortOrder.value = DEFAULT_SORT_ORDER
    sortExplicit.value = false
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

/** 关键词搜索走向量匹配，一次请求要服务端做一次 embedding，因此不在输入过程中触发。 */
function handleSearch() {
  submittedKeyword.value = keyword.value.trim()
  page.value = 1
  load()
}

/** 回车提交；输入法正在组词（确认候选词）时不触发。 */
function handleEnterSearch(event: KeyboardEvent) {
  if (event.isComposing)
    return

  handleSearch()
}

watch(keyword, (value) => {
  // 清空输入是明确的“回到全量列表”意图，立即生效；其余情况等回车或点搜索。
  if (value.trim() === '')
    handleSearch()
})

// 导入任务进入终态后切回文档视图：重拉列表并回到第一页，确保新导入的文档可见（R18）。
watch(() => props.refreshToken, () => {
  page.value = 1
  load()
})

onMounted(load)
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex flex-wrap items-center gap-4 mb-3">
      <NInput
        v-model:value="keyword"
        class="max-w-[320px]"
        clearable
        :placeholder="t('corpus.searchPlaceholder')"
        @keydown.enter="handleEnterSearch"
      >
        <template #prefix>
          <NTooltip trigger="hover">
            <template #trigger>
              <span
                class="text-base text-[#4f555e] cursor-pointer dark:text-white hover:text-[#4b9e5f]"
                @click="handleSearch"
              >
                <SvgIcon icon="ri:search-line" />
              </span>
            </template>
            {{ t('corpus.search') }}
          </NTooltip>
        </template>
      </NInput>
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

    <DocumentDrawer
      v-model:show="drawerVisible"
      :doc="activeDocument"
      @saved="reloadAfterMutation"
      @deleted="reloadAfterMutation"
    />
  </div>
</template>
