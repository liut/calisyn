import type { ChatMessage, ChatResult, LLMConfig, StreamChunk, ToolDefinition } from './types'

// OpenAI-compatible provider for official API, OpenRouter, Ollama
export class OpenAIProvider {
  constructor(private config: LLMConfig) {}

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): Promise<ChatResult> {
    const response = await this.sendRequest(messages, tools, false)
    return this.parseResponse(response)
  }

  async *streamChat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): AsyncGenerator<StreamChunk> {
    const url = `${this.config.baseURL}/chat/completions`

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: this.formatMessages(messages),
      stream: true,
    }

    if (tools && tools.length > 0)
      body.tools = tools

    if (this.config.temperature !== undefined)
      body.temperature = this.config.temperature

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error: ${response.status} - ${error}`)
    }

    if (!response.body)
      throw new Error('No response body')

    const reader = response.body.getReader()
    const textDecoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''
    const toolCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] = []
    let currentToolCall: { index: number; id?: string; name?: string; arguments?: string } | null = null

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done)
          break

        buffer += textDecoder.decode(value, { stream: true })

        // Process complete lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: '))
            continue

          const data = line.slice(6)
          if (data === '[DONE]') {
            // Flush any remaining tool call
            if (currentToolCall && currentToolCall.id && currentToolCall.name) {
              toolCalls.push({
                id: currentToolCall.id,
                type: 'function',
                function: { name: currentToolCall.name!, arguments: currentToolCall.arguments || '' },
              })
            }
            if (toolCalls.length > 0)
              yield { delta: '', done: true, finishReason: 'tool_calls', toolCalls }

            return
          }

          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            const finishReason = parsed.choices?.[0]?.finish_reason

            // Handle content delta
            if (delta?.content) {
              fullContent += delta.content
              yield { delta: delta.content, done: false }
            }

            // Handle tool_call delta
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const tcIndex = tc.index || 0

                // Start new tool call if index changed
                if (!currentToolCall || currentToolCall.index !== tcIndex) {
                  if (currentToolCall && currentToolCall.id && currentToolCall.name) {
                    toolCalls.push({
                      id: currentToolCall.id,
                      type: 'function',
                      function: { name: currentToolCall.name!, arguments: currentToolCall.arguments || '' },
                    })
                  }
                  currentToolCall = { index: tcIndex }
                }

                if (tc.id)
                  currentToolCall.id = tc.id
                if (tc.function?.name)
                  currentToolCall.name = tc.function.name
                if (tc.function?.arguments)
                  currentToolCall.arguments = (currentToolCall.arguments || '') + tc.function.arguments
              }
            }

            // Handle finish
            if (finishReason) {
              // Flush any remaining tool call
              if (currentToolCall && currentToolCall.id && currentToolCall.name) {
                toolCalls.push({
                  id: currentToolCall.id,
                  type: 'function',
                  function: { name: currentToolCall.name!, arguments: currentToolCall.arguments || '' },
                })
              }

              // Return tool calls if we have any
              if (toolCalls.length > 0) {
                yield { delta: '', done: true, finishReason: 'tool_calls', toolCalls }
                return
              }

              // No tool calls, just content
              if (finishReason === 'stop' && fullContent)
                yield { delta: '', done: true, finishReason: 'stop' }
            }
          }
          catch {
            // Skip invalid JSON
          }
        }
      }
    }
    finally {
      reader.releaseLock()
    }
  }

  private formatMessages(messages: ChatMessage[]): Record<string, unknown>[] {
    return messages.map((msg) => {
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        // Format assistant message with tool_calls for OpenAI
        return {
          role: 'assistant',
          content: msg.content || '',
          tool_calls: msg.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        }
      }

      if (msg.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: msg.toolCallId,
          content: msg.content,
        }
      }

      return {
        role: msg.role,
        content: msg.content,
      }
    })
  }

  private async parseResponse(response: Response): Promise<ChatResult> {
    const data = await response.json()

    const content = data.choices?.[0]?.message?.content || ''
    const finishReason = data.choices?.[0]?.finish_reason

    let toolCalls
    if (data.choices?.[0]?.message?.tool_calls) {
      toolCalls = data.choices[0].message.tool_calls.map((tc: any) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }))
    }

    const usage = data.usage
      ? {
          inputTokens: data.usage.prompt_tokens || 0,
          outputTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0,
        }
      : undefined

    return { content, finishReason, toolCalls, usage }
  }
}

// Factory function to create OpenAI provider
export function createOpenAIProvider(config: LLMConfig): OpenAIProvider {
  return new OpenAIProvider(config)
}
