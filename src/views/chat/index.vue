<script setup lang='ts'>
import type { Ref } from 'vue'
import type { StreamMessage } from '@/api'
import { toPng } from 'html-to-image'
import { NAutoComplete, NButton, NInput, useDialog, useMessage } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { fetchChatStream, fetchConversationTitle } from '@/api'
import { HoverButton, SvgIcon } from '@/components/common'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useChatStore, usePromptStore } from '@/store'
import { Message } from './components'
import HeaderComponent from './components/Header/index.vue'
import { useChat } from './hooks/useChat'
import { useScroll } from './hooks/useScroll'
import { useUsingContext } from './hooks/useUsingContext'

let controller = new AbortController()

const openLongReply = import.meta.env.VITE_OPEN_LONG_REPLY === 'true'

const route = useRoute()
const dialog = useDialog()
const ms = useMessage()

const chatStore = useChatStore()

const { isMobile } = useBasicLayout()
const { addChat, updateChat, updateChatSome, getChatByCsidAndIndex } = useChat()
const { scrollRef, scrollToBottom, scrollToBottomIfAtBottom } = useScroll()
const { usingContext, toggleUsingContext } = useUsingContext()

const csid = computed(() => route.params.csid as string ?? '')

const dataSources = computed(() => chatStore.getChatByCsid(csid.value))
const conversationList = computed(() => dataSources.value.filter(item => (!item.inversion && !!item.conversationOptions)))

const prompt = ref<string>('')
const loading = ref<boolean>(false)
const inputRef = ref<Ref | null>(null)

// 添加PromptStore
const promptStore = usePromptStore()

// 使用storeToRefs，保证store修改后，联想部分能够重新渲染
const { promptList: promptTemplate } = storeToRefs<any>(promptStore)

// ============ SSE 消息处理核心逻辑 ============

interface SSEHandlerOptions {
  message: string
  csid: string
  options: Chat.ConversationRequest
  index?: number // 不提供则为新增消息
  regen?: boolean
  signal?: AbortSignal
}

