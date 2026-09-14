<script setup lang='ts'>
import type { SkillMetaField, SkillMetaValues } from '../utils'
import { NInput, NSelect, NText } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { t } from '@/locales'
import { isKnownPlatform, SKILL_META_MAX } from '../utils'

const props = withDefaults(defineProps<{
  meta: SkillMetaValues
  disabled?: boolean
  /** 提交时校验出的超长字段：文案渲染在对应输入框下面。 */
  invalid?: SkillMetaField[]
}>(), {
  disabled: false,
  invalid: () => [],
})

const emit = defineEmits<{
  (e: 'update:meta', value: SkillMetaValues): void
}>()

const platformOptions = computed(() => [
  { label: t('skill.platformLinux'), value: 'linux' },
  { label: t('skill.platformMacos'), value: 'macos' },
  { label: t('skill.platformWindows'), value: 'windows' },
])

function isInvalid(field: SkillMetaField) {
  return props.invalid.includes(field)
}

/** 界面只认三个合法平台；正文里其他名字保留在列表里，不因选择动作被丢掉（R23）。 */
const unknownPlatforms = computed(() => props.meta.platforms.filter(name => !isKnownPlatform(name)))

const selectedPlatforms = computed<string[]>({
  get: () => props.meta.platforms.filter(isKnownPlatform).map(name => name.trim().toLowerCase()),
  set: (values) => {
    update('platforms', [...values, ...unknownPlatforms.value])
  },
})

/** 逗号分隔的技能名：允许顿号与空白，拼装前会去空白去重。 */
function splitRelatedSkills(value: string): string[] {
  return value
    .split(/[,，、\n]/)
    .map(item => item.trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
}

/**
 * 关联技能是唯一"输入文本 ≠ 存储值"的字段（逗号分隔文本 ↔ 数组），
 * 直接绑数组会在用户敲下逗号的瞬间被回写掉，因此留一份文本缓冲；
 * 只有在外部值（例如切换到另一个技能）与缓冲解析结果不一致时才回灌。
 */
const relatedText = ref(props.meta.relatedSkills.join(', '))

watch(() => props.meta.relatedSkills, (list) => {
  if (splitRelatedSkills(relatedText.value).join('\n') !== list.join('\n'))
    relatedText.value = list.join(', ')
}, { deep: true })

function update<K extends keyof SkillMetaValues>(key: K, value: SkillMetaValues[K]) {
  emit('update:meta', { ...props.meta, [key]: value })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-1">
      <NText depth="3" class="text-xs">
        {{ t('skill.fieldVersion') }}
      </NText>
      <NInput
        :value="meta.version"
        :placeholder="t('skill.fieldVersion')"
        :disabled="disabled"
        @update:value="update('version', $event)"
      />
      <NText v-if="isInvalid('version')" type="error" class="text-xs">
        {{ t('skill.metaTooLong', { label: t('skill.fieldVersion'), max: SKILL_META_MAX.version }) }}
      </NText>
    </div>

    <div class="flex flex-col gap-1">
      <NText depth="3" class="text-xs">
        {{ t('skill.fieldAuthor') }}
      </NText>
      <NInput
        :value="meta.author"
        :placeholder="t('skill.fieldAuthor')"
        :disabled="disabled"
        @update:value="update('author', $event)"
      />
      <NText v-if="isInvalid('author')" type="error" class="text-xs">
        {{ t('skill.metaTooLong', { label: t('skill.fieldAuthor'), max: SKILL_META_MAX.author }) }}
      </NText>
    </div>

    <div class="flex flex-col gap-1">
      <NText depth="3" class="text-xs">
        {{ t('skill.fieldLicense') }}
      </NText>
      <NInput
        :value="meta.license"
        :placeholder="t('skill.fieldLicense')"
        :disabled="disabled"
        @update:value="update('license', $event)"
      />
      <NText v-if="isInvalid('license')" type="error" class="text-xs">
        {{ t('skill.metaTooLong', { label: t('skill.fieldLicense'), max: SKILL_META_MAX.license }) }}
      </NText>
    </div>

    <div class="flex flex-col gap-1">
      <NText depth="3" class="text-xs">
        {{ t('skill.fieldPlatform') }}
      </NText>
      <NSelect
        v-model:value="selectedPlatforms"
        multiple
        :options="platformOptions"
        :placeholder="t('skill.platformUnset')"
        :disabled="disabled"
      />
      <NText v-if="unknownPlatforms.length" depth="3" class="text-xs">
        {{ t('skill.platformUnknownHint', { values: unknownPlatforms.join(', ') }) }}
      </NText>
    </div>

    <div class="flex flex-col gap-1">
      <NText depth="3" class="text-xs">
        {{ t('skill.fieldCategory') }}
      </NText>
      <NInput
        :value="meta.category"
        :placeholder="t('skill.fieldCategory')"
        :disabled="disabled"
        @update:value="update('category', $event)"
      />
      <NText v-if="isInvalid('category')" type="error" class="text-xs">
        {{ t('skill.metaTooLong', { label: t('skill.fieldCategory'), max: SKILL_META_MAX.category }) }}
      </NText>
    </div>

    <div class="flex flex-col gap-1">
      <NText depth="3" class="text-xs">
        {{ t('skill.fieldHomepage') }}
      </NText>
      <NInput
        :value="meta.homepage"
        :placeholder="t('skill.fieldHomepage')"
        :disabled="disabled"
        @update:value="update('homepage', $event)"
      />
      <NText v-if="isInvalid('homepage')" type="error" class="text-xs">
        {{ t('skill.metaTooLong', { label: t('skill.fieldHomepage'), max: SKILL_META_MAX.homepage }) }}
      </NText>
    </div>

    <div class="flex flex-col gap-1">
      <NText depth="3" class="text-xs">
        {{ t('skill.fieldRelatedSkills') }}
      </NText>
      <NInput
        v-model:value="relatedText"
        :placeholder="t('skill.fieldRelatedSkillsHint')"
        :disabled="disabled"
        @update:value="update('relatedSkills', splitRelatedSkills($event))"
      />
      <NText depth="3" class="text-xs">
        {{ t('skill.fieldRelatedSkillsHint') }}
      </NText>
    </div>
  </div>
</template>
