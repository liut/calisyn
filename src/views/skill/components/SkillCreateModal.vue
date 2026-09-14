<script setup lang='ts'>
import type { SkillForm, SkillMetaField } from '../utils'
import type { SkillChannel } from '@/api/skill'
import { NAlert, NButton, NCollapse, NCollapseItem, NInput, NModal, NRadio, NRadioGroup, NText, useMessage } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { createSkill } from '@/api/skill'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import {
  channelOption,
  composeSkillContent,
  emptySkillMeta,
  invalidSkillMetaFields,
  SKILL_CHANNELS,
  skillErrorKey,
  validateSkillForm,
} from '../utils'
import SkillMetaFields from './SkillMetaFields.vue'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  /** 创建成功：报技能名，由面板回到第一页重载并直接打开该技能的详情（R12）。 */
  (e: 'created', name: string): void
}>()

const message = useMessage()
const { isMobile } = useBasicLayout()

/** 默认投放 Web：默认私有会让「建完在对话里用不上」，与表单的默认意图相反。 */
const DEFAULT_CHANNEL: SkillChannel = 'web'

/** `NCollapse` 里元数据那一节的名字。 */
const META_PANEL = 'meta'

const form = ref<SkillForm>({
  name: '',
  description: '',
  body: '',
  channel: DEFAULT_CHANNEL,
  meta: emptySkillMeta(),
})
/** 本地校验结果（i18n key），用字段级提示呈现，不发注定失败的请求。 */
const validationKey = ref<string | null>(null)
/** 提交失败原因（i18n key）：弹窗不关闭、已填内容保留。 */
const submitErrorKey = ref<string | null>(null)
/** 提交时校验出的超长元数据字段：文案由 SkillMetaFields 渲染在对应输入框下面。 */
const invalidMeta = ref<SkillMetaField[]>([])
/** 元数据默认折叠：多数技能只用名字/描述/正文，打开弹窗先给一个短表单。 */
const metaExpanded = ref<string[]>([])
const submitting = ref(false)

const channelOptions = computed(() => SKILL_CHANNELS.map(value => ({
  value,
  label: t(channelOption(value).labelKey),
})))

function fieldFeedback(prefix: string) {
  const key = validationKey.value

  return key?.startsWith(prefix) ? t(key) : undefined
}

function reset() {
  form.value = { name: '', description: '', body: '', channel: DEFAULT_CHANNEL, meta: emptySkillMeta() }
  validationKey.value = null
  submitErrorKey.value = null
  invalidMeta.value = []
  metaExpanded.value = []
  submitting.value = false
}

function close() {
  emit('update:show', false)
}

function handleShowChange(visible: boolean) {
  // 关闭即重置：下一次打开是干净的表单，不残留上一次的输入。
  if (!visible)
    reset()

  emit('update:show', visible)
}

// 用户一动手就撤下上一次的提示（字段级与提交失败），下一次提交再重新判定；
// 已填内容本身不动，失败重试不需要重新输入。
watch(form, () => {
  validationKey.value = null
  submitErrorKey.value = null
  invalidMeta.value = []
}, { deep: true })

async function handleSubmit() {
  if (submitting.value)
    return

  // 名称与描述按去空白后的值提交，本地校验与提交内容才是同一份数据。
  const name = form.value.name.trim()
  const description = form.value.description.trim()
  const body = form.value.body

  validationKey.value = validateSkillForm({ name, description, body })
  invalidMeta.value = invalidSkillMetaFields(form.value.meta)
  submitErrorKey.value = null

  // 折叠着提交时，超长提示不能藏在折叠区里——直接展开，让用户看到要改哪个字段。
  if (invalidMeta.value.length > 0)
    metaExpanded.value = [META_PANEL]

  if (validationKey.value || invalidMeta.value.length > 0)
    return

  submitting.value = true

  try {
    await createSkill({
      name,
      description,
      content: composeSkillContent({ name, description, body, meta: form.value.meta }),
      channel: form.value.channel,
    })

    message.success(t('skill.createSuccess'))
    emit('created', name)
    close()
  }
  catch (error) {
    // 名称被占用时 skillErrorKey 会映射成专用文案：该名称可能属于他人未公开的技能。
    submitErrorKey.value = skillErrorKey(error, 'skill.createFailed')
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <NModal
    :show="props.show"
    preset="card"
    :title="t('skill.createTitle')"
    :style="{ width: isMobile ? '92%' : '720px' }"
    @update:show="handleShowChange"
  >
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <NText depth="3" class="text-xs">
          {{ t('skill.fieldName') }}
        </NText>
        <NInput
          v-model:value="form.name"
          :placeholder="t('skill.fieldName')"
          :disabled="submitting"
        />
        <NText depth="3" class="text-xs">
          {{ t('skill.fieldNameHint') }}
        </NText>
        <NText v-if="fieldFeedback('skill.name')" type="error" class="text-xs">
          {{ fieldFeedback('skill.name') }}
        </NText>
      </div>

      <div class="flex flex-col gap-1">
        <NText depth="3" class="text-xs">
          {{ t('skill.fieldDescription') }}
        </NText>
        <NInput
          v-model:value="form.description"
          :placeholder="t('skill.fieldDescriptionHint')"
          :disabled="submitting"
        />
        <NText v-if="fieldFeedback('skill.description')" type="error" class="text-xs">
          {{ fieldFeedback('skill.description') }}
        </NText>
      </div>

      <div class="flex flex-col gap-1">
        <NText depth="3" class="text-xs">
          {{ t('skill.fieldBody') }}
        </NText>
        <NInput
          v-model:value="form.body"
          type="textarea"
          :autosize="{ minRows: 8 }"
          :placeholder="t('skill.fieldBodyPlaceholder')"
          :disabled="submitting"
        />
        <NText v-if="fieldFeedback('skill.body')" type="error" class="text-xs">
          {{ fieldFeedback('skill.body') }}
        </NText>
      </div>

      <div class="flex flex-col gap-1">
        <NText depth="3" class="text-xs">
          {{ t('skill.fieldChannel') }}
        </NText>
        <NRadioGroup v-model:value="form.channel" :disabled="submitting">
          <NRadio v-for="option in channelOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </NRadio>
        </NRadioGroup>
        <NText depth="3" class="text-xs">
          {{ t('skill.fieldChannelHint') }}
        </NText>
      </div>

      <NCollapse v-model:expanded-names="metaExpanded">
        <NCollapseItem :title="t('skill.metaSection')" :name="META_PANEL">
          <SkillMetaFields v-model:meta="form.meta" :disabled="submitting" :invalid="invalidMeta" />
        </NCollapseItem>
      </NCollapse>

      <NAlert v-if="submitErrorKey" type="error">
        {{ t(submitErrorKey) }}
      </NAlert>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <NButton :disabled="submitting" @click="close">
          {{ t('common.cancel') }}
        </NButton>
        <NButton type="primary" :loading="submitting" @click="handleSubmit">
          {{ t('skill.createSubmit') }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>