function createSSEHandler(options: SSEHandlerOptions) {
  const { message: originalMessage, csid, options: chatOptions, index, regen, signal } = options

  // 状态变量
  let chunks: Chat.MessageChunk[] = []
  let currentMessage = originalMessage
  // 记录上一个 delta（用于去重）
  let lastDelta = ''
  // 记录上一个 think（用于去重）
  let lastThink = ''
  // 记录原始 csid，用于更新
  let originalCsid = csid
  // 当前 csid（从路由获取）
  let currentCsid = (route.params.csid as string) || chatStore.active || ''
  // 延迟折叠思考内容的定时器
  let thinkCollapseTimer: ReturnType<typeof setTimeout> | null = null

  // 处理单条 SSE 消息
  const handleMessage = (data: StreamMessage) => {
    // 忽略空消息（但允许只有 finishReason 或 title 的消息，用于更新标题等）
    const hasContent = (data.tool_calls && data.tool_calls.length > 0) || data.delta || data.think || data.text || data.finishReason || data.title
    if (!hasContent)
      return

    // 获取当前最新的 csid（从路由获取）
    currentCsid = (route.params.csid as string) || chatStore.active || ''

    // 首次收到消息时，如果有新的 csid 则更新（只更新一次）
    if (originalCsid && data.csid && data.csid !== originalCsid) {
      chatStore.updateCsid(originalCsid, data.csid)
      originalCsid = ''
    }

    // 处理工具调用数据：创建 tool_call 段落
    if (data.tool_calls && data.tool_calls.length > 0) {
      // 将之前的文本段落标记为已完成
      chunks = chunks.map((chunk) => {
        if (chunk.type === 'text' || chunk.type === 'think')
          return { ...chunk, loading: false }

        return chunk
      })

      const toolCallData = data.tool_calls.map(tc => ({
        id: tc.id || '',
        name: tc.function?.name || '',
        arguments: tc.function?.arguments || '',
      }))

      // 检查是否已有 tool_call 段落，避免重复创建
      const lastChunk = chunks[chunks.length - 1]
      if (lastChunk && lastChunk.type === 'tool_call') {
        // 更新现有工具调用
        chunks[chunks.length - 1] = {
          type: 'tool_call',
          content: '',
          toolCalls: toolCallData,
          loading: true,
        }
      }
      else {
        // 创建新的工具调用段落
        chunks.push({
          type: 'tool_call',
          content: '',
          toolCalls: toolCallData,
          loading: true,
        })
      }
    }

    // 处理思考内容
    if (data.think) {
      // 去重
      if (data.think === lastThink)
        return

      lastThink = data.think

      const lastChunk = chunks[chunks.length - 1]
      if (lastChunk && lastChunk.type === 'think') {
        // 追加到现有思考段落，默认保持展开状态（loading 时）
        chunks[chunks.length - 1] = {
          ...lastChunk,
          content: lastChunk.content + data.think,
          loading: true,
          collapsed: false,
        }
      }
      else {
        // 创建新的思考段落，默认展开
        chunks.push({
          type: 'think',
          content: data.think,
          loading: true,
          collapsed: false,
        })
      }
    }

    // 处理文本
    if (data.delta || data.text) {
      const text = data.delta || data.text || ''

      // 去重
      if (text === lastDelta)
        return

      lastDelta = text

      // 当收到正式回复内容时，将 think 段落标记为加载完成
      // 并延迟 1.5 秒后折叠，让用户有时间看到思考过程
      const hasThinkChunk = chunks.some(c => c.type === 'think' && !c.collapsed)
      if (hasThinkChunk) {
        // 先标记为加载完成（duration 由组件本地计时器提供，不在这里计算）
        chunks = chunks.map((chunk) => {
          if (chunk.type === 'think')
            return { ...chunk, loading: false }
          return chunk
        })
        // 延迟 1.5 秒后折叠
        if (thinkCollapseTimer)
          clearTimeout(thinkCollapseTimer)
        thinkCollapseTimer = setTimeout(() => {
          chunks = chunks.map((chunk) => {
            if (chunk.type === 'think')
              return { ...chunk, collapsed: true }
            return chunk
          })
          // 触发更新以应用折叠状态
          const targetIndex = index ?? dataSources.value.length - 1
          const finalText = chunks
            .filter(c => c.type === 'text')
            .map(c => c.content)
            .join('')
          const toolCalls = chunks
            .filter(c => c.toolCalls && c.toolCalls.length > 0)
            .flatMap(c => c.toolCalls || [])
          const toolCalling = chunks.some(c => c.type === 'tool_call' && c.loading)
          updateChat(
            currentCsid,
            targetIndex,
            {
              dateTime: new Date().toLocaleString(),
              text: finalText,
              inversion: false,
              error: false,
              loading: true,
              toolCalling,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              chunks,
              conversationOptions: { conversationId: data.csid, parentMessageId: data.id || '' },
              requestOptions: { prompt: currentMessage, options: { ...chatOptions } },
            },
          )
        }, 1500)
      }

      // 追加到最后一个文本段落或新建
      const lastChunk = chunks[chunks.length - 1]
      if (lastChunk && lastChunk.type === 'text') {
        chunks[chunks.length - 1] = {
          ...lastChunk,
          content: lastChunk.content + text,
          loading: true,
        }
      }
      else {
        chunks.push({
          type: 'text',
          content: text,
          loading: true,
        })
      }
    }

    // 更新聊天状态
    try {
      const targetIndex = index ?? dataSources.value.length - 1

      // 构建完整文本
      const finalText = chunks
        .filter(c => c.type === 'text')
        .map(c => c.content)
        .join('')

      // 收集所有 toolCalls
      const toolCalls = chunks
        .filter(c => c.toolCalls && c.toolCalls.length > 0)
        .flatMap(c => c.toolCalls || [])
      const toolCalling = chunks.some(c => c.type === 'tool_call' && c.loading)

      updateChat(
        currentCsid,
        targetIndex,
        {
          dateTime: new Date().toLocaleString(),
          text: finalText,
          inversion: false,
          error: false,
          loading: true,
          toolCalling,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          chunks,
          conversationOptions: { conversationId: data.csid, parentMessageId: data.id || '' },
          requestOptions: { prompt: currentMessage, options: { ...chatOptions } },
        },
      )

      // 长回复处理
      if (openLongReply && data.finishReason === 'length') {
        chatOptions.parentMessageId = data.id
        currentMessage = ''
        return true
      }
      else if (data.finishReason) {
        // 清理延迟折叠定时器
        if (thinkCollapseTimer) {
          clearTimeout(thinkCollapseTimer)
          thinkCollapseTimer = null
        }
        // 标记所有段落加载完成，并将思考段落折叠
        chunks = chunks.map((chunk) => {
          if (chunk.type === 'think')
            return { ...chunk, loading: false, collapsed: true }
          return { ...chunk, loading: false }
        })

        // 当 finishReason 为 stop 时获取标题
        if (data.finishReason === 'stop') {
          const finalCsid = data.csid || currentCsid

          // 优先使用服务端返回的标题，否则调用 API 获取
          if (data.title) {
            chatStore.updateHistory(finalCsid, { title: data.title })
          }
          else {
            fetchConversationTitle(finalCsid).then((res: any) => {
              const title = res?.data?.data?.title
              if (title)
                chatStore.updateHistory(finalCsid, { title })
            }).catch((err) => {
              console.warn('Failed to update conversation title:', err)
            })
          }
        }
        updateChatSome(currentCsid, targetIndex, { loading: false, chunks })
      }

      scrollToBottomIfAtBottom()
    }
    catch (error) {
      console.warn(error)
    }

    return false
  }

  // 执行请求（支持长回复的循环请求）
  const fetchWithLongReply = async (_onMessage?: (data: StreamMessage) => void) => {
    let continueRequest = false

    do {
      continueRequest = false

      await fetchChatStream({
        prompt: currentMessage,
        csid: currentCsid,
        options: chatOptions,
        regen,
        signal,
        onMessage: (data: StreamMessage) => {
          const shouldContinue = handleMessage(data)
          if (shouldContinue)
            continueRequest = true

          _onMessage?.(data)
        },
      })
    } while (continueRequest)
  }

  return {
    handleMessage,
    fetch: fetchWithLongReply,
    getChunks: () => chunks,
    close: () => {
      if (thinkCollapseTimer) {
        clearTimeout(thinkCollapseTimer)
        thinkCollapseTimer = null
      }
    },
  }
}

