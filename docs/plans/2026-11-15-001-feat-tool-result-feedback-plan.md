---
title: 'feat: 工具执行结果反馈到工具卡片'
type: feat
status: completed
date: 2026-11-15
origin: docs/brainstorms/2026-11-15-tool-result-feedback-requirements.md
---

# feat: 工具执行结果反馈到工具卡片

## Summary

接上 morrigan 新增的「工具执行结果」协议：每次工具执行完成后，SSE 流里会多发一条 `role = "tool"` 且带 `toolResult` 的消息。前端据此把工具卡片从「执行中」推进到终态（成功 / 失败 / 已拒绝 / 已中断），并展示耗时、错误码文案与结果规模。

解析、状态流转、渲染全在前端完成，不改 SSE 协议与后端。

---

## Problem Frame

前端在一条会话里能看到两类东西：模型的增量输出，以及模型发起的工具调用。**工具执行的结果从来没到过前端**——工具卡片永远停在「已发起」，工具失败了也不知道。

morrigan 的 `feat/tool-result-feedback` 分支（提交 `dafcfc2`）补上了这条通道：工具执行完成后，SSE 多发一条消息：

```
{ "role": "tool",
  "toolResult": { "callID": "call_1", "name": "strata__exec", "seq": 0,
                  "status": "ok" | "error" | "rejected",
                  "err": "execution_failed",   // 仅失败时出现
                  "dur": 132, "clen": 4096 } }
```

前端接不上这条通道，有三处原因：

1. **判空会丢弃它**：`src/views/chat/index.vue:82` 的 `hasContent` 白名单只认 `toolCalls` / `delta` / `think` / `text` / `finishReason` / `title`；工具结果消息只有 `role` 与 `toolResult`，被判空 `return`。
2. **数据模型没有「调用状态」**：`Chat.Tool`（`src/typings/chat.d.ts:3-8`）只有 `name` / `arguments` / `id` / `collapsed`，没有承载 `status` / `err` / `dur` / `clen` 的字段。
3. **折叠时机不对**：新协议下 `finishReason = "tool_calls"` 到达时工具才刚开始执行，而 `finishToolCallRound`（`src/views/chat/utils.ts:78-91`）在这个时点就把条目折叠了——「刚发起就收起」，用户看不到执行过程，状态变化也没有落点。

2026-11-12 的需求文档明确写过「工具执行结果不并入折叠块」「不做工具执行结果与调用的配对展示」。那是有意取舍：当时后端不下发结果，配对没有数据基础。后端协议补齐后，前提消失，本次把这条取舍翻过来。

需求见 origin 文档。

---

## Requirements

以下需求沿用 origin 文档的编号，plan 只负责实现路径。

- R1. 带 `toolResult` 的 SSE 消息被识别为工具结果消息，进入处理流程，不被判空丢弃、不被渲染成空气泡。
- R2. 工具结果消息不产生新的消息段落、不产生新的对话轮次。
- R3. 工具结果通过 `toolResult.callID` 与条目 `id` 配对。
- R4. 配对不上时静默忽略该条结果。
- R5. 条目状态取值：后端的 `ok` / `error` / `rejected`，前端自有的 `running` / `aborted` / `unknown`。
- R6. 结果消息到达时把 `status` / `err` / `dur` / `clen` 落到配对条目上。
- R7. 条目进入终态时自动折叠；结果到达前保持展开。
- R8. 流结束时把仍处于 `running` 的条目收束成终态（取消 → `aborted`，正常结束无结果 → `unknown`）。
- R9. 折叠头显示工具名、状态徽标、耗时；折叠态另显示参数摘要。
- R10. 展开区显示完整参数、失败时的错误码文案、结果长度。
- R11. 错误码按枚举映射本地化文案，未知错误码兜底显示原文。
- R12. 新增文案同步全部 7 个 locale 文件，键集合与插值参数一致。
- R13. 后端未升级时工具调用仍可见，流结束时收束为 `unknown`。
- R14. 不展示工具结果正文，不新增读取正文的接口。
- R15. 改动限于前端解析层、数据层、渲染层与文案。

