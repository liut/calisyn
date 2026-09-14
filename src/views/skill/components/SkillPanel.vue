<script setup lang='ts'>
import type { DataTableColumns, DataTableSortState } from 'naive-ui'
import type { SkillSortField, SkillSortOrder } from '../utils'
import type { SkillMeta, SkillQueryParams } from '@/api/skill'
import { NAlert, NButton, NDataTable, NInput, NPagination, NSelect, NSpace, NText, NTooltip, useDialog, useMessage } from 'naive-ui'
import { computed, h, onMounted, ref, watch } from 'vue'
import { deleteSkill, fetchSkills } from '@/api/skill'
import { SvgIcon } from '@/components/common'
import { t } from '@/locales'
import { useUserStore } from '@/store'
import {
  channelOption,
  isOwnSkill,
  SKILL_DEFAULT_SORT_FIELD,
  SKILL_DEFAULT_SORT_ORDER,
  SKILL_SORTABLE_FIELDS,
  skillErrorKey,
  skillMetaOwner,
  skillSortParam,
} from '../utils'
import SkillCreateModal from './SkillCreateModal.vue'
import SkillDrawer from './SkillDrawer.vue'

type OwnerFilter = 'all' | 'mine'

const dialog = useDialog()
const message = useMessage()
const userStore = useUserStore()

const keyword = ref('')
const submittedKeyword = ref('')
const ownerFilter = ref<OwnerFilter>('all')
const page = ref(1)
const pageSize = ref(20)
const sortField = ref<SkillSortField>(SKILL_DEFAULT_SORT_FIELD)
const sortOrder = ref<SkillSortOrder>(SKILL_DEFAULT_SORT_ORDER)
const loading = ref(false)
const error = ref<unknown>(null)
const rows = ref<SkillMeta[]>([])
const total = ref(0)

const createVisible = ref(false)
const drawerVisible = ref(false)
/** 抽屉只按名取详情：列表行没有正文，资源文件清单也只有详情接口有。 */
const activeSkillName = ref<string | null>(null)
const deletingName = ref<string | null>(null)

// 归属判定与「我创建的」筛选都依赖会话里的 oid。缺失时不退化成本地过滤，
// 而是禁用该项并隐藏写入口——避免给出注定 403 的入口。
const oid = computed(() => userStore.userInfo.oid ?? '')
const ownerFilterDisabled = computed(() => !oid.value)
const hasFilters = computed(() => Boolean(submittedKeyword.value) || ownerFilter.value === 'mine')

const ownerOptions = computed(() => [
  { label: t('skill.filterAll'), value: 'all' },
  { label: t('skill.filterMine'), value: 'mine', disabled: ownerFilterDisabled.value },
])