// 未知原因刷新页面，loading 状态不会重置，手动重置
dataSources.value.forEach((item, index) => {
  if (item?.loading)
    updateChatSome(csid.value, index, { loading: false })
})

function handleSubmit() {
  onConversation()
}

async function onConversation() {
  const message = prompt.value

  if (loading.value)
    return

  if (!message || message.trim() === '')
    return

  controller = new AbortController()

  addChat(
    csid.value,
    {
      dateTime: new Date().toLocaleString(),
      text: message,
      inversion: true,
      error: false,
      conversationOptions: null,
      requestOptions: { prompt: message, options: null },
    },
  )
  scrollToBottom()

  loading.value = true
  prompt.value = ''

  let options: Chat.ConversationRequest = {}
  const lastContext = conversationList.value[conversationList.value.length - 1]?.conversationOptions

  if (lastContext && usingContext.value)
    options = { ...lastContext }

  addChat(
    csid.value,
    {
      dateTime: new Date().toLocaleString(),
      text: t('chat.thinking'),
      loading: true,
      inversion: false,
      error: false,
      conversationOptions: null,
      requestOptions: { prompt: message, options: { ...options } },
    },
  )
  scrollToBottom()

  let handler: ReturnType<typeof createSSEHandler> | null = null
  try {
    handler = createSSEHandler({
      message,
      csid: csid.value,
      options,
    })

    await handler.fetch(handler.handleMessage)

    updateChatSome(csid.value, dataSources.value.length - 1, { loading: false, chunks: handler.getChunks() })
  }
  catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : t('common.wrong')

    if (error instanceof Error && (error.name === 'AbortError' || error.message === 'canceled')) {
      updateChatSome(
        csid.value,
        dataSources.value.length - 1,
        {
          loading: false,
        },
      )
      scrollToBottomIfAtBottom()
      return
    }

    const currentChat = getChatByCsidAndIndex(csid.value, dataSources.value.length - 1)

    if (currentChat?.text && currentChat.text !== '') {
      updateChatSome(
        csid.value,
        dataSources.value.length - 1,
        {
          text: `${currentChat.text}\n[${errorMessage}]`,
          error: false,
          loading: false,
        },
      )
      return
    }

    updateChat(
      csid.value,
      dataSources.value.length - 1,
      {
        dateTime: new Date().toLocaleString(),
        text: errorMessage,
        inversion: false,
        error: true,
        loading: false,
        conversationOptions: null,
        requestOptions: { prompt: message, options: { ...options } },
      },
    )
    scrollToBottomIfAtBottom()
  }
  finally {
    loading.value = false
    handler?.close()
  }
}