**Origin acceptance examples:** AE1–AE12（origin 文档）

---

## Scope Boundaries

- 不改 SSE 协议，不改 morrigan，不改仓库内 `service/`（它不是现网 chat 后端）。
- 不展示工具结果正文，不新增正文读取接口。
- 不做工具结果与调用的正文并排展示，不做执行日志 / 结果面板。
- 不做工具调用的重放、重试或手动触发。
- 不做思考段落（think）的展示形态调整。
- 不做工具状态的历史回查（后端 `getHistory` 不返回工具记录）。
- 不改消息持久化的整体结构。

---

## Context & Research

### Relevant Code and Patterns

- SSE 处理主循环：`src/views/chat/index.vue` 的 `createSSEHandler` / `handleMessage`（判空在 82 行，工具调用落地在 95-105 行，消息级 store 更新在 200-231 行，`finishReason` 分流在 239-282 行）。
- 报文类型：`src/api/index.ts` 的 `StreamMessage`（42-52 行，无 `role` / `toolResult`）、`ToolCall`（36-41 行）、`fetchChatStream` 的 `receiveMessage`（130-148 行）只做 `JSON.parse` 后原样透传，不做键名归一。
- 消息类型：`src/typings/chat.d.ts` 的 `Chat.Tool`（3-8 行）、`Chat.MessageChunk`（14-21 行）、`Chat.Chat`（23-34 行）。
- 工具调用纯函数：`src/views/chat/utils.ts` 的 `normalizeToolCalls`（15-21 行）、`applyToolCalls`（30-72 行）、`finishToolCallRound`（78-91 行）、`isToolCallFinishReason`（94-96 行）。
- 渲染层：`src/views/chat/components/Message/Text.vue` 的工具调用段落（410-445 行）与无 chunks 的兼容分支（459-491 行）、折叠状态 Map 与 `isToolCallCollapsed` / `toggleToolCallCollapse`（233-254 行）；样式在 `style.less` 的 `.tool-call-item` / `.tool-call-content` / `.tool-call-args`。
- 纯函数与测试口径：`src/views/chat/utils.ts` + `utils.test.ts`（视图目录放纯函数、配同名单测，是仓库既有做法）。
- 文案：`src/locales/*.ts` 七个语言文件；`src/locales/locale.test.ts` 校验 corpus / skill / memory 三段的键集合与插值参数（`chat` 段当前不在校验范围内）。

### Institutional Learnings

- `docs/brainstorms/2026-11-12-tool-call-rendering-requirements.md` R13 / Scope Boundaries：「工具执行结果不并入折叠块」「不做工具执行结果与调用的配对展示」——本次由后端协议补齐推翻该取舍的前提。
- `docs/plans/2026-11-12-001-fix-tool-call-rendering-and-folding-plan.md`：纯函数上提到 `src/views/chat/utils.ts`、组件只做装配；折叠状态两层（数据侧自动策略 + 视图侧手动覆盖）。
- 仓库没有 `docs/solutions/`；`docs/todos/` 里的未决条目与本次无关。
- 既有教训：SSE 处理逻辑内联在 `.vue` 中难以单测，可判定的分支一律上提到视图目录的纯函数文件。

### External References

无。协议形状由 morrigan 的既有对外约定决定，没有外部取舍空间。

---

## Key Technical Decisions

