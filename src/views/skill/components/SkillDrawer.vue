<script setup lang='ts'>
import type { DataTableColumns } from 'naive-ui'
import type { SkillEditForm, SkillMetaField } from '../utils'
import type { SkillDetail, SkillFile, SkillPatch } from '@/api/skill'
import {
  NAlert,
  NButton,
  NDataTable,
  NDrawer,
  NDrawerContent,
  NInput,
  NRadio,
  NRadioGroup,
  NSpace,
  NSpin,
  NTag,
  NText,
  useDialog,
  useMessage,
} from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { deleteSkill, fetchSkill, updateSkill } from '@/api/skill'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useUserStore } from '@/store'
import {
  buildSkillPatch,
  channelOption,
  emptySkillMeta,
  invalidSkillMetaFields,
  isOwnSkill,
  parseSkillContent,
  SKILL_CHANNELS,
  skillErrorKey,
  skillMetaOwner,
  validateSkillBody,
  validateSkillDescription,
} from '../utils'
import SkillMetaFields from './SkillMetaFields.vue'

const props = defineProps<{
  show: boolean
  /** 技能名：列表只有元数据，正文与资源文件清单必须按名单独拉取。 */
  skillName: string | null
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'saved', name: string): void
  (e: 'deleted', name: string): void
}>()

const PLACEHOLDER = '—'

const dialog = useDialog()
const message = useMessage()
const userStore = useUserStore()
const { isMobile } = useBasicLayout()

const detail = ref<SkillDetail | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const saving = ref(false)
const deleting = ref(false)

/** 编辑态只有描述、正文与频道三项：技能名创建后不可变更（R17）。 */
const form = ref<SkillEditForm>({ description: '', body: '', channel: '', meta: emptySkillMeta() })
/** 本地校验结果（i18n key）：与创建表单同一套口径，不发注定被后端拒绝的请求。 */
const validationKey = ref<string | null>(null)
/** 提交时校验出的超长元数据字段：文案由 SkillMetaFields 渲染在对应输入框下面。 */
const invalidMeta = ref<SkillMetaField[]>([])

const width = computed(() => (isMobile.value ? '100%' : 760))
const title = computed(() => detail.value?.name || t('skill.detailTitle'))
const parsed = computed(() => (detail.value ? parseSkillContent(detail.value.content) : null))
const files = computed(() => detail.value?.files ?? [])
const channel = computed(() => channelOption(detail.value?.channel))
/** 记录级 meta.owner：与归属标签并列展示，只读。 */
const metaOwner = computed(() => skillMetaOwner(detail.value?.meta))
const oidMissing = computed(() => !userStore.userInfo.oid)
const isOwn = computed(() => isOwnSkill(detail.value?.owner, userStore.userInfo.oid))
/** 加载中与加载失败都要有明确状态；`result` 缺失也按失败处理，避免抽屉空白。 */
const failed = computed(() => Boolean(error.value) || (!loading.value && !detail.value))
const errorText = computed(() => t(skillErrorKey(error.value, 'skill.detailFailed')))

/** 「元信息」块：七个元数据字段固定成行，空值给占位符，打开抽屉就能一眼看全。 */
const metaRows = computed(() => {
  const meta = parsed.value?.meta

  if (!meta)
    return []

  return [
    { label: t('skill.fieldVersion'), value: meta.version },
    { label: t('skill.fieldAuthor'), value: meta.author },
    { label: t('skill.fieldLicense'), value: meta.license },
    { label: t('skill.fieldPlatform'), value: meta.platforms.join(', ') },
    { label: t('skill.fieldCategory'), value: meta.category },
    { label: t('skill.fieldHomepage'), value: meta.homepage },
    { label: t('skill.fieldRelatedSkills'), value: meta.relatedSkills.join(', ') },
  ].map(row => ({ ...row, value: row.value || PLACEHOLDER }))
})

const channelOptions = computed(() => SKILL_CHANNELS.map(value => ({
  value,
  label: t(channelOption(value).labelKey),
})))

const fileColumns = computed<DataTableColumns<SkillFile>>(() => [
  {
    key: 'path',
    title: t('skill.filePath'),
    minWidth: 200,
    ellipsis: { tooltip: true },
  },
  {
    key: 'mime',
    title: t('skill.fileKind'),
    width: 160,
    render: (row: SkillFile) => row.mime || row.kind || PLACEHOLDER,
  },
  {
    key: 'size',
    title: t('skill.fileSize'),
    width: 110,
    render: (row: SkillFile) => formatSize(row.size),
  },
])

