import type { ChatMessage, ChatResult, LLMConfig, StreamChunk, ToolDefinition } from './types'

// Anthropic provider for Claude models
export class AnthropicProvider {
  constructor(private config: LLMConfig) {}

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): Promise<ChatResult> {
    const url = `${this.config.baseURL}/messages`

    const { messages: chatMessages, systemPrompt } = this.extractSystemMessage(messages)

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: chatMessages,
      max_tokens: this.config.maxTokens || 4096,
    }

    if (systemPrompt)
      body.system = systemPrompt

    if (tools && tools.length > 0)
      body.tools = this.formatTools(tools)

    if (this.config.temperature !== undefined)
      body.temperature = this.config.temperature

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Anthropic API error: ${response.status} - ${error}`)
    }

    const data = await response.json() as {
      content?: Array<{ type: string; text?: string }>
      stop_reason?: string
      usage?: { input_tokens: number; output_tokens: number }
    }

    let content = ''
    let finishReason: string | undefined

    if (data.content) {
      for (const block of data.content) {
        if (block.type === 'text' && block.text)
          content += block.text
      }
    }

    if (data.stop_reason)
      finishReason = data.stop_reason

    const usage = data.usage
      ? {
          inputTokens: data.usage.input_tokens || 0,
          outputTokens: data.usage.output_tokens || 0,
          totalTokens: data.usage.input_tokens + (data.usage.output_tokens || 0),
        }
      : undefined

    return { content, finishReason, usage }
  }

  async *streamChat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): AsyncGenerator<StreamChunk> {
    const url = `${this.config.baseURL}/messages`

    const { messages: chatMessages, systemPrompt } = this.extractSystemMessage(messages)
    const formattedMessages = this.formatMessages(chatMessages)

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: formattedMessages,
      stream: true,
      max_tokens: this.config.maxTokens || 4096,
    }

    if (systemPrompt)
      body.system = systemPrompt

    if (tools && tools.length > 0)
      body.tools = this.formatTools(tools)

    if (this.config.temperature !== undefined)
      body.temperature = this.config.temperature

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Anthropic API error: ${response.status} - ${error}`)
    }

    if (!response.body)
      throw new Error('No response body')

    const decoder = new SSEDecoder()

    const stream = response.body as unknown as ReadableStream<Uint8Array>
    const reader = stream.getReader()
    const textDecoder = new TextDecoder()
    let buffer = ''

    // Tool call state
    const toolCalls: { id: string; name: string; input: string }[] = []
    let currentToolCall: { id?: string; name?: string; input?: string } | null = null
    let inToolUse = false

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done)
          break

        const chunk = textDecoder.decode(value, { stream: true })
        buffer += chunk

        // Split by newlines and process
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const sse = decoder.decode(line)
          if (!sse)
            continue

          if (sse.event === 'error')
            throw new Error(`Anthropic stream error: ${sse.data}`)

          if (sse.event === 'content_block_start') {
            try {
              const parsed = JSON.parse(sse.data)
              if (parsed.type === 'content_block_start') {
                const block = parsed.content_block
                if (block?.type === 'tool_use') {
                  inToolUse = true
                  currentToolCall = {
                    id: block.id,
                    name: block.name,
                  }
                }
              }
            }
            catch {
              // Skip invalid JSON
            }
          }

          if (sse.event === 'content_block_delta') {
            try {
              const parsed = JSON.parse(sse.data)
              if (parsed.type === 'content_block_delta') {
                // Text delta
                if (parsed.delta?.type === 'text_delta' && parsed.delta?.text)
                  yield { delta: parsed.delta.text, done: false }

                // Tool use delta
                if (parsed.delta?.type === 'input_json_delta' && parsed.delta?.partial_json) {
                  currentToolCall = currentToolCall || {}
                  currentToolCall.input = (currentToolCall.input || '') + parsed.delta.partial_json
                }
              }
            }
            catch {
              // Skip invalid JSON
            }
          }

          if (sse.event === 'content_block_stop') {
            if (inToolUse && currentToolCall?.id && currentToolCall?.name && currentToolCall?.input) {
              toolCalls.push({
                id: currentToolCall.id,
                name: currentToolCall.name,
                input: currentToolCall.input,
              })
            }
            inToolUse = false
            currentToolCall = null
          }

          if (sse.event === 'message_delta') {
            try {
              const parsed = JSON.parse(sse.data)
              let usage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined
              let finishReason: string | undefined

              if (parsed.delta?.stop_reason)
                finishReason = parsed.delta.stop_reason

              if (parsed.usage) {
                usage = {
                  inputTokens: parsed.usage.input_tokens || 0,
                  outputTokens: parsed.usage.output_tokens || 0,
                  totalTokens: parsed.usage.input_tokens + (parsed.usage.output_tokens || 0),
                }
              }

              // If we have tool calls and stop_reason is 'tool_use', emit them
              if (toolCalls.length > 0 && finishReason === 'tool_use') {
                const formattedToolCalls = toolCalls.map((tc, i) => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: {
                    name: tc.name,
                    arguments: tc.input,
                  },
                }))
                yield { delta: '', done: true, finishReason, toolCalls: formattedToolCalls, usage }
                return
              }

              yield { delta: '', done: false, finishReason, usage }
            }
            catch {
              // Skip invalid JSON
            }
          }

          if (sse.event === 'message_stop') {
            yield { delta: '', done: true }
            return
          }
        }
      }
    }
    finally {
      reader.releaseLock()
    }
  }

  private formatMessages(messages: ChatMessage[]): Record<string, unknown>[] {
    return messages
      .filter(msg => msg.role !== 'system')
      .map((msg) => {
        if (msg.role === 'tool') {
          return {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: msg.toolCallId,
                content: msg.content,
              },
            ],
          }
        }

        if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
          // Format assistant message with tool_use content blocks for Anthropic
          const content: Record<string, unknown>[] = []
          for (const tc of msg.toolCalls) {
            let input = {}
            try {
              input = JSON.parse(tc.function.arguments)
            }
            catch { /* ignore */ }
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input,
            })
          }
          return {
            role: 'assistant',
            content,
          }
        }

        return {
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        }
      })
  }

  private extractSystemMessage(messages: ChatMessage[]): { messages: ChatMessage[]; systemPrompt?: string } {
    const systemParts: string[] = []
    const otherMessages: ChatMessage[] = []

    for (const msg of messages) {
      if (msg.role === 'system' && msg.content.trim())
        systemParts.push(msg.content)

      else
        otherMessages.push(msg)
    }

    return {
      messages: otherMessages,
      systemPrompt: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    }
  }

  private formatTools(tools: ToolDefinition[]): Record<string, unknown>[] {
    return tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description || '',
      input_schema: tool.function.parameters,
    }))
  }
}

// SSE Decoder for Anthropic streaming responses
class SSEDecoder {
  private event = ''
  private data = ''
  private chunks: string[] = []

  decode(line: string): { event: string; data: string; raw: string[] } | undefined {
    if (line.startsWith(':')) {
      // Skip comments
      return undefined
    }

    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) {
      // Empty line signals end of event
      if (this.event || this.data) {
        const result = { event: this.event, data: this.data, raw: this.chunks }
        this.event = ''
        this.data = ''
        this.chunks = []
        return result
      }
      return undefined
    }

    const field = line.slice(0, colonIndex)
    const value = line.slice(colonIndex + 1).trimStart()

    if (field === 'event') {
      this.event = value
    }
    else if (field === 'data') {
      this.data = value
      this.chunks.push(value)
    }

    return undefined
  }
}

// Factory function to create Anthropic provider
export function createAnthropicProvider(config: LLMConfig): AnthropicProvider {
  return new AnthropicProvider(config)
}