- **状态挂在 `Chat.Tool` 上，不另立段落**：结果与调用一对一，挂在条目上才能就地更新；另立 `tool_result` 段落需要额外配对，且会渲染出没有正文的空气泡（R2）。
- **配对主键 `toolResult.callID` ↔ `Chat.Tool.id`**：`Chat.Tool.id` 存的本来就是 `tc.id`（`utils.ts:17`），链路天然具备，不需要引入 `seq` 做序号推断。
- **协议类型与 UI 模型分层**：`src/api/index.ts` 的 `ToolResult` 描述线上报文（`callID` / `status` / `err` / `dur` / `clen`）；`Chat.Tool` 是 UI 模型（`status` / `errorCode` / `duration` / `resultLength`）。两者不合并，避免协议字段名渗进渲染层。
- **`name` 与 `seq` 不消费**：结果消息里的 `name` 与调用自身的名字重复；`seq` 是配对的兜底，而 `callID` 恒非空，用不上。类型里不声明，避免「有字段没人用」。
- **折叠时机从「发起点」移到「结果到达点」**：`finishToolCallRound` 不再把条目折叠（只负责结束本轮、置 `chunk.loading = false`）；折叠由结果落地时写入数据侧 `collapsed`。用户手动状态在视图侧，优先级更高，不会被自动折叠覆盖（R7）。
- **收束用两个前端自有终态**：`aborted`（用户取消 / 中止）与 `unknown`（正常结束但无结果）。后端取消时整批丢弃结果，前端无法区分「被取消」与「后端未升级」，用两个值分别表达，避免把「状态未知」说成「已中断」。
- **错误码在前端映射文案**：后端只给枚举不给原文（原文可能含敏感内容），文案由前端按枚举本地化；枚举外的码兜底显示原文（R11）。
- **纯函数上提、组件只做装配**：仓库无组件挂载测试框架，配对、状态流转、收束、错误码映射全部进 `src/views/chat/utils.ts` 由单测覆盖。

---

## Open Questions

### Resolved During Planning

- 折叠时机：结果到达后自动折叠（用户 2026-11-15 确认）。
- 无结果的工具：收束成终态，不留「永远执行中」（用户确认）。
- 展示内容：状态徽标 + 耗时 + 错误码文案 + 结果长度（用户确认）。
- 结果正文：不展示（用户确认）。

### Deferred to Implementation

- [Affects R9, R10] 状态徽标的视觉形态与耗时 / 长度的单位文案（`132ms` 还是 `0.13s`；字符数的中文表述）。实现时按现有折叠头的排版密度定，遵循「折叠头只放一行、摘要可截断」的既有约束。
- [Affects R12] 是否把 `chat` 段纳入 `locale.test.ts` 的键集合校验。**实现取「纳入」**：本次新增 13 个键 × 7 个语言，不校验容易漏键，而扩展成本是两段测试用例。
- [Affects R8] 「流被取消」的判定点：SSE 的 abort 事件（`src/api/index.ts:185-188`）还是 `AbortError` 捕获分支（`src/views/chat/index.vue:417` / `:529`）。实现时以 `AbortError` 分支为准——它是请求生命周期的终点，两条取消路径最终都走到那里。

---

## Output Structure

```
    src/
      api/
        index.ts              # 修改：StreamMessage 增加 role / toolResult，新增 ToolResult 类型
      typings/
        chat.d.ts             # 修改：Chat.Tool 增加状态与元信息字段，新增 ToolStatus 联合类型
      views/chat/
        utils.ts              # 修改：新增 applyToolResult / settleToolCalls / 错误码映射；调整 finishToolCallRound
        utils.test.ts         # 修改：新增状态流转与配对的单测
        index.vue             # 修改：判空白名单、工具结果分支、结束时收束
        components/Message/
          Text.vue            # 修改：状态徽标、耗时、错误码文案、结果长度
          style.less          # 修改：状态徽标样式
          Text.render.test.ts # 修改：补状态徽标与错误码文案的渲染断言
      locales/
        zh-CN.ts, en-US.ts, zh-TW.ts, es-ES.ts, ko-KR.ts, ru-RU.ts, vi-VN.ts   # 修改：chat 段新增文案
        locale.test.ts        # 修改：chat 段纳入键集合与插值参数校验
```

