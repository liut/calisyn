---
title: Add MCP Client Registry
type: feat
status: active
date: 2026-03-29
---

# Add MCP Client Registry

## Enhancement Summary

**Deepened on:** 2026-03-29
**Research agents used:** framework-docs-researcher, best-practices-researcher, security-sentinel, performance-oracle, kieran-typescript-reviewer, architecture-strategist, code-simplicity-reviewer, agent-native-reviewer

### Key Improvements
1. 简化为单文件 `mcp.ts`（移除不必要的 transport.ts/types.ts）
2. 添加 MCP Server 管理 API（仅动态添加，GET/POST/DELETE /api/mcp/servers）
3. 添加 stdio 传输支持
4. 添加连接健康检查
5. 添加 MCP 工具调用 API（POST /api/mcp/tools/call）
6. 提供测试示例

---

## Overview

为 Calisyn Service 添加 MCP (Model Context Protocol) Client 注册功能，允许连接外部 MCP Server 并将其工具注册到系统工具列表中。

## Problem Statement / Motivation

当前 Calisyn 只有内置的 `web_fetch` 工具。需要扩展工具调用能力，支持连接外部 MCP Server（如官方 MCP Servers、用户自定义服务器等），参考 Morrigan 项目 `pkg/services/tools/registry.go` 的实现模式。

## Proposed Solution

创建 MCP Client Registry 模块，参考 Morrigan 的 Go 实现：
1. 使用 `@modelcontextprotocol/client` SDK
2. 支持 StreamableHTTP、SSE 和 Stdio 三种传输方式
3. 将 MCP Server 的工具注册到现有 toolRegistry
4. 支持 Bearer Token 认证
5. 提供 MCP Server 管理 API（动态添加/移除）

## Technical Approach

### Architecture (Simplified)

```
service/src/llm/
├── tools.ts          # 现有工具注册表（扩展支持 MCP）
└── mcp.ts           # MCP Client Registry 单文件（新增）
```

**Simplification notes** (per code-simplicity review):
- 移除单独的 `transport.ts` - SDK 已经抽象了传输层
- 移除单独的 `types.ts` - 类型简单，内联即可
- 使用单文件 `mcp.ts` 约 150 LOC

### Implementation

**File to create:** `service/src/llm/mcp.ts`

**Key implementation pattern:**

```typescript
import {
  Client,
  StreamableHTTPClientTransport,
  SSEClientTransport,
  StdioClientTransport,
  type AuthProvider,
} from '@modelcontextprotocol/client'

// MCP Server 配置
interface MCPServerConfig {
  name: string
  url: string
  transport: 'streamable' | 'sse' | 'stdio'
  headers?: Record<string, string>  // 静态 headers
}

// MCP Client 连接
interface MCPClientInstance {
  name: string
  client: Client
  tools: Tool[]
}

// MCP Registry 类
class MCPRegistry {
  private servers: Map<string, MCPClientInstance> = new Map()

  // 添加 MCP Server
  async addServer(config: MCPServerConfig): Promise<void>

  // 移除 MCP Server
  async removeServer(name: string): Promise<void>

  // 列出所有已注册工具
  getTools(): ToolDefinition[]

  // 调用 MCP 工具
  async invoke(serverName: string, toolName: string, args: Record<string, unknown>): Promise<ToolResult>

  // 列出所有服务器
  getServers(): MCPServerInfo[]

  // 初始化（启动健康检查）
  async initialize(): Promise<void>

  // 清理
  async close(): Promise<void>
}
```

### MCP SDK Import Pattern

```typescript
import {
  Client,
  StreamableHTTPClientTransport,
  SSEClientTransport,
  StdioClientTransport,
} from '@modelcontextprotocol/client'
```

### Transport Selection

```typescript
private createTransport(config: MCPServerConfig) {
  const url = new URL(config.url)

  switch (config.transport) {
    case 'streamable':
      return new StreamableHTTPClientTransport(url, {
        authProvider: config.headers
          ? { token: async () => config.headers!['Authorization']?.replace('Bearer ', '') || '' }
          : undefined,
      })
    case 'sse':
      return new SSEClientTransport(url)
    case 'stdio':
      // StdioClientTransport 需要 command 和 args
      return new StdioClientTransport({
        command: config.url,  // 或从 config 传入
        args: [],
      })
  }
}
```

### Error Handling Pattern

