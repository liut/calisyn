import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { AuthProvider, Tool } from '@modelcontextprotocol/sdk/client/index.js'
import type { ToolDefinition, ToolResult } from './types'

// MCP Server 配置
export interface MCPServerConfig {
  name: string
  url?: string // 用于 streamable/sse
  transport: 'streamable' | 'sse' | 'stdio'
  headers?: Record<string, string>
  // 用于 stdio
  command?: string
  args?: string[]
}

// MCP Client 连接
interface MCPClientInstance {
  name: string
  url?: string
  transport: 'streamable' | 'sse' | 'stdio'
  client: Client
  tools: Tool[]
  toolNames: string[]
}

// 服务器信息
export interface MCPServerInfo {
  name: string
  url?: string
  transport: 'streamable' | 'sse' | 'stdio'
  toolCount: number
}

// MCP 工具处理器
export interface MCPToolHandler {
  definition: ToolDefinition
  serverName: string
  invoke: (args: Record<string, unknown>) => Promise<ToolResult>
}

// MCP Registry 类
export class MCPRegistry {
  private servers: Map<string, MCPClientInstance> = new Map()
  private toolHandlers: Map<string, MCPToolHandler> = new Map()
  private healthCheckInterval?: NodeJS.Timeout

  // 最大服务器数量限制
  private readonly MAX_SERVERS = 10

  // 添加 MCP Server
  async addServer(config: MCPServerConfig): Promise<{ success: boolean; error?: string; toolCount?: number }> {
    // 检查服务器数量限制
    if (this.servers.size >= this.MAX_SERVERS)
      return { success: false, error: `Maximum number of MCP servers (${this.MAX_SERVERS}) reached` }

    // 检查是否已存在
    if (this.servers.has(config.name))
      return { success: false, error: `MCP server "${config.name}" already exists` }

    try {
      const transport = await this.createTransport(config)
      const client = new Client({ name: `calisyn-${config.name}`, version: '1.0.0' })

      await client.connect(transport)

      // 获取工具列表
      const { tools } = await client.listTools()

      // 注册工具
      const toolNames: string[] = []
      for (const tool of tools) {
        const toolKey = `${config.name}_${tool.name}`

        // 检查工具名是否与内置工具冲突
        if (tool.name === 'web_fetch') {
          console.warn(`[MCP] Skipping tool "${tool.name}" from "${config.name}" - conflicts with built-in tool`)
          continue
        }

        this.toolHandlers.set(toolKey, {
          definition: {
            type: 'function',
            function: {
              name: toolKey,
              description: tool.description,
              parameters: tool.inputSchema as Record<string, unknown>,
            },
          },
          serverName: config.name,
          invoke: async (args) => {
            return this.invokeTool(config.name, tool.name, args)
          },
        })
        toolNames.push(tool.name)
      }

      // 保存客户端实例
      this.servers.set(config.name, {
        name: config.name,
        url: config.url,
        transport: config.transport,
        client,
        tools,
        toolNames,
      })

      // eslint-disable-next-line no-console
      console.info(`[MCP] Server "${config.name}" added with ${toolNames.length} tools`)
      return { success: true, toolCount: toolNames.length }
    }
    catch (error: any) {
      console.error(`[MCP] Failed to add server "${config.name}":`, error.message)
      return { success: false, error: error.message }
    }
  }

  // 创建传输层
  private async createTransport(config: MCPServerConfig) {
    const authProvider: AuthProvider | undefined = config.headers
      ? {
          token: async () => config.headers!.Authorization?.replace('Bearer ', '') || '',
        }
      : undefined

    switch (config.transport) {
      case 'streamable':
        if (!config.url)
          throw new Error('url is required for streamable transport')
        return new StreamableHTTPClientTransport(new URL(config.url), { authProvider })

      case 'sse':
        if (!config.url)
          throw new Error('url is required for sse transport')
        return new SSEClientTransport(new URL(config.url))

      case 'stdio':
        if (!config.command)
          throw new Error('command is required for stdio transport')
        return new StdioClientTransport({
          command: config.command,
          args: config.args || [],
        })

      default:
        throw new Error(`Unsupported transport type: ${config.transport}`)
    }
  }

