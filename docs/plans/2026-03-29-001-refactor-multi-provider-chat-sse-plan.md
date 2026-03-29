---
title: 重构 /api/chat-sse 支持多 LLM 厂商
type: refactor
status: active
date: 2026-03-29
---

# 重构 /api/chat-sse 支持多 LLM 厂商

## Overview

将 `service/src` 的 `/api/chat-sse` 接口从当前的单provider（WebAccessToken/Official API）架构重构为支持多厂商切换的架构，参考 morrigan Go 后端的实现模式。

## Problem Statement

当前实现问题：
1. **单 provider 锁定**：只能在启动时通过 `OPENAI_API_KEY` 或 `OPENAI_ACCESS_TOKEN` 二选一
2. **不支持 WebAccessToken**：用户明确不再需要 WebAccessToken 支持
3. **不支持多厂商**：无法切换到 Anthropic等其他 LLM 厂商
4. **缺乏工具调用循环**：morrigan 支持的 tool calling self-loop 功能在当前 service 不存在
5. **缺少 stream 参数**：`/api/chat` 不支持 `stream` 参数实现 SSE 效果
6. **缺少 web_fetch 工具**：LLM 无法获取实时网页内容

## Proposed Solution

### Phase 1: 多厂商 Provider 架构（本期实现）

参考 morrigan 的 provider 模式，设计简化版本：

```
service/src/llm/
├── index.ts          # 统一的 client 接口和工厂函数
├── openai.ts         # OpenAI 兼容 provider（官方 API、OpenRouter、Ollama）
├── anthropic.ts      # Anthropic provider
├── tools.ts          # 工具注册和调用（web_fetch）
└── types.ts          # 通用类型定义
```

### Phase 1.5: web_fetch 工具实现（本期实现）

参考 morrigan `pkg/services/tools/invokers.go` 的 `callFetch`，实现简化的网页抓取工具：

```typescript
// service/src/llm/tools.ts
interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: object // JSON Schema
  }
}

interface ToolResult {
  content: string
  isError?: boolean
}

// web_fetch 工具定义
const webFetchTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_fetch',
    description: 'Fetch web page content from a URL. Returns the page content as text.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch' },
        max_length: { type: 'number', description: 'Maximum content length (default: 5000)' },
        start_index: { type: 'number', description: 'Start index for pagination (default: 0)' },
      },
      required: ['url']
    }
  }
}

// 调用示例
async function invokeWebFetch(url: string, maxLength = 5000, startIndex = 0): Promise<ToolResult>
```

**环境变量配置**：

| 变量 | 说明 | 示例 |
|------|------|------|
| `LLM_PROVIDER` | 厂商类型 | `openai`、`anthropic`、`openrouter`、`ollama` |
| `LLM_API_KEY` | API Key | `sk-xxx` 或 `ollama`（本地模型可为空） |
| `LLM_BASE_URL` | API 端点 | `https://api.openai.com/v1` 或 `http://localhost:11434/v1` |
| `LLM_MODEL` | 模型名称 | `gpt-4`、`claude-3-sonnet`、`llama3` |

**Provider 选择逻辑**（参考 morrigan `client.go:44-54`）：
```typescript
switch (provider.toLowerCase()) {
  case '', 'openai', 'openrouter', 'ollama':
    return new OpenAIProvider(config)
  case 'anthropic':
    return new AnthropicProvider(config)
  default:
    throw new Error(`Unsupported provider: ${provider}`)
}
```

### Phase 2: 工具调用循环框架（后续工作）

设计框架但暂不实现（需要另行规划）：
- 工具注册机制（本期仅实现 web_fetch）
- 循环迭代控制（maxIterations）
- 历史消息累积

## Technical Approach

### 目录结构

```
service/src/
├── llm/
│   ├── index.ts        # Client interface, factory, exports
│   ├── openai.ts       # OpenAI-compatible provider
│   ├── anthropic.ts    # Anthropic provider
│   └── types.ts        # Shared types
├── chatgpt/            # 保留（可能重构或删除）
├── middleware/
├── utils/
├── index.ts            # 更新 import 路径
└── types.ts            # 更新 RequestProps
```

### 类型设计

```typescript
// service/src/llm/types.ts
export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'openrouter' | 'ollama'
  apiKey: string
  baseURL: string
  model: string
  temperature?: number
  maxTokens?: number
  timeout?: number
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string // JSON string
  }
}

export interface StreamChunk {
  delta: string
  done: boolean
  finishReason?: string
  toolCalls?: ToolCall[]
  usage?: Usage
}

export interface Usage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}
```

### Provider 接口

```typescript
// service/src/llm/index.ts
export interface LLMClient {
  chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ChatResult>
  streamChat(messages: ChatMessage[], tools?: ToolDefinition[]): AsyncGenerator<StreamChunk>
}

export function createLLMClient(config: LLMConfig): LLMClient
```

### 环境变量加载

```typescript
// service/src/llm/index.ts
function loadConfig(): LLMConfig {
  const provider = process.env.LLM_PROVIDER || 'openai'
  const apiKey = process.env.LLM_API_KEY || ''
  const baseURL = process.env.LLM_BASE_URL || getDefaultURL(provider)
  const model = process.env.LLM_MODEL || getDefaultModel(provider)

  return { provider, apiKey, baseURL, model, timeout: 90000 }
}

function getDefaultURL(provider: string): string {
  switch (provider) {
    case 'anthropic':
      return 'https://api.anthropic.com/v1'
    case 'ollama':
      return 'http://localhost:11434/v1'
    default:
      return 'https://api.openai.com/v1'
  }
}
```

