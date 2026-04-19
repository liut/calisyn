<script lang="ts" setup>
import { computed, onMounted, onUnmounted, onUpdated, ref } from 'vue'
import MarkdownIt from 'markdown-it'
import MdKatex from '@vscode/markdown-it-katex'
import MdLinkAttributes from 'markdown-it-link-attributes'
import MdMermaid from 'mermaid-it-markdown'
import hljs from 'highlight.js'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { copyToClip } from '@/utils/copy'
import { SvgIcon } from '@/components/common'

interface Props {
  inversion?: boolean
  error?: boolean
  text?: string
  loading?: boolean
  asRawText?: boolean
  toolCalling?: boolean
  toolCalls?: Chat.Tool[]
  chunks?: Chat.MessageChunk[]
}

const props = defineProps<Props>()

// 思考段落的折叠状态管理
const thinkCollapsedStates = ref<Map<number, boolean>>(new Map())
// 思考段落的本地计时器（用于 loading 状态下的实时显示）
const thinkLocalTimers = new Map<number, { startTime: number; duration: number; interval: number }>()
// 用于触发视图刷新的 key
const thinkTick = ref(0)

const { isMobile } = useBasicLayout()

const textRef = ref<HTMLElement>()

const mdi = new MarkdownIt({
  html: false,
  linkify: true,
  highlight(code, language) {
    const validLang = !!(language && hljs.getLanguage(language))
    if (validLang) {
      const lang = language ?? ''
      return highlightBlock(hljs.highlight(code, { language: lang }).value, lang)
    }
    return highlightBlock(hljs.highlightAuto(code).value, '')
  },
})

mdi.use(MdLinkAttributes, { attrs: { target: '_blank', rel: 'noopener' } }).use(MdKatex).use(MdMermaid)

const wrapClass = computed(() => {
  return [
    'text-wrap',
    'min-w-[20px]',
    'rounded-md',
    isMobile.value ? 'p-2' : 'px-3 py-2',
    props.inversion ? 'bg-[#d2f9d1]' : 'bg-[#f4f6f8]',
    props.inversion ? 'dark:bg-[#a1dc95]' : 'dark:bg-[#1e1e20]',
    props.inversion ? 'message-request' : 'message-reply',
    { 'text-red-500': props.error },
  ]
})

// 渲染单个文本内容
function renderMarkdown(value: string): string {
  if (!props.asRawText) {
    const escapedText = escapeBrackets(escapeDollarNumber(value))
    return mdi.render(escapedText)
  }
  return value
}

const text = computed(() => {
  const value = props.text ?? ''
  return renderMarkdown(value)
})

function highlightBlock(str: string, lang?: string) {
  return `<pre class="code-block-wrapper"><div class="code-block-header"><span class="code-block-header__lang">${lang}</span><span class="code-block-header__copy">${t('chat.copyCode')}</span></div><code class="hljs code-block-body ${lang}">${str}</code></pre>`
}

function addCopyEvents() {
  if (textRef.value) {
    const copyBtn = textRef.value.querySelectorAll('.code-block-header__copy')
    copyBtn.forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.parentElement?.nextElementSibling?.textContent
        if (code) {
          copyToClip(code).then(() => {
            btn.textContent = t('chat.copied')
            setTimeout(() => {
              btn.textContent = t('chat.copyCode')
            }, 1000)
          })
        }
      })
    })
  }
}

function removeCopyEvents() {
  if (textRef.value) {
    const copyBtn = textRef.value.querySelectorAll('.code-block-header__copy')
    copyBtn.forEach((btn) => {
      btn.removeEventListener('click', () => { })
    })
  }
}

function escapeDollarNumber(text: string) {
  let escapedText = ''

  for (let i = 0; i < text.length; i += 1) {
    let char = text[i]
    const nextChar = text[i + 1] || ' '

    if (char === '$' && nextChar >= '0' && nextChar <= '9')
      char = '\\$'

    escapedText += char
  }

  return escapedText
}

function escapeBrackets(text: string) {
  const pattern = /(```[\s\S]*?```|`.*?`)|\\\[([\s\S]*?[^\\])\\\]|\\\((.*?)\\\)/g
  return text.replace(pattern, (match, codeBlock, squareBracket, roundBracket) => {
    if (codeBlock)
      return codeBlock
    else if (squareBracket)
      return `$$${squareBracket}$$`
    else if (roundBracket)
      return `$${roundBracket}$`
    return match
  })
}

