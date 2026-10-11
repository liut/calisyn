<script setup lang='ts'>
import type { MemoryEditForm } from '../utils'
import type { MemoryDetail } from '@/api/memory'
import {
  NAlert,
  NButton,
  NDrawer,
  NDrawerContent,
  NInput,
  NSelect,
  NSpin,
  NText,
  useDialog,
  useMessage,
} from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { deleteMemory, fetchMemory, updateMemory } from '@/api/memory'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import {
  buildMemoryPatch,
  emptyMemoryForm,
  isNotFoundError,
  MEMORY_TIERS,
  memoryErrorKey,
  memoryTierOption,
} from '../utils'

const props = defineProps<{
  show: boolean
  /** 按 id 拉详情：列表行没有正文，避免翻页时把全部正文一并拉下来。 */
  memoryId: string | null
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'saved', id: string): void
  (e: 'deleted', id: string): void
}>()

const PLACEHOLDER = '—'

const dialog = useDialog()
const message = useMessage()
const { isMobile } = useBasicLayout()

const detail = ref<MemoryDetail | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const saving = ref(false)
const deleting = ref(false)

/** 编辑态：分类、正文、分层；分层在「不可编辑」分支下不参与 patch。 */
const form = ref<MemoryEditForm>(emptyMemoryForm())

const width = computed(() => (isMobile.value ? '100%' : 760))
const title = computed(() => detail.value?.key || t('memory.detailTitle'))
const tierOption = computed(() => memoryTierOption(detail.value?.tier))
/** 加载中与加载失败都要有明确状态；`result` 缺失也按失败处理，避免抽屉空白。 */
const failed = computed(() => Boolean(error.value) || (!loading.value && !detail.value))
const errorText = computed(() => isNotFoundError(error.value) ? t('memory.notFound') : t(memoryErrorKey(error.value, 'memory.detailFailed')))

/** 当前编辑是否真正改动：未改动时禁用保存按钮。 */
const patch = computed(() => buildMemoryPatch(detail.value, form.value))
const canSave = computed(() => Object.keys(patch.value).length > 0)

const tierSelectOptions = computed(() => MEMORY_TIERS.map(value => ({
  value,
  label: t(memoryTierOption(value).labelKey),
})))

function formatTime(value?: string | null) {
  if (!value)
    return PLACEHOLDER

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function formatNumber(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value))
    return PLACEHOLDER

  return value.toFixed(2)
}

function formatAccessCount(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value))
    return PLACEHOLDER

  return value.toString()
}

function applyDetail(value: MemoryDetail | null) {
  detail.value = value

  if (!value) {
    form.value = emptyMemoryForm()
    return
  }

  form.value = {
    cate: value.cate ?? '',
    content: value.content ?? '',
    tier: value.tier ?? '',
  }
}

/** 递增序号：关闭或切换条目时丢弃在飞的响应，避免旧数据回填。 */
let loadToken = 0

function reset() {
  loadToken++
  detail.value = null
  error.value = null
  loading.value = false
  saving.value = false
  deleting.value = false
  applyDetail(null)
}

async function load() {
  const id = props.memoryId

  if (!id)
    return

  const token = ++loadToken

  loading.value = true
  error.value = null

  try {
    const res = await fetchMemory(id)

    if (token !== loadToken)
      return

    applyDetail(res.result ?? null)
  }
  catch (err) {
    if (token !== loadToken)
      return

    if (isNotFoundError(err)) {
      // 404（条目已在别处删除）：把「列表里这一行已无效」的事实告诉面板，让它走
      // 删除后的同一条重载路径（去掉陈旧行 + 必要时回退一页）。提示语里的
      // 「列表将自动刷新」由这一行兑现。
      emit('deleted', id)
    }

    error.value = err
  }
  finally {
    if (token === loadToken)
      loading.value = false
  }
}

watch(() => [props.show, props.memoryId] as const, ([visible]) => {
  // 关闭或切换条目时清空本地状态，重开不会残留上一次的编辑内容。
  reset()

  if (visible)
    load()
}, { immediate: true })

function close() {
  emit('update:show', false)
}

async function handleSave() {
  const memory = detail.value

  if (!memory || saving.value || !canSave.value)
    return

  saving.value = true

  try {
    await updateMemory(memory.id, patch.value)
    message.success(t('common.saveSuccess'))
    // 保存成功才通知面板刷新；失败时保留本地编辑内容，不关闭抽屉。
    emit('saved', memory.id)
    close()
  }
  catch (err) {
    message.error(t(memoryErrorKey(err, 'memory.saveFailed')))
  }
  finally {
    saving.value = false
  }
}

