import type { ChatMessage, ChatResult, LLMConfig, ProviderType, StreamChunk, ToolDefinition } from './types'
import { createOpenAIProvider } from './openai'
import { createAnthropicProvider } from './anthropic'
import { type ToolHandler, toolRegistry } from './tools'

export type { LLMConfig, ChatMessage, ChatResult, StreamChunk, ToolDefinition, ProviderType }
export { toolRegistry }
export type { ToolHandler }

// Provider interface for dynamic dispatch
interface LLMProvider {
  chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ChatResult>
  streamChat(messages: ChatMessage[], tools?: ToolDefinition[]): AsyncGenerator<StreamChunk>
}

// LLM Client that wraps the provider
class LLMClient {
  private provider: LLMProvider
  private config: LLMConfig

  constructor(provider: LLMProvider, config: LLMConfig) {
    this.provider = provider
    this.config = config
  }

  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ChatResult> {
    return this.provider.chat(messages, tools)
  }

  async *streamChat(messages: ChatMessage[], tools?: ToolDefinition[]): AsyncGenerator<StreamChunk> {
    yield * this.provider.streamChat(messages, tools)
  }

  getConfig(): LLMConfig {
    return this.config
  }
}

// Get default base URL for a provider
function getDefaultBaseURL(provider: ProviderType): string {
  switch (provider) {
    case 'anthropic':
      return 'https://api.anthropic.com/v1'
    case 'ollama':
      return 'http://localhost:11434/v1'
    case 'openrouter':
      return 'https://openrouter.ai/api/v1'
    case 'openai':
    default:
      return 'https://api.openai.com/v1'
  }
}

// Get default model for a provider
function getDefaultModel(provider: ProviderType): string {
  switch (provider) {
    case 'anthropic':
      return 'claude-sonnet-4.5'
    case 'ollama':
      return 'llama3'
    case 'openrouter':
      return 'openai/gpt-4.1'
    case 'openai':
    default:
      return 'gpt-4.1'
  }
}

// Load config from environment variables
function loadConfig(): LLMConfig {
  const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase() as ProviderType

  // Support legacy OpenAI env vars as fallback
  let apiKey = process.env.LLM_API_KEY || ''
  if (!apiKey && process.env.OPENAI_API_KEY)
    apiKey = process.env.OPENAI_API_KEY

  let baseURL = process.env.LLM_BASE_URL || ''
  if (!baseURL && process.env.OPENAI_API_BASE_URL)
    baseURL = process.env.OPENAI_API_BASE_URL

  let model = process.env.LLM_MODEL || ''
  if (!model && process.env.OPENAI_API_MODEL)
    model = process.env.OPENAI_API_MODEL

  const timeout = parseInt(process.env.LLM_TIMEOUT_MS || '90000', 10)
  const temperature = process.env.LLM_TEMPERATURE
    ? parseFloat(process.env.LLM_TEMPERATURE)
    : undefined

  return {
    provider,
    apiKey,
    baseURL: baseURL || getDefaultBaseURL(provider),
    model: model || getDefaultModel(provider),
    timeout,
    temperature,
  }
}

// Validate configuration
function validateConfig(config: LLMConfig): void {
  const errors: string[] = []

  if (!config.apiKey)
    errors.push('LLM_API_KEY is required')

  if (!config.model)
    errors.push('LLM_MODEL is required')

  if (!config.baseURL)
    errors.push('LLM_BASE_URL is required')

  // Special validation for Ollama - apiKey can be empty for local
  if (config.provider === 'ollama') {
    // Ollama is fine without apiKey
  }
  else if (!config.apiKey && !config.baseURL.includes('ollama')) {
    errors.push('LLM_API_KEY is required')
  }

  if (errors.length > 0)
    throw new Error(`LLM configuration error:\n${errors.join('\n')}`)
}

// Create LLM client from config
function createClient(config: LLMConfig): LLMClient {
  let provider: LLMProvider

  switch (config.provider) {
    case 'anthropic':
      provider = createAnthropicProvider(config)
      break
    case 'openai':
    case 'openrouter':
    case 'ollama':
    default:
      provider = createOpenAIProvider(config)
      break
  }

  return new LLMClient(provider, config)
}

// Global client instance
let globalClient: LLMClient | null = null

// Initialize the global client
function initClient(): LLMClient {
  if (globalClient)
    return globalClient

  const config = loadConfig()
  validateConfig(config)
  globalClient = createClient(config)

  return globalClient
}

// Get the global client (initializes if needed)
export function getClient(): LLMClient {
  return globalClient || initClient()
}

// Re-initialize client with new config
export function resetClient(): LLMClient {
  globalClient = null
  return initClient()
}

// Export a simpler interface for chat
export async function chat(
  messages: ChatMessage[],
  tools?: ToolDefinition[],
): Promise<ChatResult> {
  const client = getClient()
  return client.chat(messages, tools)
}

// Export streaming chat
export async function* streamChat(
  messages: ChatMessage[],
  tools?: ToolDefinition[],
): AsyncGenerator<StreamChunk> {
  const client = getClient()
  yield * client.streamChat(messages, tools)
}

// Get available tools
export function getTools(): ToolDefinition[] {
  return toolRegistry.getTools()
}

// Invoke a tool by name
export async function invokeTool(
  name: string,
  args: Record<string, unknown>,
) {
  return toolRegistry.invoke(name, args)
}

// Export config for inspection
export function getConfig(): LLMConfig {
  return getClient().getConfig()
}