async function onRegenerate(index: number) {
  if (loading.value)
    return

  controller = new AbortController()

  const { requestOptions } = dataSources.value[index]

  const message = requestOptions?.prompt ?? ''

  let options: Chat.ConversationRequest = {}

  if (requestOptions.options)
    options = { ...requestOptions.options }

  loading.value = true

  updateChat(
    csid.value,
    index,
    {
      dateTime: new Date().toLocaleString(),
      text: t('chat.thinking'),
      inversion: false,
      error: false,
      loading: true,
      conversationOptions: null,
      requestOptions: { prompt: message, options: { ...options } },
    },
  )

  let handler: ReturnType<typeof createSSEHandler> | null = null
  try {
    handler = createSSEHandler({
      message,
      csid: csid.value,
      options,
      index,
      regen: true,
      signal: controller.signal,
    })

    await handler.fetch(handler.handleMessage)

    updateChatSome(csid.value, index, { loading: false, chunks: handler.getChunks() })
  }
  catch (error: unknown) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message === 'canceled')) {
      updateChatSome(
        csid.value,
        index,
        {
          loading: false,
        },
      )
      return
    }

    const errorMessage = error instanceof Error ? error.message : t('common.wrong')

    updateChat(
      csid.value,
      index,
      {
        dateTime: new Date().toLocaleString(),
        text: errorMessage,
        inversion: false,
        error: true,
        loading: false,
        conversationOptions: null,
        requestOptions: { prompt: message, options: { ...options } },
      },
    )
  }
  finally {
    loading.value = false
    handler?.close()
  }
}

function handleExport() {
  if (loading.value)
    return

  const d = dialog.warning({
    title: t('chat.exportImage'),
    content: t('chat.exportImageConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: async () => {
      try {
        d.loading = true
        const ele = document.getElementById('image-wrapper')
        const imgUrl = await toPng(ele as HTMLDivElement)
        const tempLink = document.createElement('a')
        tempLink.style.display = 'none'
        tempLink.href = imgUrl
        tempLink.setAttribute('download', 'chat-shot.png')
        if (typeof tempLink.download === 'undefined')
          tempLink.setAttribute('target', '_blank')
        document.body.appendChild(tempLink)
        tempLink.click()
        document.body.removeChild(tempLink)
        window.URL.revokeObjectURL(imgUrl)
        d.loading = false
        ms.success(t('chat.exportSuccess'))
        Promise.resolve()
      }
      catch (error: any) {
        console.warn(error)
        ms.error(t('chat.exportFailed'))
      }
      finally {
        d.loading = false
      }
    },
  })
}

function handleDelete(index: number) {
  if (loading.value)
    return

  dialog.warning({
    title: t('chat.deleteMessage'),
    content: t('chat.deleteMessageConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: () => {
      chatStore.deleteChatByCsid(csid.value, index)
    },
  })
}

function handleClear() {
  if (loading.value)
    return

  dialog.warning({
    title: t('chat.clearChat'),
    content: t('chat.clearChatConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: () => {
      chatStore.clearChatByCsid(csid.value)
    },
  })
}

function handleEnter(event: KeyboardEvent) {
  if (!isMobile.value) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }
  else {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault()
      handleSubmit()
    }
  }
}

function handleStop() {
  if (loading.value) {
    controller.abort()
    loading.value = false
  }
}

// 可优化部分
// 搜索选项计算，这里使用value作为索引项，所以当出现重复value时渲染异常(多项同时出现选中效果)
// 理想状态下其实应该是key作为索引项,但官方的renderOption会出现问题，所以就需要value反renderLabel实现
const searchOptions = computed(() => {
  if (prompt.value.startsWith('/')) {
    return promptTemplate.value.filter((item: { key: string }) => item.key.toLowerCase().includes(prompt.value.substring(1).toLowerCase())).map((obj: { value: any }) => {
      return {
        label: obj.value,
        value: obj.value,
      }
    })
  }
  else {
    return []
  }
})