function formatTime(value?: string | null) {
  if (!value)
    return PLACEHOLDER

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function formatSize(size?: number) {
  if (typeof size !== 'number')
    return PLACEHOLDER

  if (size < 1024)
    return `${size} B`

  if (size < 1024 * 1024)
    return `${(size / 1024).toFixed(1)} KiB`

  return `${(size / 1024 / 1024).toFixed(2)} MiB`
}

function applyDetail(value: SkillDetail | null) {
  detail.value = value

  if (!value) {
    form.value = { description: '', body: '', channel: '', meta: emptySkillMeta() }
    return
  }

  // 正文在表单里是「去掉 frontmatter 的 body」与七个元数据字段，
  // 保存时再由 buildSkillPatch 重新拼装成完整 content。
  const content = parseSkillContent(value.content)

  form.value = {
    description: value.description,
    body: content.body,
    channel: value.channel,
    meta: content.meta,
  }
}

/** 递增序号：关闭或切换技能时丢弃在飞的响应，避免旧数据回填。 */
let loadToken = 0

function reset() {
  loadToken++
  detail.value = null
  error.value = null
  loading.value = false
  saving.value = false
  deleting.value = false
  validationKey.value = null
  invalidMeta.value = []
  applyDetail(null)
}

async function load() {
  const name = props.skillName

  if (!name)
    return

  const token = ++loadToken

  loading.value = true
  error.value = null

  try {
    const res = await fetchSkill(name)

    if (token !== loadToken)
      return

    applyDetail(res.result ?? null)
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

watch(() => [props.show, props.skillName] as const, ([visible]) => {
  // 关闭或切换技能时清空本地状态，重开不会残留上一个技能的编辑内容。
  reset()

  if (visible)
    load()
}, { immediate: true })

function close() {
  emit('update:show', false)
}

/**
 * 只校验这次真正要写回的字段：库里可能存着历史数据（例如空正文），
 * 不该因为一次无关的频道编辑而被本地校验挡住。
 */
function patchErrorKey(patch: SkillPatch): string | null {
  if (patch.description !== undefined) {
    const key = validateSkillDescription(form.value.description)

    if (key)
      return key
  }

  if (patch.content !== undefined)
    return validateSkillBody(form.value.body)

  return null
}

async function handleSave() {
  const skill = detail.value

  if (!skill || saving.value)
    return

  const patch = buildSkillPatch(skill, form.value)

  if (Object.keys(patch).length === 0) {
    close()
    return
  }

  validationKey.value = patchErrorKey(patch)
  // 只有这次真的要重建正文时才管元数据：只改频道的编辑不该被无关字段挡住。
  invalidMeta.value = patch.content === undefined ? [] : invalidSkillMetaFields(form.value.meta)

  if (validationKey.value || invalidMeta.value.length > 0)
    return

  saving.value = true

  try {
    await updateSkill(skill.name, patch)
    message.success(t('common.saveSuccess'))
    // 保存成功才通知面板刷新；失败时保留本地编辑内容，不关闭抽屉。
    emit('saved', skill.name)
    close()
  }
  catch (err) {
    message.error(t(skillErrorKey(err, 'skill.saveFailed')))
  }
  finally {
    saving.value = false
  }
}

// 用户一动手就撤下上一次的校验提示，已填内容本身不动。
watch(form, () => {
  validationKey.value = null
  invalidMeta.value = []
}, { deep: true })

function handleDelete() {
  const skill = detail.value

  if (!skill || deleting.value)
    return

  dialog.warning({
    title: t('skill.deleteConfirmTitle'),
    content: t('skill.deleteConfirmContent', { name: skill.name }),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: async () => {
      // 二次确认期间可能已有另一次删除在跑，不再发第二个 DELETE。
      if (deleting.value)
        return

      deleting.value = true

      try {
        await deleteSkill(skill.name)
        message.success(t('common.deleteSuccess'))
        emit('deleted', skill.name)
        close()
      }
      catch (err) {
        message.error(t(skillErrorKey(err, 'skill.deleteFailed')))
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
          <template #action>
            <NButton size="small" @click="load">
              {{ t('skill.retry') }}
            </NButton>
          </template>
        </NAlert>

        <div v-else-if="detail" class="flex flex-col gap-4 h-full min-h-0">
          <div class="flex flex-col gap-1">
            <div class="flex flex-wrap items-center gap-2">
              <NText strong>
                {{ detail.name }}
              </NText>
              <NTag size="small" :bordered="false">
                {{ isOwn ? t('skill.ownerMine') : t('skill.ownerOthers') }}
              </NTag>
              <NText v-if="metaOwner" depth="3" class="text-xs">
                {{ metaOwner }}
              </NText>
              <NTag size="small" :bordered="false" :type="channel.editable ? 'default' : 'warning'">
                {{ channel.editable ? t(channel.labelKey) : t('skill.channelUnknown', { channel: detail.channel }) }}
              </NTag>
            </div>
            <NText depth="3" class="text-xs">
              {{ t('skill.noRename') }}
            </NText>
            <NText depth="3" class="text-xs">
              {{ t('skill.createdAt') }}：{{ formatTime(detail.createdAt) }}
            </NText>
            <NText depth="3" class="text-xs">
              {{ t('skill.updatedAt') }}：{{ formatTime(detail.updatedAt) }}
            </NText>
          </div>

          <!-- 元信息：七个元数据字段固定列出（空值给占位符），打开抽屉即可看全。 -->
          <div v-if="metaRows.length" class="flex flex-col gap-1 pt-3 border-t dark:border-neutral-800">
            <NText strong class="text-sm">
              {{ t('skill.recordMeta') }}
            </NText>
            <NText v-for="row in metaRows" :key="row.label" depth="3" class="text-xs">
              {{ row.label }}：{{ row.value }}
            </NText>
          </div>

          <NAlert v-if="oidMissing" type="warning">
            {{ t('skill.oidMissing') }}
          </NAlert>
          <NAlert v-else-if="!isOwn" type="info">
            {{ t('skill.readOnly') }}
          </NAlert>

          <div class="flex flex-col gap-1">
            <NText depth="3" class="text-xs">
              {{ t('skill.fieldDescription') }}
            </NText>
            <NInput
              v-if="isOwn"
              v-model:value="form.description"
              :placeholder="t('skill.fieldDescriptionHint')"
              :disabled="saving"
            />
            <NText v-else>
              {{ detail.description }}
            </NText>
          </div>

          <div v-if="isOwn" class="flex flex-col gap-1">
            <NText depth="3" class="text-xs">
              {{ t('skill.fieldChannel') }}
            </NText>
            <template v-if="channel.editable">
              <NRadioGroup v-model:value="form.channel" :disabled="saving">
                <NRadio v-for="option in channelOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </NRadio>
              </NRadioGroup>
            </template>
            <template v-else>
              <NText>{{ t('skill.channelUnknown', { channel: detail.channel }) }}</NText>
              <NText depth="3" class="text-xs">
                {{ t('skill.channelNotEditable') }}
              </NText>
            </template>
          </div>

          <div class="flex flex-col flex-1 gap-1 min-h-0">
            <NText depth="3" class="text-xs">
              {{ t('skill.fieldContent') }}
            </NText>
            <NInput
              v-if="isOwn"
              v-model:value="form.body"
              type="textarea"
              :autosize="{ minRows: 10 }"
              :disabled="saving"
            />
            <pre
              v-else
              class="flex-1 p-2 m-0 overflow-auto text-sm whitespace-pre-wrap rounded bg-black/5 dark:bg-white/5"
            >{{ parsed?.body }}</pre>
          </div>

          <NAlert v-if="validationKey" type="error">
            {{ t(validationKey) }}
          </NAlert>

          <div v-if="isOwn" class="flex flex-col gap-1 pt-3 border-t dark:border-neutral-800">
            <NText strong class="text-sm">
              {{ t('skill.metaSection') }}
            </NText>
            <SkillMetaFields v-model:meta="form.meta" :disabled="saving" :invalid="invalidMeta" />
          </div>

          <div class="flex flex-col gap-1">
            <NText depth="3" class="text-xs">
              {{ t('skill.files') }}
            </NText>
            <NDataTable
              :columns="fileColumns"
              :data="files"
              :bordered="false"
              :max-height="220"
              size="small"
            >
              <template #empty>
                <div class="py-6 text-center text-gray-400">
                  {{ t('skill.filesEmpty') }}
                </div>
              </template>
            </NDataTable>
          </div>
        </div>
      </div>

      <template v-if="isOwn" #footer>
        <div class="flex items-center justify-between w-full">
          <NButton tertiary type="error" :loading="deleting" :disabled="saving" @click="handleDelete">
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