function formatTime(value?: string | null) {
  if (!value)
    return '—'

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function errorTip(err: unknown, fallbackKey: string) {
  return t(skillErrorKey(err, fallbackKey))
}

function channelLabel(channel: string) {
  const option = channelOption(channel)

  return option.editable ? t(option.labelKey) : t(option.labelKey, { channel })
}

async function fetchPage(): Promise<{ rows: SkillMeta[], total: number }> {
  const params: SkillQueryParams = {
    page: page.value,
    limit: pageSize.value,
    // 名称匹配与排序可以组合（不同于语料的向量 match），所以排序参数始终带上。
    sort: skillSortParam(sortField.value, sortOrder.value),
  }

  if (submittedKeyword.value)
    params.name = submittedKeyword.value

  // 归属筛选走服务端：前端过滤当前页会让分页与总数都不对。
  if (ownerFilter.value === 'mine' && oid.value)
    params.owner = oid.value

  const res = await fetchSkills(params)

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

function sortOrderFor(field: SkillSortField) {
  return sortField.value === field ? sortOrder.value : false
}

function openDrawer(skill: SkillMeta) {
  activeSkillName.value = skill.name
  drawerVisible.value = true
}

function handleDelete(skill: SkillMeta) {
  // 已有删除在进行/待确认时不再开第二个确认框，避免重复 DELETE。
  if (deletingName.value)
    return

  dialog.warning({
    title: t('skill.deleteConfirmTitle'),
    content: t('skill.deleteConfirmContent', { name: skill.name }),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: async () => {
      if (deletingName.value)
        return

      deletingName.value = skill.name

      try {
        await deleteSkill(skill.name)
        message.success(t('common.deleteSuccess'))
        await reloadAfterMutation()
      }
      catch (err) {
        message.error(errorTip(err, 'skill.deleteFailed'))
      }
      finally {
        deletingName.value = null
      }
    },
  })
}

function actionColumn(): DataTableColumns<SkillMeta>[number] {
  // 本仓库安装了两份 @vue/runtime-core 类型，naive-ui 的 VNodeChild 与本地 h() 推断出的
  // VNode 互不兼容（DocumentPanel 已有同类处理），这里对整列定义做一次断言。
  const column = {
    key: 'action',
    title: t('common.action'),
    width: 160,
    render: (row: SkillMeta) => {
      // 只有自己创建的技能才有写入口：他人投放的技能只读，不给注定 403 的按钮（R3/AE2）。
      if (!isOwnSkill(row.owner, oid.value))
        return null

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

  return column as unknown as DataTableColumns<SkillMeta>[number]
}

const columns = computed<DataTableColumns<SkillMeta>>(() => {
  const result: DataTableColumns<SkillMeta> = [
    {
      key: 'name',
      title: t('skill.columnName'),
      // 只给最小宽度：容器变宽时由 NDataTable 自适应分配，名字本身通常很短。
      minWidth: 80,
      ellipsis: { tooltip: true },
    },
    {
      key: 'description',
      title: t('skill.columnDescription'),
      // 描述是最需要横向空间的一列，最小宽度给得比名字宽得多。
      minWidth: 340,
      ellipsis: { tooltip: true },
    },
    {
      key: 'channel',
      title: t('skill.columnChannel'),
      width: 140,
      render: row => channelLabel(row.channel),
    },
    {
      key: 'created',
      title: t('skill.createdAt'),
      width: 190,
      sorter: 'default',
      sortOrder: sortOrderFor('created'),
      render: row => formatTime(row.createdAt),
    },
    {
      key: 'updated',
      title: t('skill.updatedAt'),
      width: 190,
      sorter: 'default',
      sortOrder: sortOrderFor('updated'),
      render: row => formatTime(row.updatedAt),
    },
    {
      key: 'owner',
      title: t('skill.columnOwner'),
      width: 120,
      render: (row) => {
        const mine = isOwnSkill(row.owner, oid.value)
        const metaOwner = skillMetaOwner(row.meta)
        const label = mine ? t('skill.ownerMine') : t('skill.ownerOthers')

        // 归属标记压成一行：emoji 代替文字标签（列窄），全称与记录级 meta.owner 放 title。
        return h('div', {
          class: 'flex items-center gap-1 min-w-0',
          title: metaOwner ? `${label} · ${metaOwner}` : label,
        }, [
          h('span', { class: 'text-base leading-none' }, mine ? '👤' : '👥'),
          metaOwner ? h('span', { class: 'text-xs truncate text-gray-500' }, metaOwner) : null,
        ])
      },
    },
  ]

  // oid 缺失时归属判定恒为 false，写入口一律不渲染（详情抽屉仍可读）。
  if (oid.value)
    result.push(actionColumn())

  return result
})

function handleSorterChange(sorter: DataTableSortState | DataTableSortState[] | null) {
  const state = Array.isArray(sorter) ? sorter[0] : sorter
  const field = state?.columnKey as SkillSortField | undefined

  if (state?.order && field && SKILL_SORTABLE_FIELDS.includes(field)) {
    sortField.value = field
    sortOrder.value = state.order
  }
  else {
    // 清除排序（点回默认态）时回到服务端缺省口径。
    sortField.value = SKILL_DEFAULT_SORT_FIELD
    sortOrder.value = SKILL_DEFAULT_SORT_ORDER
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

// 名称搜索是前缀匹配，一次请求即完成，因此不在输入过程中触发。
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

function handleOwnerChange() {
  page.value = 1
  load()
}

watch(keyword, (value) => {
  // 清空输入是明确的“回到全量列表”意图，立即生效；其余情况等回车或点搜索。
  if (value.trim() === '')
    handleSearch()
})

// 创建成功后回到第 1 页重载并直接打开详情（R12）。抽屉自己按名拉详情，
// 所以即使新技能被当前搜索/筛选挡住、不在首页，也照样能打开。
async function handleCreated(name: string) {
  page.value = 1
  await load()

  activeSkillName.value = name
  drawerVisible.value = true
}

function rowProps(row: SkillMeta) {
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
      <!-- 搜索框与归属筛选始终同一行：搜索框弹性伸缩，下拉固定宽度，
           窗口变窄时让「新建技能」换行，而不是把这两件拆开。 -->
      <div class="flex items-center gap-3 min-w-0">
        <div class="flex-1 min-w-0 max-w-[360px]">
          <NInput
            v-model:value="keyword"
            clearable
            :placeholder="t('skill.searchPlaceholder')"
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
                {{ t('skill.search') }}
              </NTooltip>
            </template>
          </NInput>
        </div>

        <div class="w-[180px] shrink-0">
          <NSelect
            v-model:value="ownerFilter"
            :options="ownerOptions"
            @update:value="handleOwnerChange"
          />
        </div>
      </div>

      <NButton class="shrink-0" size="small" type="primary" @click="createVisible = true">
        {{ t('skill.create') }}
      </NButton>
    </div>

    <NText v-if="ownerFilterDisabled" depth="3" class="block mb-3 text-xs">
      {{ t('skill.oidMissing') }}
    </NText>

    <NAlert v-if="error" class="mb-3" type="error">
      {{ errorTip(error, 'skill.loadFailed') }}
      <template #action>
        <NButton size="small" @click="load">
          {{ t('skill.retry') }}
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
        :scroll-x="1220"
        flex-height
        @update:sorter="handleSorterChange"
      >
        <template #empty>
          <!-- 加载失败时上面已有错误条与重试：此时不能宣称「还没有技能」，
               否则用户会把「取数失败」误读成「技能表确实是空的」并去点新建。 -->
          <div v-if="error" />
          <div v-else-if="hasFilters" class="py-10 text-center text-gray-400">
            {{ t('skill.empty') }}
          </div>
          <div v-else class="flex flex-col items-center gap-3 py-10">
            <NText class="text-base">
              {{ t('skill.emptyTitle') }}
            </NText>
            <NText depth="3" class="max-w-[520px] text-xs text-center">
              {{ t('skill.emptyHint') }}
            </NText>
            <NButton size="small" type="primary" @click="createVisible = true">
              {{ t('skill.create') }}
            </NButton>
          </div>
        </template>
      </NDataTable>
    </div>

    <div class="flex items-center justify-between mt-3">
      <span class="text-sm text-gray-500">{{ t('skill.total', { total }) }}</span>
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

    <SkillCreateModal v-model:show="createVisible" @created="handleCreated" />
    <SkillDrawer
      v-model:show="drawerVisible"
      :skill-name="activeSkillName"
      @saved="reloadAfterMutation"
      @deleted="reloadAfterMutation"
    />
  </div>
</template>
