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
    // 转换为更友好的显示格式: key: value
    const parts: string[] = []
    for (const [key, value] of Object.entries(parsed)) {
      parts.push(`${key}: ${value}`)
    }
    return parts.join(', ')
  } catch {
    return args
  }
}

onMounted(() => {
  addCopyEvents()
})

onUpdated(() => {
  addCopyEvents()
})

onUnmounted(() => {
  removeCopyEvents()
})
</script>

<template>
  <div class="text-black" :class="wrapClass">
    <div ref="textRef" class="leading-relaxed break-words">
      <div v-if="!inversion">
        <!-- 使用 chunks 模式渲染（支持工具调用穿插） -->
        <template v-if="chunks && chunks.length > 0">
          <div v-for="(chunk, idx) in chunks" :key="idx" class="mb-3">
            <!-- 工具调用开始/进行中 -->
            <div v-if="chunk.type === 'tool_call_start' || chunk.type === 'tool_call_progress'" class="mb-2 text-sm">
              <div v-if="chunk.toolCalls && chunk.toolCalls.length > 0">
                <span
                  v-for="(tc, tcIdx) in chunk.toolCalls"
                  :key="tcIdx"
                  class="inline-flex items-center gap-1 mr-2"
                >
                  <span class="text-green-500 font-medium">{{ tc.name }}</span>
                  <span class="text-gray-500">{{ formatArguments(tc.arguments || '') }}</span>
                  <span v-if="chunk.loading" class="text-gray-400 animate-pulse">...</span>
                </span>
              </div>
            </div>

            <!-- 工具调用结束 -->
            <div v-else-if="chunk.type === 'tool_call_end'" class="mb-2 text-sm">
              <div v-if="chunk.toolCalls && chunk.toolCalls.length > 0">
                <span
                  v-for="(tc, tcIdx) in chunk.toolCalls"
                  :key="tcIdx"
                  class="inline-flex items-center gap-1 mr-2"
                >
                  <span class="text-green-500 font-medium">{{ tc.name }}</span>
                  <span class="text-gray-500">{{ formatArguments(tc.arguments || '') }}</span>
                </span>
              </div>
            </div>

            <!-- 文本段落 -->
            <div v-else-if="chunk.type === 'text'">
              <div v-if="!asRawText" class="markdown-body" :class="{ 'markdown-body-generate': chunk.loading }" v-html="renderMarkdown(chunk.content)" />
              <div v-else class="whitespace-pre-wrap" v-text="chunk.content" />
            </div>
          </div>
        </template>
        <template v-else>
          <!-- 没有 chunks 时，使用 text 字段渲染 -->
          <div v-if="!asRawText" class="markdown-body" v-html="text" />
          <div v-else class="whitespace-pre-wrap" v-text="text" />
        </template>
      </div>
      <div v-else class="whitespace-pre-wrap" v-text="text" />
    </div>
  </div>
</template>

<style lang="less">
@import url(./style.less);
</style>