---

## Implementation Units

### U1. 协议类型与数据模型

**Goal:** 让线上报文与 UI 模型都能承载工具结果。

**Requirements:** R5, R6, R15

**Dependencies:** None

**Files:**
- Modify: `src/api/index.ts`
- Modify: `src/typings/chat.d.ts`

**Approach:**
- `src/api/index.ts` 新增 `ToolResult` 接口（`callID` / `status` / `err?` / `dur` / `clen`），`status` 取 `'ok' | 'error' | 'rejected'`；`StreamMessage` 增加 `role?: string` 与 `toolResult?: ToolResult`。
- `src/typings/chat.d.ts` 新增 `Chat.ToolStatus` 联合类型（`'running' | 'ok' | 'error' | 'rejected' | 'aborted' | 'unknown'`）；`Chat.Tool` 增加 `status?: Chat.ToolStatus`、`errorCode?: string`、`duration?: number`、`resultLength?: number`。
- 字段语义：`status` 是条目的当前状态（后端值或前端自有值）；`errorCode` 存后端的 `err` 枚举原文（映射在渲染层做，原始码保留便于排查）；`duration` 是毫秒；`resultLength` 是结果字符数。
- 不在类型里声明结果消息的 `name` 与 `seq`（不消费，见 Key Technical Decisions）。

**Patterns to follow:**
- `src/api/index.ts` 既有 `StreamMessage` / `ToolCall` 的可选字段写法
- `src/typings/chat.d.ts` 的 `Chat` 命名空间风格

**Test scenarios:**
- Test expectation: none -- 类型层由 `pnpm type-check` 兜底，无行为可测。

**Verification:** `pnpm type-check` 通过。

---

### U2. 状态流转纯函数

**Goal:** 把「结果如何配对、如何改状态、何时收束、错误码怎么映射」收敛成可测的纯函数。

**Requirements:** R3, R4, R5, R6, R7, R8, R11

**Dependencies:** U1

**Files:**
- Modify: `src/views/chat/utils.ts`
- Modify: `src/views/chat/utils.test.ts`

**Approach:**
- `normalizeToolCalls` 给每个新条目带上 `status: 'running'`。
- `applyToolCalls` 的同 id 合并分支保留既有条目的 `status` 与元信息（参数续传不应把已落地的终态打回 `running`）。
- 新增 `applyToolResult(chunks: Chat.MessageChunk[], result: ToolResult): Chat.MessageChunk[]`：
  - 从后往前找含 `id === result.callID` 的 `tool_call` 段落里的条目；
  - 找到则写入 `status` / `errorCode` / `duration` / `resultLength`，并置 `collapsed = true`（R7）；
  - 找不到则原样返回 `chunks`（R4，不新建、不抛错）。
- 新增 `settleToolCalls(chunks: Chat.MessageChunk[], status: 'aborted' | 'unknown'): Chat.MessageChunk[]`：把仍是 `running`（或缺状态）的条目写成指定终态并折叠；已经是终态的不动。函数幂等，可重复调用。
- 修改 `finishToolCallRound`：保留「结束本轮、`chunk.loading = false`」，去掉「把所有条目 `collapsed = true`」——折叠改由结果到达驱动（R7）。
- 新增 `toolStatusKey(status?: Chat.ToolStatus): string` 与 `toolErrorKey(code?: string): string`：返回 locale 键；未知错误码返回可显示原文的兜底键。
- 错误码枚举与文案键一一对应：`invalid_arguments` / `unsupported_type` / `panic` / `execution_failed` / `tool_error` / `permission_denied` / `rejected`（后端 `permission_denied` 是预留常量、当前无产生路径，仍纳入映射以防后端启用）。

**Patterns to follow:**
- `src/views/chat/utils.ts` 既有纯函数的「不改入参、返回新数组」写法
- `src/views/memory/utils.ts` 的 `corpusErrorKey`（错误 → locale 键的映射形态）

