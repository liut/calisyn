import type { AxiosProgressEvent, GenericAbortSignal } from 'axios'
import { SSE } from 'sse.js'
import { get, post } from '@/utils/request'
import request from '@/utils/request/axios'
import { useAuthStore, useSettingStore } from '@/store'

export function authLogout() {
  return get({
    url: '/auth/logout',
  })
}

export function fetchChatAPI<T = unknown>(
  prompt: string,
  options?: { conversationId?: string; parentMessageId?: string },
  signal?: GenericAbortSignal,
) {
  return post<T>({
    url: '/chat',
    data: { prompt, options },
    signal,
  })
}

export function fetchChatConfig<T = unknown>() {
  return post<T>({
    url: '/config',
  })
}

export interface Function {
  arguments?: string
  name?: string
}

export interface ToolCall {
  index: number
  id?: string
  function?: Function
  type?: 'function'
}
export interface StreamMessage {
  id: string
  csid?: string
  pmid?: string
  delta: string
  text?: string
  tool_calls?: Array<ToolCall>
  finishReason?: string
}

/**
 * 建立与服务器的SSE连接，获取聊天流式响应
 * @param params 请求参数和回调函数
 * @returns 返回一个包含close方法的对象，用于手动关闭连接
 */
export function fetchChatStream(
  params: {
    prompt: string
    csid?: string
    options?: { conversationId?: string; parentMessageId?: string }
    regen?: boolean
    onAbort?: (event: Event) => void
    onError?: (event: Event) => void
    onMessage: (msg: StreamMessage) => void
    signal?: GenericAbortSignal
    retries?: number // 重试次数，默认为0
  },
) {
  // 初始化参数
  const {
    prompt,
    regen,
    onMessage,
    onError,
    onAbort,
    signal,
    retries = 0,
  } = params

  let csid = params.csid || params.options?.conversationId || ''
  let currentRetry = 0
  let eventSource: InstanceType<typeof SSE> | null = null

  // 准备请求头
  const headers: { [key: string]: string } = { 'Content-Type': 'application/json' }
  const settingStore = useSettingStore()
  const token = useAuthStore().token
  if (token)
    headers.Authorization = `Bearer ${token}`

  const apiPath = import.meta.env.VITE_API_PATH || '/api'

  // 创建并配置SSE连接
  const createEventSource = () => {
    eventSource = new SSE(`${apiPath}/chat-sse`, {
      headers,
      payload: JSON.stringify({
        csid,
        prompt,
        options: params.options,
        regen,
        systemMessage: settingStore.systemMessage,
        temperature: settingStore.temperature,
        top_p: settingStore.top_p,
      }),
    })

    // 处理消息接收
    const receiveMessage = (e: MessageEvent) => {
      // 如果没有会话ID且响应头中包含会话ID，则更新会话ID
      if (!csid && eventSource?.xhr)
        csid = eventSource.xhr.getResponseHeader('Conversation-Id')

      // 忽略空消息和结束标记
      if (e.data.length === 0 || e.data === '[DONE]')
        return

      // 解析响应数据
      const cr = JSON.parse(e.data) // sse data as chatResponse

      // 兼容旧版响应格式
      if (cr.choices && cr.choices.length > 0)
        cr.delta = cr.choices[0].delta.content

      // 确保响应中包含会话ID
      if (csid && !cr.csid)
        cr.csid = csid

      // 调用消息回调
      onMessage(cr)
    }

    // 处理错误
    const handleError = (event: Event) => {
      // 检查状态码，如果是401（未授权），则刷新页面
      if (eventSource?.xhr?.status === 401) {
        console.warn('Authentication failed (401), refreshing page...')
        window.location.reload()
        return
      }

      // 尝试重试连接
      if (currentRetry < retries) {
        currentRetry++
        console.warn(`SSE connection error, retrying (${currentRetry}/${retries})...`)

        // 清理旧连接
        if (eventSource) {
          eventSource.close()
          eventSource = null
        }

        // 延迟重试
        setTimeout(createEventSource, 1000 * currentRetry)
        return
      }

      // 如果提供了错误回调，则调用它
      if (onError)
        onError(event)
    }

    // 添加事件监听器
    eventSource.addEventListener('message', receiveMessage)
    eventSource.addEventListener('error', handleError)

    // 处理中止事件
    if (onAbort)
      eventSource.addEventListener('abort', onAbort)
    else if (signal)
      eventSource.addEventListener('abort', signal.onabort)

    // 启动流
    eventSource.stream()
  }

  // 初始化连接
  createEventSource()

  // 返回一个包含close方法的对象，用于手动关闭连接
  return {
    close: () => {
      if (eventSource) {
        eventSource.close()
        eventSource = null
      }
    },
  }
}

// Deprecated: by fetchChatStream
export function fetchChatAPIProcess<T = unknown>(
  params: {
    prompt: string
    options?: { conversationId?: string; parentMessageId?: string }
    signal?: GenericAbortSignal
    onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void
  },
) {
  const settingStore = useSettingStore()
  const authStore = useAuthStore()

  let data: Record<string, unknown> = {
    prompt: params.prompt,
    options: params.options,
  }

  if (authStore.isChatGPTAPI) {
    data = {
      ...data,
      systemMessage: settingStore.systemMessage,
      temperature: settingStore.temperature,
      top_p: settingStore.top_p,
    }
  }

  return post<T>({
    url: '/chat-process',
    data,
    signal: params.signal,
    onDownloadProgress: params.onDownloadProgress,
  })
}

export function fetchSession<T>() {
  return get<T>({
    url: '/session',
  })
}

export function fetchVerify<T>(token: string) {
  return post<T>({
    url: '/verify',
    data: { token },
  })
}

export function fetchConversationTitle<T = unknown>(csid: string) {
  return request({
    url: `/conversation/${csid}/title`,
    method: 'PATCH',
  })
}