### API 路由更新

**统一 `/api/chat` 接口**：
- 支持 `stream` bool 参数，为 `true` 时效果同 `/api/chat-sse`
- `/api/chat-sse` 保留作为别名路由

```typescript
// service/src/index.ts
interface ChatRequest {
  csid?: string
  prompt: string
  options?: ChatContext
  systemMessage?: string
  stream?: boolean  // 新增：true 时返回 SSE
}

// POST /api/chat
router.post('/chat', [auth, limiter], async (req, res) => {
  const { csid, prompt, options = {}, systemMessage, stream = false } = req.body as ChatRequest

  if (stream) {
    // SSE 模式：复用 chat-sse 逻辑
    return handleSSEChat(req, res, { csid, prompt, options, systemMessage })
  }

  // 非流式模式：直接返回完整响应
  try {
    const messages: ChatMessage[] = []
    if (systemMessage)
      messages.push({ role: 'system', content: systemMessage })
    messages.push({ role: 'user', content: prompt })

    const result = await llmClient.chat(messages)
    res.json({ type: 'Success', data: { text: result.content } })
  }
  catch (error: any) {
    res.json({ type: 'Fail', message: error.message })
  }
})

```

## Backward Compatibility

保留现有环境变量映射：
- `OPENAI_API_KEY` → `LLM_API_KEY` (当 `LLM_PROVIDER=openai` 时)
- `OPENAI_API_BASE_URL` → `LLM_BASE_URL`
- `OPENAI_API_MODEL` → `LLM_MODEL`

## Files to Modify

| File | Change |
|------|--------|
| `service/src/llm/index.ts` | 新增：Client 接口、工厂函数、配置加载 |
| `service/src/llm/types.ts` | 新增：通用类型定义 |
| `service/src/llm/openai.ts` | 新增：OpenAI 兼容 provider |
| `service/src/llm/anthropic.ts` | 新增：Anthropic provider |
| `service/src/llm/tools.ts` | 新增：工具注册和 web_fetch 实现 |
| `service/src/index.ts` | 修改：更新 import、`/api/chat`（新增 stream 参数）、`/api/chat-sse` 路由 |
| `service/src/types.ts` | 修改：`RequestProps` 移除 `temperature/top_p`，新增 `stream` |

## Files to Remove

| File | Reason |
|------|--------|
| `service/src/chatgpt/index.ts` | 重构后不再需要，被 `llm/` 替代 |
| `service/src/chatgpt/types.ts` | 类型已移至 `llm/types.ts` |

## Dependencies

新增依赖：
- `isomorphic-fetch`（已存在）
- 移除 `chatgpt` npm 包依赖（不再使用）

## Acceptance Criteria

- [ ] `LLM_PROVIDER=openai` 时，使用 OpenAI API
- [ ] `LLM_PROVIDER=anthropic` 时，使用 Anthropic API
- [ ] `LLM_PROVIDER=openrouter` 时，使用 OpenRouter
- [ ] `LLM_PROVIDER=ollama` 时，连接本地 Ollama
- [ ] `/api/chat-sse` 返回 SSE 格式流式响应
- [ ] `/api/chat` 支持 `stream: true` 参数，效果与 `/api/chat-sse` 相同
- [ ] 响应格式兼容现有前端 `StreamMessage` 结构
- [ ] 移除 WebAccessToken 相关代码
- [ ] web_fetch 工具可被 LLM 调用，返回网页文本内容
- [ ] API路径前缀可通过 `API_PREFIX` 环境变量定制
- [ ] 单元测试覆盖 provider 工厂函数

## Success Metrics

1. 可以通过修改 `LLM_PROVIDER` 环境变量切换不同厂商
2. 无需代码修改即可在 OpenAI 和 Anthropic 之间切换
3. `/api/chat-sse` 接口行为与重构前一致（流式响应、基本错误处理）
4. 当检测到LLM相关配置不完整时，启动要报出详细错误
5. API路径前缀可通过 `API_PREFIX` 环境变量定制（如 `/apm/other`）

## Phase 2 预留（工具调用循环框架）

以下为预留设计点，本期不实现：

### 工具调用循环设计

```typescript
// 预留接口
interface ToolRegistry {
  register(name: string, handler: ToolHandler): void
  invoke(name: string, params: object): Promise<object>
}

interface ToolCallExecutor {
  executeToolCalls(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    maxIterations: number
  ): AsyncGenerator<ExecutionStep>
}
```

### 历史消息管理设计

```typescript
// 预留接口
interface ConversationStore {
  getHistory(conversationId: string): Promise<ChatMessage[]>
  addMessage(conversationId: string, message: ChatMessage): Promise<void>
  save(conversationId: string): Promise<void>
}
```

---

## Sources

- **Reference implementation**: `../morrigan/pkg/services/llm/` — Provider 架构、工厂模式、环境变量命名
- **web_fetch tool**: `../morrigan/pkg/services/tools/invokers.go` — `callFetch` 函数实现参考
- **Current implementation**: `./service/src/index.ts` — `/api/chat-sse` 现有实现