**Test scenarios:**
- Happy path: 一条 `callID` 匹配的结果 → 对应条目的 `status` / `duration` / `resultLength` 被写入，且 `collapsed` 变 true。
- Happy path: 结果到达前条目是展开的（`collapsed` 不为 true），`status` 为 `running`。
- Edge case: `callID` 匹配不上 → `chunks` 内容不变（引用相等即可），不抛错。
- Edge case: 同一 id 再次收到结果 → 以最新一次为准（后端不会重复下发，但覆盖语义要定死）。
- Edge case: 结果落到较早轮次的段落（末段不是该调用所在段落）→ 仍能配对成功。
- Edge case: `applyToolCalls` 合并参数续传时，条目已落地的终态 `status` 不被重置为 `running`。
- Error path: `settleToolCalls(chunks, 'aborted')` 只改 `running` 的条目，`ok` 的条目不动；函数幂等（连续调用两次结果一致）。
- Happy path: `toolErrorKey` 对 7 个枚举码各返回对应键；未知码返回兜底键。

**Verification:** `pnpm test` 中新增单测全部通过。

---

### U3. SSE 接线

**Goal:** 让工具结果消息进入处理流程，并在流结束时收束未落地的调用。

**Requirements:** R1, R2, R4, R7, R8, R13

**Dependencies:** U2

**Files:**
- Modify: `src/views/chat/index.vue`

**Approach:**
- `handleMessage` 的判空白名单加上 `data.toolResult`（R1）。工具结果消息没有 `delta` / `text`，因此不会新建文本段落，天然满足 R2。
- 在工具调用分支之后新增工具结果分支：`chunks = applyToolResult(chunks, data.toolResult)`。
  - 该分支不新建段落，只改既有条目；
  - store 更新复用既有的消息级 `updateChat`（每条消息都会走一次），无需额外写库逻辑。
- 收束时机（R8）：
  - 正常结束：`finishReason` 为非 `tool_calls` 的取值时（消息真正结束的那一步），调用 `settleToolCalls(chunks, 'unknown')`；
  - 用户取消 / 中止：请求生命周期以 `AbortError` 结束时，调用 `settleToolCalls(chunks, 'aborted')`。实现放在 `onConversation` / `onRegenerate` 的 `AbortError` 捕获分支里（两处都改），正常结束路径放在 `handleMessage` 的结束分支。
- `finishToolCallRound` 不再折叠条目（由 U2 改），本单元只需保证调用点与新语义一致。
- 边界：工具结果消息没有 `id` / `csid`，但 `src/api/index.ts:143` 会用本地 `csid` 回填 `csid`，因此消息级 `conversationOptions` 不会被写空；`parentMessageId` 沿用现状（后端任何消息都不带 `id`，现状即为空串，不在本次范围）。

**Patterns to follow:**
- `src/views/chat/index.vue` 既有 `handleMessage` 的分支写法与 `updateChat` / `updateChatSome` 的用法
- `src/views/chat/index.vue:417` / `:529` 的 `AbortError` 判定写法

**Test scenarios:**
- Test expectation: none -- 本单元是 `.vue` 内的接线层，仓库没有组件挂载测试框架；可判定的分支（配对、状态流转、收束）已上提到 U2 的纯函数。实现中若出现新的条件分支，同样上提并补测试。
- 验证方式：真实报文联调（见 Risks & Dependencies）。

**Verification:** 手动走查——一次带工具的对话，工具条目从「执行中」变为终态并折叠；停止一次执行中的对话，条目变为「已中断」。

---

### U4. 渲染

**Goal:** 在折叠头与展开区展示状态、耗时、错误码文案与结果长度。

**Requirements:** R9, R10, R11

**Dependencies:** U2

**Files:**
- Modify: `src/views/chat/components/Message/Text.vue`
- Modify: `src/views/chat/components/Message/style.less`
- Test: `src/views/chat/components/Message/Text.render.test.ts`