```typescript
import { ProtocolError, SdkError, SdkErrorCode } from '@modelcontextprotocol/client'

async invoke(serverName: string, toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
  const instance = this.servers.get(serverName)
  if (!instance)
    return { content: `Error: MCP server "${serverName}" not found`, isError: true }

  try {
    const result = await instance.client.callTool(
      { name: toolName, arguments: args },
      { timeout: 60000 }  // 60s 超时
    )

    if (result.isError)
      return { content: `Tool error: ${result.content}`, isError: true }

    return { content: JSON.stringify(result) }
  } catch (error) {
    if (error instanceof ProtocolError)
      return { content: `Protocol error: ${error.message}`, isError: true }
    if (error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout)
      return { content: 'Error: Tool call timed out after 60 seconds', isError: true }
    return { content: `Error: ${error.message}`, isError: true }
  }
}
```

### Tool Name Format

MCP 工具名称格式为 `{serverName}_{toolName}`，通过 serverName 隔离不同 MCP Server：

```typescript
// 注册工具时
const toolKey = `${serverName}_${tool.name}`
toolRegistry.register(
  { type: 'function', function: { name: toolKey, description: tool.description, parameters: tool.inputSchema } },
  async (args) => this.invoke(serverName, tool.name, args)
)
```

### Connection Health Check

```typescript
private async checkConnection(name: string): Promise<boolean> {
  const instance = this.servers.get(name)
  if (!instance) return false

  try {
    await instance.client.request({ method: 'ping' })
    return true
  } catch {
    return false
  }
}

// 定期健康检查（每 30s）
private healthCheckInterval?: NodeJS.Timeout

async initialize(): Promise<void> {
  // 启动健康检查
  this.healthCheckInterval = setInterval(() => {
    this.servers.forEach((_, name) => {
      if (!await this.checkConnection(name))
        console.warn(`MCP server "${name}" health check failed`)
    })
  }, 30000)
}
```

### Integration with ToolRegistry

**Modify `service/src/llm/tools.ts`:**

```typescript
// 添加 MCP 工具注册方法
registerMcpTools(registry: MCPRegistry): void {
  for (const tool of registry.getTools()) {
    // MCP 工具名称已包含 serverName，不会冲突
    this.register(tool.definition, tool.handler)
  }
}
```

**Modify `service/src/llm/index.ts`:**

```typescript
// 初始化时加载 MCP Servers
const mcpRegistry = new MCPRegistry()
await mcpRegistry.initialize()
mcpRegistry.getTools().forEach(tool => toolRegistry.register(tool.definition, tool.handler))

export { mcpRegistry }
```

---

## Alternative Approaches Considered

1. **自己实现 MCP 协议** - 不推荐，工作量大且容易出错
2. **使用其他 MCP SDK** - `@modelcontextprotocol/client` 是官方维护的，是最佳选择
3. **分离 transport.ts** - 不必要，SDK 已经抽象了传输层

---

## System-Wide Impact

### Interaction Graph

- `MCPRegistry` 依赖 `@modelcontextprotocol/client`
- `ToolRegistry` 统一管理内置工具和 MCP 工具
- LLM chat 调用时通过 `toolRegistry.invoke()` 间接调用 MCP 工具

### Error Propagation

- MCP 工具调用失败返回 `{ content: "Error: ...", isError: true }`
- 连接失败记录日志但不阻断主流程
- 工具名冲突返回错误

### State Lifecycle Risks

- MCP Client 连接在服务生命周期内保持
- SSE 连接需要定期健康检查
- 移除 Server 时正确关闭连接并清理工具列表

---

## API Endpoints

### GET /api/mcp/servers

列出所有已配置的 MCP Server：

```json
{
  "servers": [
    { "name": "filesystem", "url": "http://localhost:3001/mcp", "transport": "streamable", "toolCount": 5 }
  ]
}
```

### POST /api/mcp/servers

添加新的 MCP Server：

```json
{
  "name": "filesystem",
  "url": "http://localhost:3001/mcp",
  "transport": "streamable",
  "headers": { "Authorization": "Bearer xxx" }
}
```

### DELETE /api/mcp/servers/:name

移除 MCP Server：

### POST /api/mcp/tools/call

调用 MCP 工具：

```json
{
  "serverName": "filesystem",
  "toolName": "read_file",
  "arguments": { "path": "/tmp/test.txt" }
}
```

### GET /api/mcp/servers/:name/tools

列出指定 MCP Server 提供的工具：

```json
{
  "tools": [
    { "name": "read_file", "description": "Read contents of a file" },
    { "name": "write_file", "description": "Write content to a file" }
  ]
}
```

