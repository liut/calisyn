declare namespace Chat {

  interface Tool {
    name: string
    arguments?: string
    id?: string
  }

  // 消息段落类型
  type MessageChunkType = 'text' | 'tool_call' | 'think'

  // 消息段落 - 用于流式渲染工具调用和文本的穿插
  interface MessageChunk {
    type: MessageChunkType
    content: string // 文本内容
    toolCalls?: Tool[] // 工具调用信息
    loading?: boolean // 是否正在加载
    collapsed?: boolean // 是否折叠（用于 think 类型）
    thinkDuration?: number // 思考持续时间（秒）
  }

  interface Chat {
    dateTime: string
    text: string
    inversion?: boolean
    error?: boolean
    loading?: boolean
    conversationOptions?: ConversationRequest | null
    requestOptions: { prompt: string, options?: ConversationRequest | null }
    toolCalling?: boolean
    toolCalls?: Tool[]
    chunks?: MessageChunk[] // 消息段落，用于流式渲染工具调用和文本穿插
  }

  interface History {
    title: string
    isEdit: boolean
    csid: string
  }

  interface ChatState {
    active: string | null
    usingContext: boolean
    history: History[]
    chat: { csid: string, data: Chat[] }[]
  }

  interface ConversationRequest {
    conversationId?: string
    parentMessageId?: string
  }

  interface ConversationResponse {
    conversationId: string
    detail: {
      choices: { finish_reason: string, index: number, logprobs: any, text: string }[]
      created: number
      id: string
      model: string
      object: string
      usage: { completion_tokens: number, prompt_tokens: number, total_tokens: number }
    }
    id: string
    parentMessageId: string
    role: string
    text: string
  }
}