// value反渲染key
function renderOption(option: { label: string }) {
  for (const i of promptTemplate.value) {
    if (i.value === option.label)
      return [i.key]
  }
  return []
}

const placeholder = computed(() => {
  if (isMobile.value)
    return t('chat.placeholderMobile')
  return t('chat.placeholder')
})

const buttonDisabled = computed(() => {
  return loading.value || !prompt.value || prompt.value.trim() === ''
})

const footerClass = computed(() => {
  let classes = ['p-4']
  if (isMobile.value)
    classes = ['sticky', 'left-0', 'bottom-0', 'right-0', 'p-2', 'pr-3', 'overflow-hidden']
  return classes
})

onMounted(() => {
  scrollToBottom()
  if (inputRef.value && !isMobile.value)
    inputRef.value?.focus()
})

onUnmounted(() => {
  if (loading.value)
    controller.abort()
})
</script>

<template>
  <div class="flex flex-col w-full h-full">
    <HeaderComponent
      v-if="isMobile"
      :using-context="usingContext"
      @export="handleExport"
      @handle-clear="handleClear"
    />
    <main class="flex-1 overflow-hidden">
      <div id="scrollRef" ref="scrollRef" class="h-full overflow-hidden overflow-y-auto">
        <div
          class="w-full max-w-screen-xl m-auto dark:bg-[#101014]"
          :class="[isMobile ? 'p-2' : 'p-4']"
        >
          <div id="image-wrapper" class="relative">
            <template v-if="!dataSources.length">
              <div class="flex items-center justify-center mt-4 text-center text-neutral-300">
                <SvgIcon icon="ri:bubble-chart-fill" class="mr-2 text-3xl" />
                <span>{{ t('chat.newChatTitle') }}</span>
              </div>
            </template>
            <template v-else>
              <div>
                <Message
                  v-for="(item, index) of dataSources"
                  :key="index"
                  :date-time="item?.dateTime"
                  :text="item?.text"
                  :inversion="item?.inversion"
                  :error="item?.error"
                  :loading="item?.loading"
                  :tool-calling="item?.toolCalling"
                  :tool-calls="item?.toolCalls"
                  :chunks="item?.chunks"
                  @regenerate="onRegenerate(index)"
                  @delete="handleDelete(index)"
                />
                <div class="sticky bottom-0 left-0 flex justify-center">
                  <NButton v-if="loading" type="warning" @click="handleStop">
                    <template #icon>
                      <SvgIcon icon="ri:stop-circle-line" />
                    </template>
                    {{ t('common.stopResponding') }}
                  </NButton>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </main>
    <footer :class="footerClass">
      <div class="w-full max-w-screen-xl m-auto">
        <div class="flex items-center justify-between space-x-2">
          <HoverButton v-if="!isMobile" @click="handleClear">
            <span class="text-xl text-[#4f555e] dark:text-white">
              <SvgIcon icon="ri:delete-bin-line" />
            </span>
          </HoverButton>
          <HoverButton v-if="!isMobile && false" @click="handleExport">
            <span class="text-xl text-[#4f555e] dark:text-white">
              <SvgIcon icon="ri:download-2-line" />
            </span>
          </HoverButton>
          <HoverButton v-if="false" @click="toggleUsingContext">
            <span class="text-xl" :class="{ 'text-[#4b9e5f]': usingContext, 'text-[#a8071a]': !usingContext }">
              <SvgIcon icon="ri:chat-history-line" />
            </span>
          </HoverButton>
          <NAutoComplete v-model:value="prompt" :options="searchOptions" :render-label="renderOption">
            <template #default="{ handleInput, handleBlur, handleFocus }">
              <NInput
                ref="inputRef"
                v-model:value="prompt"
                type="textarea"
                :placeholder="placeholder"
                :autosize="{ minRows: 1, maxRows: isMobile ? 4 : 8 }"
                @input="handleInput"
                @focus="handleFocus"
                @blur="handleBlur"
                @keypress="handleEnter"
              />
            </template>
          </NAutoComplete>
          <NButton type="primary" :disabled="buttonDisabled" @click="handleSubmit">
            <template #icon>
              <span class="dark:text-black">
                <SvgIcon icon="ri:send-plane-fill" />
              </span>
            </template>
          </NButton>
        </div>
      </div>
    </footer>
  </div>
</template>