function formatArguments(args: string): string {
  try {
    const parsed = JSON.parse(args)
    return formatValue(parsed)
  }
  catch {
    return args
  }
}

// 递归格式化值，支持嵌套对象
function formatValue(value: unknown, indent = 0): string {
  if (value === null || value === undefined)
    return String(value)

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value)

  if (Array.isArray(value)) {
    if (value.length === 0)
      return '[]'
    const items = value.map(item => formatValue(item, indent + 1))
    if (indent === 0 || items.every(item => !item.includes('\n') && item.length < 30)) {
      return `[${items.join(', ')}]`
    }
    return items.map(item => indent > 0 ? '  '.repeat(indent) + '- ' + item : item).join('\n')
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0)
      return '{}'

    const formattedEntries = entries.map(([key, val]) => {
      const formattedVal = formatValue(val, indent + 1)
      if (typeof val === 'object' && val !== null) {
        // 嵌套对象显示为 key: {...} 或多行列出
        if (formattedVal.includes('\n')) {
          return `${key}:\n${formattedVal}`
        }
        return `${key}: ${formattedVal}`
      }
      return `${key}: ${formattedVal}`
    })

    if (formattedEntries.length === 1 && !formattedEntries[0].includes('\n')) {
      return formattedEntries[0]
    }

    const prefix = indent > 0 ? '  '.repeat(indent) : ''
    return formattedEntries.map(entry => `${prefix}${entry}`).join(', ')
  }

  return String(value)
}

// 切换思考段落的折叠状态
function toggleThinkCollapse(index: number, chunk: Chat.MessageChunk) {
  const currentState = thinkCollapsedStates.value.get(index)
  // 如果已经有手动设置的状态，则取反；否则使用 chunk 的 collapsed 状态取反
  const newState = currentState !== undefined ? !currentState : !chunk.collapsed
  // 创建新的 Map 以触发响应式更新
  const newMap = new Map(thinkCollapsedStates.value)
  newMap.set(index, newState)
  thinkCollapsedStates.value = newMap
}

// 获取思考段落的折叠状态
function isThinkCollapsed(index: number, chunk: Chat.MessageChunk): boolean {
  const manualState = thinkCollapsedStates.value.get(index)
  return manualState !== undefined ? manualState : !!chunk.collapsed
}

// 获取思考时间文本
function getThinkDuration(index: number, chunk: Chat.MessageChunk): string {
  // 依赖 thinkTick 触发响应式更新
  // eslint-disable-next-line no-void
  void (thinkTick.value)

  // 如果还在加载中，使用本地计时器
  if (chunk.loading) {
    const localTimer = thinkLocalTimers.get(index)
    const seconds = localTimer?.duration ?? 0
    return t('chat.thinkingWithDuration', { seconds: seconds.toString() })
  }

  // 已完成，使用 chunk 中持久化的 duration
  const seconds = chunk.thinkDuration ?? 0
  return t('chat.thoughtFor', { seconds: seconds.toString() })
}

// 启动本地计时器
function startLocalTimer(index: number) {
  if (thinkLocalTimers.has(index))
    return
  const timer = {
    startTime: Date.now(),
    duration: 0,
    interval: window.setInterval(() => {
      const t = thinkLocalTimers.get(index)
      if (t) {
        t.duration = Math.floor((Date.now() - t.startTime) / 1000)
        // 触发视图更新
        thinkTick.value++
      }
    }, 1000),
  }
  thinkLocalTimers.set(index, timer)
}

// 停止本地计时器，返回持续时间
function stopLocalTimer(index: number): number {
  const timer = thinkLocalTimers.get(index)
  if (timer) {
    clearInterval(timer.interval)
    const duration = Math.floor((Date.now() - timer.startTime) / 1000)
    thinkLocalTimers.delete(index)
    return duration
  }
  return 0
}

// 清理所有本地计时器
function clearAllLocalTimers() {
  thinkLocalTimers.forEach((timer) => {
    clearInterval(timer.interval)
  })
  thinkLocalTimers.clear()
}

onMounted(() => {
  addCopyEvents()
  // 启动思考中段落的本地计时器
  props.chunks?.forEach((chunk, idx) => {
    if (chunk.type === 'think' && chunk.loading)
      startLocalTimer(idx)
  })
})

onUpdated(() => {
  addCopyEvents()
  // 管理本地计时器
  props.chunks?.forEach((chunk, idx) => {
    if (chunk.type === 'think') {
      if (chunk.loading) {
        // 开始新计时器
        startLocalTimer(idx)
      }
      else if (thinkLocalTimers.has(idx)) {
        // 停止计时器并将 duration 写入 chunk
        const duration = stopLocalTimer(idx)
        if (!chunk.thinkDuration && duration > 0)
          chunk.thinkDuration = duration
      }
    }
  })
})