**Approach:**
- 折叠头（`Text.vue:417-436`）在工具名之后加状态徽标：`running` 显示脉冲点（沿用既有 `animate-pulse` 风格），`ok` / `error` / `rejected` / `aborted` / `unknown` 各自配色；徽标文案走 `toolStatusKey` → `t()`。
- 折叠头再显示耗时（`duration`），仅在有值时显示。
- 「执行中」的脉冲从段落级 `chunk.loading` 改为调用级 `status === 'running'`：段落级 loading 表达的是「本轮调用已下发」，而工具是否还在跑由状态决定；两个信号混用会让用户在工具已结束时仍看到脉冲。
- 展开区（`Text.vue:437-442`）在完整参数之后追加：失败时的错误码文案（`toolErrorKey(errorCode)`，未知码显示原文）与结果长度（`resultLength`）。
- 无 `chunks` 的兼容分支（`Text.vue:459-491`）同步改造，保持新旧消息表现一致。
- 样式：`style.less` 增加状态徽标与耗时文字的样式类，遵循既有配色（暖灰底 + 语义色文字）。

**Patterns to follow:**
- `Text.vue` 的 think 段落折叠实现（状态 Map、头部点击、箭头图标）
- `style.less` 的 `.think-content` / `.tool-call-item` 既有写法

**Test scenarios:**
- 渲染断言：既有 `Text.render.test.ts` 用 `createApp` + jsdom 挂载（无需引入 `@vue/test-utils`），沿用其 `mountText` / `visibleHeaders` 辅助函数补三条断言：「`status = 'ok'` 的条目显示成功文案与耗时」「`status = 'error'` 且 `errorCode = 'execution_failed'` 的条目展开后显示错误码文案」「`status = 'running'` 的条目显示脉冲」。

**Verification:** 手动走查——成功、失败、被拒、取消四种路径各看一次；展开折叠态的排版不撑爆消息行。

---

### U5. 文案与 locale 校验

**Goal:** 补齐状态与错误码文案，并把 `chat` 段纳入键集合校验。

**Requirements:** R12

**Dependencies:** U4

**Files:**
- Modify: `src/locales/zh-CN.ts`, `src/locales/en-US.ts`, `src/locales/zh-TW.ts`, `src/locales/es-ES.ts`, `src/locales/ko-KR.ts`, `src/locales/ru-RU.ts`, `src/locales/vi-VN.ts`
- Modify: `src/locales/locale.test.ts`

**Approach:**
- `chat` 段新增：6 个状态文案（`running` / `ok` / `error` / `rejected` / `aborted` / `unknown`）、7 个错误码文案、耗时与结果长度的单位文案。
- 键名沿用既有扁平风格（`chat.toolCall`），新键形如 `chat.toolStatusOk` / `chat.toolErrorExecutionFailed`。
- `locale.test.ts` 增加 `chat` 段的键集合一致性与插值参数一致性两条用例（与 corpus / skill / memory 同构）。

**Patterns to follow:**
- `src/locales/zh-CN.ts` 的 `chat` 段（`thinking` / `thoughtFor` 的键命名与句式）
- `src/locales/locale.test.ts` 的 corpus / skill / memory 三段用例写法

**Test scenarios:**
- Happy path: 七个语言的新增键全部存在，页面不出现裸 key。
- Error path: 任一语言漏键时 `locale.test.ts` 报错。

**Verification:** `pnpm test` 通过；切换语言逐一确认状态与错误码文案正常。

---

## System-Wide Impact