function handleDelete() {
  const memory = detail.value

  if (!memory || deleting.value)
    return

  dialog.warning({
    title: t('memory.deleteConfirmTitle'),
    content: t('memory.deleteConfirmContent', { key: memory.key }),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: async () => {
      // 二次确认期间可能已有另一次删除在跑，不再发第二个 DELETE。
      if (deleting.value)
        return

      deleting.value = true

      try {
        await deleteMemory(memory.id)
        message.success(t('common.deleteSuccess'))
        emit('deleted', memory.id)
        close()
      }
      catch (err) {
        message.error(t(memoryErrorKey(err, 'memory.deleteFailed')))
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
      <div class="flex flex-col h-full min-h-0">
        <div v-if="loading && !detail" class="flex items-center justify-center py-10">
          <NSpin size="small" />
        </div>

        <NAlert v-else-if="failed" type="error">
          {{ errorText }}
        </NAlert>

        <div v-else-if="detail" class="flex flex-col gap-4 h-full min-h-0">
          <!-- key 不可变更：界面不提供改名入口（R13）。 -->
          <div class="flex flex-col gap-1">
            <NText depth="3" class="text-xs">
              {{ t('memory.fieldKey') }}
            </NText>
            <div class="flex items-center gap-2">
              <span class="font-mono text-sm break-all">{{ detail.key }}</span>
              <NText depth="3" class="text-xs">
                ·
              </NText>
              <NText depth="3" class="text-xs">
                {{ t('memory.noRename') }}
              </NText>
            </div>
          </div>

          <!-- 只读信号：重要性、衰减率、访问次数、最近访问时间、创建与更新时间。 -->
          <div class="grid grid-cols-2 gap-x-4 gap-y-2 pt-3 border-t dark:border-neutral-800">
            <div class="flex flex-col gap-1">
              <NText depth="3" class="text-xs">
                {{ t('memory.fieldImportance') }}
              </NText>
              <span class="text-sm">{{ formatNumber(detail.importanceScore) }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <NText depth="3" class="text-xs">
                {{ t('memory.fieldDecayRate') }}
              </NText>
              <span class="text-sm">{{ formatNumber(detail.decayRate) }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <NText depth="3" class="text-xs">
                {{ t('memory.fieldAccessCount') }}
              </NText>
              <span class="text-sm">{{ formatAccessCount(detail.accessCount) }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <NText depth="3" class="text-xs">
                {{ t('memory.fieldLastAccessedAt') }}
              </NText>
              <span class="text-sm">{{ formatTime(detail.lastAccessedAt) }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <NText depth="3" class="text-xs">
                {{ t('memory.fieldCreatedAt') }}
              </NText>
              <span class="text-sm">{{ formatTime(detail.createdAt) }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <NText depth="3" class="text-xs">
                {{ t('memory.fieldUpdatedAt') }}
              </NText>
              <span class="text-sm">{{ formatTime(detail.updatedAt) }}</span>
            </div>
          </div>

          <!-- 可编辑区：分类、正文、分层。 -->
          <div class="flex flex-col gap-1">
            <NText depth="3" class="text-xs">
              {{ t('memory.fieldCate') }}
            </NText>
            <NInput
              v-model:value="form.cate"
              size="small"
              :placeholder="t('memory.fieldCate')"
            />
          </div>

          <div class="flex flex-col flex-1 gap-1 min-h-0">
            <NText depth="3" class="text-xs">
              {{ t('memory.fieldContent') }}
            </NText>
            <NInput
              v-model:value="form.content"
              type="textarea"
              :autosize="{ minRows: 4, maxRows: 12 }"
              :placeholder="t('memory.fieldContentPlaceholder')"
            />
          </div>

          <div class="flex flex-col gap-1">
            <NText depth="3" class="text-xs">
              {{ t('memory.fieldTier') }}
            </NText>
            <template v-if="tierOption.editable">
              <NSelect
                v-model:value="form.tier"
                size="small"
                :options="tierSelectOptions"
              />
            </template>
            <template v-else>
              <NAlert type="info">
                {{ t('memory.tierUnknown', { tier: detail.tier || PLACEHOLDER }) }}
                <span class="ml-1">{{ t('memory.tierReadOnly') }}</span>
              </NAlert>
            </template>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between w-full">
          <NButton size="small" type="error" tertiary :loading="deleting" @click="handleDelete">
            {{ t('common.delete') }}
          </NButton>
          <div class="flex items-center gap-2">
            <NButton size="small" @click="close">
              {{ t('common.cancel') }}
            </NButton>
            <NButton
              size="small"
              type="primary"
              :loading="saving"
              :disabled="!canSave"
              @click="handleSave"
            >
              {{ t('common.save') }}
            </NButton>
          </div>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
