---
date: 2026-11-16
type: feat
status: active
---

# feat: 工具调用参数默认折叠 + 耗时分级显示

## Problem Frame

两个展示层调整：

1. **工具调用参数默认折叠**：当前自动策略是「调用进行中默认展开、该轮结束后自动折叠」（见 origin: `docs/brainstorms/2026-11-12-tool-call-rendering-requirements.md` 的 R11）。用户要求改为**所有**显示的工具调用（含执行中的）参数一律默认折叠，仅摘要可见，除非用户点击展开。这是对 R11 的显式覆盖（用户明确要求优先）。
2. **耗时分级显示**：当前工具调用耗时直接显示原始毫秒（`{duration} ms`）。用户要求分级格式化：< 1000 ms 显示毫秒；≥ 1000 ms 显示秒（保留 2 位小数，如 `1.02秒`）；≥ 60 秒显示分钟（如 `2分12.03秒`）。

## Scope Boundaries

- 不改 SSE 协议与后端，不改 `service/`。
- 不调整折叠交互形态（箭头、点击头、摘要截断逻辑均沿用现有实现）。
- 不动 think 段落的计时显示（`thinkingWithDuration` / `thoughtFor` 保持秒级原文案）。
- 工具执行结果与调用的配对逻辑（`applyToolResult`）不变。

## Key Technical Decisions

- **默认折叠放在数据侧**：`normalizeToolCalls` 直接产出 `collapsed: true`，自动策略从「进行中展开/结束折叠」简化为「一律折叠」。视图侧手动覆盖机制（`toolCallCollapsedStates`）不动，用户点击展开仍然有效。`applyToolResult` / `settleToolCalls` 里的 `collapsed: true` 变为冗余但保留（对旧数据幂等，无副作用）。
- **耗时分级做成纯函数返回 i18n key + 参数**：`src/views/chat/utils.ts` 新增 `toolDurationDisplay(ms)`，返回 `{ key, params }`，由组件 `t(key, params)` 渲染。阈值：`< 1000` → `chat.toolDurationMs`（`{duration}` 原值）；`< 60000` → `chat.toolDurationSeconds`（`{seconds}` 为 `(ms/1000).toFixed(2)`）；`≥ 60000` → `chat.toolDurationMinutes`（`{minutes}` 为整分钟，`{seconds}` 为余数秒 2 位小数）。放 utils.ts 并配单测，与仓库既有做法一致（纯函数 + `utils.test.ts`）。
- **locale key 拆三个**：替换现有 `chat.toolDuration`，新增 `toolDurationMs` / `toolDurationSeconds` / `toolDurationMinutes`，7 个 locale 文件全量补齐（`locale.test.ts` 要求同一 key 的插值参数在所有语言一致，每个新 key 各自保持参数名相同即可）。

## Implementation Units

### U1. 工具调用一律默认折叠

- **Goal**: 所有工具调用条目（含执行中）初始即折叠，仅显示工具名 + 参数摘要；用户点击可展开。
- **Files**: `src/views/chat/utils.ts`, `src/views/chat/utils.test.ts`
- **Approach**: `normalizeToolCalls` 增加 `collapsed: true`；同步修订 `finishToolCallRound` 注释（「刚发起时不折叠」的策略已废弃）。
- **Test scenarios**:
  - 新落地的调用条目 `collapsed === true`（`applyToolCalls` 新轮次、同轮追加两条路径）。
  - 参数续传保留既有条目的折叠态（既有用例，断言不变）。
  - 结果落地 / 流收束后条目 `collapsed === true`（既有用例，断言不变）。
- **Verification**: 执行中的工具调用在页面上默认折叠，点击头部展开，再次点击收起。

### U2. 耗时分级格式化

- **Goal**: 工具调用耗时按 <1s / ≥1s / ≥60s 三级显示毫秒 / 秒 / 分+秒。
- **Files**: `src/views/chat/utils.ts`, `src/views/chat/utils.test.ts`, `src/views/chat/components/Message/Text.vue`, `src/locales/{zh-CN,zh-TW,en-US,es-ES,ko-KR,ru-RU,vi-VN}.ts`
- **Approach**: utils.ts 新增 `toolDurationDisplay(ms)` 纯函数；Text.vue 两处 `chat.toolDuration` 调用点改为 `t(...toolDurationDisplay(tc.duration))`（抽取一个小函数供模板调用）；7 个 locale 删除 `toolDuration`、新增三个 key。
- **Test scenarios**:
  - `999` → `toolDurationMs`，`{duration: 999}`。
  - `1000` → `toolDurationSeconds`，`{seconds: '1.00'}`。
  - `1020` → `{seconds: '1.02'}`。
  - `62030` → `toolDurationMinutes`，`{minutes: 1, seconds: '2.03'}`。
  - `132000` → `{minutes: 2, seconds: '12.00'}`。
- **Verification**: 页面上短耗时显示 `xx ms`，秒级显示 `1.02秒`，分钟级显示 `2分12.03秒`；`pnpm test`、`pnpm type-check`、`pnpm lint` 通过。
