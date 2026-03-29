// LLM Provider Types

export type ProviderType = 'openai' | 'anthropic' | 'openrouter' | 'ollama'

export interface LLMConfig {
  provider: ProviderType
  apiKey: string
  baseURL: string
  model: string
  temperature?: number
  maxTokens?: number
  timeout?: number
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  name?: string // for tool messages
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string // JSON string
  }
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown> // JSON Schema
  }
}

export interface ToolResult {
  content: string
  isError?: boolean
}

export interface ChatResult {
  content: string
  toolCalls?: ToolCall[]
  usage?: Usage
  finishReason?: string
}

export interface StreamChunk {
  delta: string
  done: boolean
  finishReason?: string
  toolCalls?: ToolCall[]
  usage?: Usage
  model?: string
  responseId?: string
}

export interface Usage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface ErrorResponse {
  type: 'Fail'
  message: string
}

export interface SuccessResponse<T> {
  type: 'Success'
  data?: T
  message?: string
}