onUnmounted(() => {
  removeCopyEvents()
  // 清理所有本地计时器
  clearAllLocalTimers()
})
</script>

<template>
  <div class="text-black" :class="wrapClass">
    <div ref="textRef" class="leading-relaxed break-words">
      <div v-if="!inversion">
        <!-- 使用 chunks 模式渲染 -->
        <template v-if="chunks && chunks.length > 0">
          <div v-for="(chunk, idx) in chunks" :key="idx" class="mb-3">
            <!-- 思考段落 -->
            <div v-if="chunk.type === 'think'" class="mb-3">
              <!-- 思考头部 - 无框，可点击折叠 -->
              <div
                class="think-header inline-flex items-center gap-2 cursor-pointer select-none group"
                @click="toggleThinkCollapse(idx, chunk)"
              >
                <span class="text-sm text-[#b0a090] dark:text-[#6a6258]">
                  {{ getThinkDuration(idx, chunk) }}
                </span>
                <SvgIcon
                  :icon="isThinkCollapsed(idx, chunk) ? 'ri:arrow-right-s-line' : 'ri:arrow-down-s-line'"
                  class="text-[#c0b0a0] dark:text-[#706860] text-sm group-hover:text-[#8a7a6a] dark:group-hover:text-[#a09078] transition-colors"
                />
              </div>
              <!-- 思考内容 - 有边框，仅展开时显示 -->
              <div
                v-show="!isThinkCollapsed(idx, chunk)"
                class="think-content mt-2 px-3 py-2 text-sm text-[#6a5a4a] dark:text-[#a89878] border border-[#e0d5c8] dark:border-[#4a4538] rounded-lg bg-[#faf8f5] dark:bg-[#2a2618]"
              >
                <div v-if="chunk.content" class="whitespace-pre-wrap leading-relaxed">
                  {{ chunk.content }}
                </div>
                <span v-else-if="chunk.loading" class="text-gray-400 animate-pulse">...</span>
              </div>
            </div>

            <!-- 工具调用段落 -->
            <div v-else-if="chunk.type === 'tool_call'" class="mb-2 text-sm">
              <div v-if="chunk.toolCalls && chunk.toolCalls.length > 0">
                <span
                  v-for="(tc, tcIdx) in chunk.toolCalls"
                  :key="tcIdx"
                  class="inline-flex items-center gap-1 mr-2"
                >
                  <span class="text-gray-500 font-medium">{{ tc.name }}</span>
                  <span class="text-[#4a9a4a] dark:text-[#3a8a3a]">{{ formatArguments(tc.arguments || '') }}</span>
                  <span v-if="chunk.loading" class="text-gray-400 animate-pulse">...</span>
                </span>
              </div>
            </div>

            <!-- 文本段落 -->
            <div v-else-if="chunk.type === 'text'">
              <template v-if="chunk.content">
                <div v-if="!asRawText" class="markdown-body" :class="{ 'markdown-body-generate': chunk.loading }" v-html="renderMarkdown(chunk.content)" />
                <div v-else class="whitespace-pre-wrap" v-text="chunk.content" />
              </template>
              <span v-else-if="chunk.loading" class="text-gray-400 animate-pulse">...</span>
            </div>
          </div>
        </template>
        <template v-else>
          <!-- 没有 chunks 时，渲染 toolCalls（如果有）然后渲染 text -->
          <div v-if="toolCalls && toolCalls.length > 0" class="mb-2 text-sm">
            <span
              v-for="(tc, tcIdx) in toolCalls"
              :key="tcIdx"
              class="inline-flex items-center gap-1 mr-2"
            >
              <span class="text-green-500 font-medium">{{ tc.name }}</span>
              <span class="text-gray-500">{{ formatArguments(tc.arguments || '') }}</span>
            </span>
          </div>
          <template v-if="text">
            <div v-if="!asRawText" class="markdown-body" v-html="text" />
            <div v-else class="whitespace-pre-wrap" v-text="text" />
          </template>
          <span v-else-if="loading" class="text-gray-400 animate-pulse">...</span>
        </template>
      </div>
      <div v-else class="whitespace-pre-wrap" v-text="text" />
    </div>
  </div>
</template>

<style lang="less">
@import url(./style.less);
</style>
