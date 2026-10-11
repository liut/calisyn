<script setup lang='ts'>
import type { DataTableColumns, DataTableSortState } from 'naive-ui'
import type { MemorySortField, MemorySortOrder } from '../utils'
import type { MemoryMeta, MemoryTier } from '@/api/memory'
import { NAlert, NDataTable, NInput, NPagination, NSelect, NText } from 'naive-ui'
import { computed, onMounted, ref, watch } from 'vue'
import { fetchMemories } from '@/api/memory'
import { t } from '@/locales'
import {
  MEMORY_DEFAULT_SORT_FIELD,
  MEMORY_DEFAULT_SORT_ORDER,
  MEMORY_SORTABLE_FIELDS,
  MEMORY_TIERS,
  memoryErrorKey,
  memorySortParam,
  memoryTierOption,
} from '../utils'
import MemoryDrawer from './MemoryDrawer.vue'

const PLACEHOLDER = '—'
const keyword = ref('')
const submittedKeyword = ref('')
const tierFilter = ref<string>('all')
const pageSize = ref(20)
const page = ref(1)
const error = ref<unknown>(null)
const hasFilters = computed(() => Boolean(submittedKeyword.value) || tierFilter.value !== 'all')
const sortField = ref<MemorySortField>(MEMORY_DEFAULT_SORT_FIELD)
const sortOrder = ref<MemorySortOrder>(MEMORY_DEFAULT_SORT_ORDER)
const loading = ref(false)
const rows = ref<MemoryMeta[]>([])
const total = ref(0)

const drawerVisible = ref(false)
/** 抽屉按 id 取详情：列表行没有正文，避免翻页时把全部正文一并拉下来。 */
const activeMemoryId = ref<string | null>(null)

const tierOptions = computed(() => [
  { label: t('memory.tierAll'), value: 'all' },
  ...MEMORY_TIERS.map(value => ({ label: t(memoryTierOption(value).labelKey), value })),
])

