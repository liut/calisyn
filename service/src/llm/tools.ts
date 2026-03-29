import type { ToolDefinition, ToolResult } from './types'
import type { MCPToolHandler } from './mcp'

// calculate 工具定义
export const calculateTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'calculate',
    description: 'Perform high-precision mathematical calculations. Supports: add, subtract, multiply, divide, pow, sqrt.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['add', 'subtract', 'multiply', 'divide', 'pow', 'sqrt'],
          description: 'Operation to perform',
        },
        a: { type: 'number', description: 'First operand' },
        b: { type: 'number', description: 'Second operand (not needed for sqrt)' },
      },
      required: ['operation', 'a'],
    },
  },
}

// invokeCalculate 执行计算
export async function invokeCalculate(
  operation: string,
  a: number,
  b?: number,
): Promise<ToolResult> {
  const { sqrt, pow } = await import('mathjs')

  try {
    let result: number
    switch (operation) {
      case 'add':
        result = a + (b ?? 0)
        break
      case 'subtract':
        result = a - (b ?? 0)
        break
      case 'multiply':
        result = a * (b ?? 1)
        break
      case 'divide':
        result = a / (b ?? 1)
        break
      case 'pow':
        result = pow(a, b ?? 2)
        break
      case 'sqrt':
        result = sqrt(a)
        break
      default:
        return { content: `Error: Unknown operation "${operation}"`, isError: true }
    }
    return { content: String(result) }
  }
  catch (error: any) {
    return { content: `Error: ${error.message}`, isError: true }
  }
}

// Tool registry for managing available tools
export interface ToolHandler {
  definition: ToolDefinition
  invoke: (args: Record<string, unknown>) => Promise<ToolResult>
}

class ToolRegistry {
  private tools: Map<string, ToolHandler> = new Map()

  constructor() {
    // Register default tools
    this.register(calculateTool, async (args) => {
      const operation = args.operation as string
      const a = args.a as number
      const b = args.b as number | undefined
      return invokeCalculate(operation, a, b)
    })
  }

  register(definition: ToolDefinition, handler: (args: Record<string, unknown>) => Promise<ToolResult>) {
    this.tools.set(definition.function.name, { definition, invoke: handler })
  }

  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition)
  }

  async invoke(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool)
      return { content: `Error: Unknown tool "${name}"`, isError: true }

    return tool.invoke(args)
  }

  hasTool(name: string): boolean {
    return this.tools.has(name)
  }

  // 注册 MCP 工具
  registerMcpTool(handler: MCPToolHandler): void {
    const name = handler.definition.function.name
    // 检查是否与内置工具冲突
    if (this.tools.has(name))
      throw new Error(`Tool name "${name}" conflicts with existing tool`)
    this.tools.set(name, { definition: handler.definition, invoke: handler.invoke })
  }
}

// Global tool registry instance
export const toolRegistry = new ToolRegistry()
