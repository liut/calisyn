export interface RequestProps {
  csid?: string
  prompt: string
  options?: ChatContext
  systemMessage?: string
  stream?: boolean
}

export interface ChatContext {
  conversationId?: string
  parentMessageId?: string
}

export interface ModelConfig {
  provider?: string
  model?: string
  reverseProxy?: string
  timeoutMs?: number
  socksProxy?: string
  httpsProxy?: string
  usage?: string
}

export interface User {
  uid?: string
  name?: string
  avatar?: string
  hit?: number
}