### GET /api/mcp/tools

列出所有 MCP 工具：

```json
{
  "tools": [
    { "server": "filesystem", "name": "read_file", "description": "Read a file" }
  ]
}
```

---

## Acceptance Criteria

- [ ] 能连接 StreamableHTTP MCP Server 并列出工具
- [ ] 能连接 SSE MCP Server 并列出工具
- [ ] 能连接 Stdio MCP Server 并列出工具（用户要求）
- [ ] MCP 工具可以正常被调用并返回结果
- [ ] 工具名包含 serverName 前缀避免冲突
- [ ] 移除 MCP Server 时正确清理工具列表
- [ ] Bearer Token 认证支持
- [ ] API 端点管理 MCP Servers (GET/POST/DELETE)
- [ ] 连接健康检查
- [ ] 60s 超时配置
- [ ] 单元测试覆盖

---

## Dependencies & Risks

| Dependency | Risk | Mitigation |
|------------|------|------------|
| `@modelcontextprotocol/client` | 版本更新 API 变化 | 锁定次版本号 |
| MCP Server 可用性 | Server 挂了影响工具调用 | 降级处理，返回友好错误 |
| SSE 连接 | 长时间连接可能断联 | 定期健康检查 |

---

## Security Checklist

| Category | Item |
|----------|------|
| Input | 验证工具名称格式 `/^[a-zA-Z0-9_-]+$/` |
| Resource | MCP 连接超时 60s |
| Resource | 最大 MCP Servers 限制 10 个 |
| Tool Names | 工具名包含 serverName 隔离不同 MCP Server |
| Error | 对外返回简化错误，内部记录详细日志 |

---

## Performance Considerations

| Issue | Mitigation |
|-------|------------|
| 工具列表频繁调用 | 工具列表缓存在 registry 中 |
| SSE 连接长时间占用 | 定期健康检查，断开时重连 |
| 并发工具调用 | 使用 Map 存储服务器实例，无锁需求（JS 单线程） |
| 内存泄漏 | 正确清理 SSE 事件监听器 |

---

## Test Examples

### 1. 添加 MCP Server (StreamableHTTP)

```bash
curl -X POST http://localhost:3002/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "filesystem",
    "url": "http://localhost:3001/mcp",
    "transport": "streamable",
    "headers": {
      "Authorization": "Bearer your-token-here"
    }
  }'
```

预期响应：
```json
{
  "success": true,
  "server": {
    "name": "filesystem",
    "url": "http://localhost:3001/mcp",
    "transport": "streamable",
    "toolCount": 5
  }
}
```

### 2. 列出所有 MCP Server

```bash
curl http://localhost:3002/api/mcp/servers
```

预期响应：
```json
{
  "servers": [
    {
      "name": "filesystem",
      "url": "http://localhost:3001/mcp",
      "transport": "streamable",
      "toolCount": 5
    }
  ]
}
```

### 3. 列出 MCP Server 提供的工具

```bash
curl http://localhost:3002/api/mcp/servers/filesystem/tools
```

预期响应：
```json
{
  "tools": [
    { "name": "read_file", "description": "Read contents of a file" },
    { "name": "write_file", "description": "Write content to a file" }
  ]
}
```

### 4. 调用 MCP 工具

```bash
curl -X POST http://localhost:3002/api/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "serverName": "filesystem",
    "toolName": "read_file",
    "arguments": { "path": "/tmp/test.txt" }
  }'
```

预期响应：
```json
{
  "content": "file contents here...",
  "isError": false
}
```

### 5. 移除 MCP Server

```bash
curl -X DELETE http://localhost:3002/api/mcp/servers/filesystem
```

预期响应：
```json
{
  "success": true
}
```

### 6. 工具名冲突测试

添加与内置工具同名的 MCP 工具应被允许（通过 serverName 前缀隔离）：

```bash
curl -X POST http://localhost:3002/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "fileserver",
    "url": "http://localhost:3002/mcp",
    "transport": "streamable"
  }'
# MCP 工具名会是 fileserver_web_fetch，不会冲突
```

---

## Sources & References

- **MCP TypeScript SDK**: https://github.com/modelcontextprotocol/typescript-sdk
- **MCP Protocol Spec**: https://spec.modelcontextprotocol.io
- **Client Guide**: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md
- **Official MCP Servers**: https://github.com/modelcontextprotocol/servers (可用于测试)
- **Morrigan Registry (Go)**: `/Users/liutao/workspace/ai/morrigan/pkg/services/tools/registry.go`