  // 移除 MCP Server
  async removeServer(name: string): Promise<{ success: boolean; error?: string }> {
    const instance = this.servers.get(name)
    if (!instance)
      return { success: false, error: `MCP server "${name}" not found` }

    // 关闭连接
    try {
      await instance.client.close()
    }
    catch (error: any) {
      console.warn(`[MCP] Error closing client for "${name}":`, error.message)
    }

    // 清理工具处理器
    for (const toolName of instance.toolNames) {
      const toolKey = `${name}_${toolName}`
      this.toolHandlers.delete(toolKey)
    }

    this.servers.delete(name)
    // eslint-disable-next-line no-console
    console.info(`[MCP] Server "${name}" removed`)
    return { success: true }
  }

  // 列出所有已注册工具
  getTools(): ToolDefinition[] {
    return Array.from(this.toolHandlers.values()).map(h => h.definition)
  }

  // 列出所有 MCP 工具（带 server 信息）
  getMCPTools(): Array<{ server: string; name: string; description?: string }> {
    const result: Array<{ server: string; name: string; description?: string }> = []
    for (const instance of this.servers.values()) {
      for (const tool of instance.tools) {
        result.push({
          server: instance.name,
          name: tool.name,
          description: tool.description,
        })
      }
    }
    return result
  }

  // 获取指定服务器的工具
  getServerTools(serverName: string): Array<{ name: string; description?: string }> {
    const instance = this.servers.get(serverName)
    if (!instance)
      return []

    return instance.tools.map(t => ({
      name: t.name,
      description: t.description,
    }))
  }

  // 列出所有服务器
  getServers(): MCPServerInfo[] {
    return Array.from(this.servers.values()).map(s => ({
      name: s.name,
      url: s.url,
      transport: s.transport,
      toolCount: s.toolNames.length,
    }))
  }

  // 调用 MCP 工具
  async invoke(serverName: string, toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    return this.invokeTool(serverName, toolName, args)
  }

  // 内部工具调用
  private async invokeTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const instance = this.servers.get(serverName)
    if (!instance)
      return { content: `Error: MCP server "${serverName}" not found`, isError: true }

    try {
      const result = await instance.client.callTool(
        { name: toolName, arguments: args },
        undefined,
        { timeout: 60000 }, // 60s 超时
      )

      if (result.isError)
        return { content: `Tool error: ${result.content}`, isError: true }

      return { content: JSON.stringify(result) }
    }
    catch (error: any) {
      console.error(`[MCP] Tool call failed for "${serverName}/${toolName}":`, error.message)
      return { content: `Error: ${error.message}`, isError: true }
    }
  }

  // 通过工具名调用（从 toolRegistry 调用时使用）
  async invokeByToolKey(toolKey: string, args: Record<string, unknown>): Promise<ToolResult> {
    const handler = this.toolHandlers.get(toolKey)
    if (!handler)
      return { content: `Error: Unknown MCP tool "${toolKey}"`, isError: true }

    return handler.invoke(args)
  }

  // 检查连接健康状态
  private async checkConnection(name: string): Promise<boolean> {
    const instance = this.servers.get(name)
    if (!instance)
      return false

    try {
      await instance.client.request({ method: 'ping' })
      return true
    }
    catch {
      return false
    }
  }

  // 初始化健康检查
  initialize(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [name] of this.servers) {
        try {
          const isHealthy = await this.checkConnection(name)
          if (!isHealthy)
            console.warn(`[MCP] Server "${name}" health check failed`)
        }
        catch {
          // Ping 不支持时静默忽略
        }
      }
    }, 30000)
  }

  // 清理
  async close(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = undefined
    }

    for (const [name, instance] of this.servers) {
      try {
        await instance.client.close()
      }
      catch (error: any) {
        console.warn(`[MCP] Error closing client for "${name}":`, error.message)
      }
    }

    this.servers.clear()
    this.toolHandlers.clear()
  }
}

// 全局 MCP Registry 实例
export const mcpRegistry = new MCPRegistry()