function formatTime(value?: string | null) {
  if (!value)
    return PLACEHOLDER

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function formatImportance(score?: number) {
  if (typeof score !== 'number' || Number.isNaN(score))
    return PLACEHOLDER

  return score.toFixed(2)
}

function errorTip(err: unknown, fallbackKey: string) {
  return t(memoryErrorKey(err, fallbackKey))
}

function tierLabel(value: string) {
  const option = memoryTierOption(value)

  if (option.editable)
    return t(option.labelKey)

  // 未知分层原样展示（与 plan 一致），避免被静默改写。
  return t(option.labelKey, { tier: value || PLACEHOLDER })
}

async function fetchPage(): Promise<{ rows: MemoryMeta[], total: number }> {
  const params: Parameters<typeof fetchMemories>[0] = {
    page: page.value,
    limit: pageSize.value,
    // 关键词筛选与排序可以组合（不同于语料的向量 match），排序始终带上。
    sort: memorySortParam(sortField.value, sortOrder.value),
  }

  if (submittedKeyword.value)
    params.key = submittedKeyword.value

  if (tierFilter.value !== 'all')
    params.tier = tierFilter.value as MemoryTier

  const res = await fetchMemories(params)

  return {
    rows: res.result?.data ?? [],
    total: res.result?.total ?? 0,
  }
}

// 递增的请求序号：搜索、筛选、翻页与排序切换可能让多个 load 同时在飞，
// 只接受最后一次发起的请求结果，避免旧响应覆盖新数据。
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

// 保存/删除后重载当前页；若当前页已被清空则回退一页。
async function reloadAfterMutation() {
  await load()

  if (!loading.value && rows.value.length === 0 && total.value > 0 && page.value > 1) {
    page.value -= 1
    await load()
  }
}

function sortOrderFor(field: MemorySortField) {
  return sortField.value === field ? sortOrder.value : false
}

function openDrawer(memory: MemoryMeta) {
  activeMemoryId.value = memory.id
  drawerVisible.value = true
}

const columns = computed<DataTableColumns<MemoryMeta>>(() => [
  {
    key: 'key',
    title: t('memory.columnKey'),
    minWidth: 160,
    ellipsis: { tooltip: true },
    sorter: 'default',
    sortOrder: sortOrderFor('key'),
    render: row => row.key,
  },
  {
    key: 'cate',
    title: t('memory.columnCate'),
    minWidth: 140,
    ellipsis: { tooltip: true },
    render: row => row.cate || PLACEHOLDER,
  },
  {
    key: 'tier',
    title: t('memory.columnTier'),
    width: 130,
    render: row => tierLabel(row.tier),
  },
  {
    key: 'importance',
    title: t('memory.columnImportance'),
    width: 110,
    render: row => formatImportance(row.importanceScore),
  },
  {
    key: 'lastAccessed',
    title: t('memory.columnLastAccessed'),
    width: 190,
    render: row => formatTime(row.lastAccessedAt),
  },
  {
    key: 'updated',
    title: t('memory.columnUpdatedAt'),
    width: 190,
    sorter: 'default',
    sortOrder: sortOrderFor('updated'),
    render: row => formatTime(row.updatedAt),
  },
  {
    key: 'created',
    title: t('memory.columnCreatedAt'),
    width: 190,
    sorter: 'default',
    sortOrder: sortOrderFor('created'),
    render: row => formatTime(row.createdAt),
  },
])

function handleSorterChange(sorter: DataTableSortState | DataTableSortState[] | null) {
  const state = Array.isArray(sorter) ? sorter[0] : sorter
  const field = state?.columnKey as MemorySortField | undefined

  if (state?.order && field && MEMORY_SORTABLE_FIELDS.includes(field)) {
    sortField.value = field
    sortOrder.value = state.order
  }
  else {
    // 清除排序（点回默认态）时回到服务端缺省口径。
    sortField.value = MEMORY_DEFAULT_SORT_FIELD
    sortOrder.value = MEMORY_DEFAULT_SORT_ORDER
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

// 关键词搜索是前缀匹配，一次请求即完成，不在输入过程中触发。
function handleSearch() {
  submittedKeyword.value = keyword.value.trim()
  page.value = 1
  load()
}

// 回车提交；输入法正在组词（确认候选词）时不触发。
function handleEnterSearch(event: KeyboardEvent) {
  if (event.isComposing)
    return

  handleSearch()
}

function handleTierChange() {
  page.value = 1
  load()
}

watch(keyword, (value) => {
  // 清空输入是明确的「回到全量列表」意图，立即生效；其余情况等回车或点搜索。
  if (value.trim() === '')
    handleSearch()
})

function rowProps(row: MemoryMeta) {
  return {
    style: 'cursor: pointer;',
    onClick: () => openDrawer(row),
  }
}

onMounted(load)
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
      <!-- 搜索框与分层筛选始终同一行：搜索框弹性伸缩，下拉固定宽度。 -->
      <div class="flex items-center gap-3 min-w-0">
        <div class="flex-1 min-w-0 max-w-[360px]">
          <NInput
            v-model:value="keyword"
            size="small"
            :placeholder="t('memory.searchPlaceholder')"
            clearable
            @keyup.enter="handleEnterSearch"
            @clear="handleSearch"
          >
            <template #suffix>
              <span class="cursor-pointer text-gray-400 hover:text-gray-600" @click="handleSearch">
                {{ t('memory.search') }}
              </span>
            </template>
          </NInput>
        </div>

        <div class="w-[160px] shrink-0">
          <NSelect
            v-model:value="tierFilter"
            size="small"
            :options="tierOptions"
            @update:value="handleTierChange"
          />
        </div>
      </div>
    </div>

    <!-- 加载失败用错误条 + 重试而不是空态，避免把「取数失败」读成「没有记忆」。 -->
    <NAlert v-if="error" class="mb-3" type="error">
      {{ errorTip(error, 'memory.loadFailed') }}
      <template #action>
        <NText depth="3" class="cursor-pointer text-sm" @click="load">
          {{ t('memory.retry') }}
        </NText>
      </template>
    </NAlert>

    <div class="flex-1 overflow-hidden">
      <NDataTable
        class="h-full"
        :columns="columns"
        :data="rows"
        :loading="loading"
        :remote="true"
        :row-key="row => row.id"
        :row-props="rowProps"
        :bordered="false"
        :scroll-x="1080"
        flex-height
        @update:sorter="handleSorterChange"
      >
        <template #empty>
          <!-- 加载失败时上面已有错误条与重试：此时不能宣称「还没有记忆」，
               否则用户会把「取数失败」误读成「记忆表确实是空的」。 -->
          <div v-if="error" />
          <div v-else-if="hasFilters" class="py-10 text-center text-gray-400">
            {{ t('memory.empty') }}
          </div>
          <div v-else class="flex flex-col items-center gap-3 py-10">
            <NText class="text-base">
              {{ t('memory.emptyTitle') }}
            </NText>
            <NText depth="3" class="max-w-[520px] text-xs text-center">
              {{ t('memory.emptyHint') }}
            </NText>
          </div>
        </template>
      </NDataTable>
    </div>

    <div class="flex items-center justify-between mt-3">
      <span class="text-sm text-gray-500">{{ t('memory.total', { total }) }}</span>
      <NPagination
        :page="page"
        :page-size="pageSize"
        :page-sizes="[10, 20, 50]"
        show-size-picker
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </div>

    <MemoryDrawer
      v-model:show="drawerVisible"
      :memory-id="activeMemoryId"
      @saved="reloadAfterMutation"
      @deleted="reloadAfterMutation"
    />
  </div>
</template>
