---
date: 2026-03-29
topic: remove-web-fetch
---

# 移除内置 web_fetch 工具

## Problem Frame

当前内置的 `web_fetch` 工具功能过于基础（仅支持简单 HTML 抓取），且有些外部 MCP 服务会集成相同功能的工具（如 webpawm），造成功能重复。用户需要更小巧的内置工具集。

## Requirements

- R1. 移除 `web_fetch` 内置工具及其相关代码
- R2. 移除 SSRF 保护逻辑（已无必要）
- R3. 保留 toolRegistry 框架（为未来内置工具留空间）
- R4. MCP 服务器可按需提供网页抓取能力
- R5. 新增 `calculate` 内置工具：支持基础精确运算（加减乘除、幂、开方），使用 mathjs 库避免浮点精度问题
- R6. 后续叠加 R7（单位换算）

## Calculator Tool (R5)

### 功能
- 支持表达式: `{ "expression": "2 + 3 * 4" }`
- 支持操作: `{ "operation": "add|Subtract|multiply|divide|pow|sqrt", "a": number, "b": number }`
- 高精度运算，使用 mathjs 库

### Scope Boundaries (Calculator)
- **包含**: 加减乘除、幂运算、开方
- **不包含**: 单位换算（R7）、表达式解析（eval）

## Unit Conversion Tool (R7, deferred)

### 功能
- 支持: `{ "convert": { "from": "km", "to": "miles", "value": 100 } }`
- 支持单位: 长度、重量、温度、时间等
- 复用 mathjs 的 unit 功能

## Success Criteria

- `web_fetch` 工具不再出现在 `getTools()` 返回列表中
- 代码中不存在 `webFetchTool` 和 `invokeWebFetch` 相关定义
- `calculate` 工具出现在 `getTools()` 返回列表中
- `calculate` 可正确执行 1+1、2^10、sqrt(2) 等运算
- service 可正常启动和运行

## Scope Boundaries

- **非目标**：实现新的网页抓取替代品（MCP 可提供）
- **非目标**：修改 MCP Registry 代码
- **R7 暂不实施**：单位换算功能后续叠加

## Key Decisions

- **移除 vs 替换**：完全移除 web_fetch，MCP 服务按需集成网页工具
- **分阶段实施**：先做计算器基础功能（R5），后续叠加单位换算（R7）
- **工具库**：使用 mathjs 处理高精度数学运算

## Next Steps

→ `/ce:plan` 进行移除实施
