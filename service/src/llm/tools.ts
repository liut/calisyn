import type { ToolDefinition, ToolResult } from './types'

// web_fetch 工具定义
export const webFetchTool: ToolDefinition = {
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
      required: ['url'],
    },
  },
}

// invokeWebFetch 执行网页抓取
export async function invokeWebFetch(
  url: string,
  maxLength = 5000,
  startIndex = 0,
): Promise<ToolResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

  try {
    // Validate URL
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    }
    catch {
      return { content: 'Error: Invalid URL provided', isError: true }
    }

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsedUrl.protocol))
      return { content: 'Error: Only HTTP and HTTPS protocols are supported', isError: true }

    // Block private IP ranges (SSRF protection)
    const hostname = parsedUrl.hostname
    const privateRanges = [
      /^127\./, // Loopback
      /^10\./, // Class A private
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B private
      /^192\.168\./, // Class C private
      /^169\.254\./, // Link-local
      /^::1$/, // IPv6 loopback
      /^fc00:/, // IPv6 private
      /^fe80:/, // IPv6 link-local
    ]
    if (privateRanges.some(range => range.test(hostname)))
      return { content: 'Error: Private IP addresses are not allowed', isError: true }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,text/plain,*/*',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok)
      return { content: `Error: HTTP ${response.status}`, isError: true }

    const contentType = response.headers.get('content-type') || ''
    let content = await response.text()

    // Simple truncation
    const originalLength = content.length
    if (startIndex >= originalLength)
      return { content: 'Error: No more content available', isError: true }

    const endIndex = Math.min(startIndex + maxLength, originalLength)
    content = content.slice(startIndex, endIndex)

    let result = `Contents of ${url}:\n${content}`

    // Add pagination hint if truncated
    if (endIndex < originalLength) {
      const nextStart = endIndex
      result += `\n\n[Content truncated. Call web_fetch with start_index=${nextStart} to get more content.]`
    }

    return { content: result }
  }
  catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError')
      return { content: 'Error: Request timed out after 30 seconds', isError: true }

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
    this.register(webFetchTool, async (args) => {
      const url = args.url as string
      const maxLength = (args.max_length as number) || 5000
      const startIndex = (args.start_index as number) || 0
      return invokeWebFetch(url, maxLength, startIndex)
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
}

// Global tool registry instance
export const toolRegistry = new ToolRegistry()