- **Interaction graph:** SSE 报文（`src/api/index.ts`）→ 消息分发（`src/views/chat/index.vue` 的 `handleMessage`）→ 段落结构（`chunks` 里的 `Chat.Tool`）→ 渲染（`Text.vue`）四处必须同步改动：只改解析会出现「状态更新了但不显示」，只改渲染会出现「工具卡片永远没有状态」。
- **Error propagation:** 工具失败此前只存在于模型上下文与后端数据库，现在以错误码形式进入协议；失败不再需要回查数据库才能确认。错误原文仍留在后端，不进前端。
- **State lifecycle risks:** `Chat.Tool` 新增 4 个字段，随 `chunks` 进 localStorage，体积增量可忽略；`status` 是终态快照，刷新后保留。折叠状态的既有两层结构不变：自动折叠写数据侧，用户手动状态在视图侧且优先级更高，结果到达时不会把用户手动展开的条目收起。
- **API surface parity:** 不涉及前端接口变更；依赖 morrigan 的 `feat/tool-result-feedback` 上线。后端未上线时表现为「状态未知」，不报错。
- **Integration coverage:** 单元测试覆盖配对、状态流转与收束；「前端按 `callID` 把结果对上调用卡片」需要真实会话联调证明。
- **Unchanged invariants:** SSE 协议、morrigan、仓库内 `service/`、think 段落的折叠行为、消息持久化的整体结构、`toolCalls` 消息结构。

---

## Risks & Dependencies

| 风险 | 缓解 |
|------|------|
| 后端未升级（不下发 `toolResult`）时工具卡片永远没有状态 | 流结束时统一收束为 `unknown`，条目可见、可折叠，不显示「执行中」 |
| 前端先于后端上线，行为短暂不一致 | 纯增量协议：后端不发 `toolResult`，前端只是拿不到结果；反向（前端先、后端后）同样安全 |
| 结果消息被判空丢弃 | 判空白名单显式加入 `toolResult`，并在 U2 的单测里锁住「工具结果消息不被丢弃」 |
| 自动折叠覆盖用户手动展开 | 自动折叠只写数据侧 `collapsed`，视图侧手动状态优先级更高（沿用既有两层折叠机制） |
| `callID` 配对不上 | 静默忽略该条结果，不新建条目、不抛错（单测覆盖） |
| 取消路径下工具停在「执行中」 | 请求生命周期以 `AbortError` 结束时收束为 `aborted` |
| 新增 13 个键 × 7 个语言容易漏 | 把 `chat` 段纳入 `locale.test.ts` 的键集合与插值参数校验 |
| 折叠头排版被状态徽标与耗时撑破 | 徽标与耗时用 `shrink-0` 定宽，参数摘要沿用 `truncate`，折叠头仍是一行 |

---

## Documentation / Operational Notes

- 本计划入库 `docs/plans/`；需求文档见 `docs/brainstorms/2026-11-15-tool-result-feedback-requirements.md`。
- 代码变更走分支与 PR；提交前执行 `pnpm test`、`pnpm type-check`、`pnpm lint`。
- 依赖 morrigan 的 `feat/tool-result-feedback` 分支（提交 `dafcfc2`）上线；未上线时前端表现为「状态未知」，属预期降级。
- 需要更新 `CLAUDE.md` 的「Key Files」段：`src/views/chat/utils.ts` 的职责已从「工具调用落地与参数格式化」扩展到「工具调用状态流转」。

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-11-15-tool-result-feedback-requirements.md](../brainstorms/2026-11-15-tool-result-feedback-requirements.md)
- 后端协议与实现：morrigan `docs/plans/2026-11-15-001-feat-tool-result-feedback-plan.md`、提交 `dafcfc2`（分支 `feat/tool-result-feedback`）。**配对主键的线上字段名是 `callID`**（提交 `dafcfc2` 里为 `callId`，后端随后改名并重新生成 swagger，与既有的 `toolCallID` 命名一致），其余字段 `name` / `seq` / `status` / `err` / `dur` / `clen` 不变。
- 前端参照实现：`src/views/chat/index.vue`、`src/views/chat/utils.ts`、`src/views/chat/components/Message/Text.vue`、`src/locales/locale.test.ts`
