---
title: refactor: Replace web_fetch with calculate tool
type: refactor
status: active
date: 2026-03-29
origin: docs/brainstorms/2026-03-29-remove-web-fetch-requirements.md
---

# refactor: Replace web_fetch with calculate tool

## Overview

移除内置 `web_fetch` 工具（及 SSRF 保护），替换为高精度计算工具 `calculate`，使用 mathjs 库。

## Problem Statement

当前内置的 `web_fetch` 工具功能过于基础，且外部 MCP 服务会提供类似功能。同时需要提供一个更小巧实用的内置工具。

## Implementation

### 1. 添加 mathjs 依赖

```bash
cd service && pnpm add mathjs
```

### 2. 修改 tools.ts

**移除:**
- `webFetchTool` 定义 (L5-20)
- `invokeWebFetch` 函数 (L22-102)
- `ToolRegistry` constructor 中的 web_fetch 注册 (L115-120)

**新增 `calculateTool`:**

```typescript
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
          description: 'Operation to perform'
        },
        a: { type: 'number', description: 'First operand' },
        b: { type: 'number', description: 'Second operand (not needed for sqrt)' }
      },
      required: ['operation', 'a']
    }
  }
}

// invokeCalculate 执行计算
export async function invokeCalculate(
  operation: string,
  a: number,
  b?: number
): Promise<ToolResult> {
  const { evaluate, sqrt, pow } = await import('mathjs')

  try {
    let result: number
    switch (operation) {
      case 'add': result = a + b; break
      case 'subtract': result = a - b; break
      case 'multiply': result = a * b; break
      case 'divide': result = a / b; break
      case 'pow': result = pow(a, b); break
      case 'sqrt': result = sqrt(a); break
      default: return { content: `Error: Unknown operation "${operation}"`, isError: true }
    }
    return { content: String(result) }
  }
  catch (error: any) {
    return { content: `Error: ${error.message}`, isError: true }
  }
}
```

### 3. 注册 calculate 工具

在 `ToolRegistry` constructor 中，替换 web_fetch 注册为 calculate。

## Files

- `service/src/llm/tools.ts` - 移除 web_fetch，新增 calculate
- `service/package.json` - 添加 mathjs 依赖

## Acceptance Criteria

- [ ] `web_fetch` 工具不再出现在 `getTools()` 返回列表中
- [ ] `calculate` 工具出现在 `getTools()` 返回列表中
- [ ] `calculate` 可正确执行: add(1,1), subtract(5,3), multiply(2,3), divide(10,2), pow(2,10), sqrt(2)
- [ ] service 可正常启动和运行

## Test Scenarios

```bash
# 测试计算
curl -X POST http://localhost:3002/api/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{"serverName": "builtin", "toolName": "calculate", "arguments": {"operation": "add", "a": 0.1, "b": 0.2}}'
```

Note: builtin 工具调用方式待确认，可能需要先验证工具调用路径。
