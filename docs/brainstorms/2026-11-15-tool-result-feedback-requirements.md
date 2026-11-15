---
date: 2026-11-15
topic: tool-result-feedback
---

# 工具执行结果反馈到前端

## Summary

morrigan 后端新增了「工具执行结果」的对外协议：每次工具执行完成后，SSE 流里多发一条 `role = "tool"` 的消息，`toolResult` 对象带 `callID` / `name` / `seq` / `status` / `err` / `dur` / `clen`（见 morrigan 的 `docs/plans/2026-11-15-001-feat-tool-result-feedback-plan.md`，实现提交 `dafcfc2`，分支 `feat/tool-result-feedback`）。

前端此前只能看到「模型发起了某个工具调用」，看不到成没成——工具卡片永远停在「已发起」。本次把这条通道接上：工具卡片从「执行中」推进到「成功 / 失败 / 已拒绝 / 已中断」，并展示耗时、错误码与结果规模。

结果正文不下发，前端也不展示正文——后端只给元信息。

---

## Problem Frame

### 现象

一次带工具的对话，工具卡片只有一个工具图标和参数，没有状态、没有耗时、没有失败原因。工具失败了也不知情，只能看到模型后续自己重规划或放弃。

### 根因

三处叠加：

**根因一：后端把工具结果事件就地丢弃。**

morrigan 的 `pkg/web/api/handle_convo.go` 里，工具结果分支落库后直接 `continue`，结果只进 `convo_tool_record`，不进协议。前端拿不到执行结果。

**根因二：前端的白名单会把它判空。**

工具结果消息只有 `role` 与 `toolResult` 两个字段，没有 `delta` / `text` / `think` / `toolCalls` / `finishReason` / `title`。`src/views/chat/index.vue:82` 的判空条件：

```ts
const hasContent = (data.toolCalls && data.toolCalls.length > 0) || data.delta || data.think || data.text || data.finishReason || data.title
if (!hasContent)
  return
```

→ 这类消息被静默丢弃。即便后端发了，前端也接不住。

**根因三：数据模型里没有「调用状态」这个概念。**

`Chat.Tool`（`src/typings/chat.d.ts:3-8`）只有 `name` / `arguments` / `id` / `collapsed`。折叠条目在头部渲染工具名与参数摘要，没有状态徽标；唯一的「进行中」表现是段落级 `chunk.loading` 驱动的 `...` 脉冲（`Text.vue:435`），整段共享一个 loading，不是每个调用各自的。

### 前端为什么一直没有做

2026-11-12 的需求文档（`docs/brainstorms/2026-11-12-tool-call-rendering-requirements.md`）R13 与 Scope Boundaries 明确写了「工具执行结果不并入折叠块」「不做工具执行结果与调对的配对展示」。那是有意取舍——当时后端根本不下发结果，配对没有数据基础。后端协议补齐后，这个取舍的前提消失了。

### 新协议的形状

```
{ "role": "tool",
  "toolResult": { "callID": "call_1", "name": "strata__exec", "seq": 0,
                  "status": "ok" | "error" | "rejected",
                  "err": "execution_failed",   // 仅失败时出现
                  "dur": 132,                  // 全流程耗时（毫秒）
                  "clen": 4096 } }             // 结果原始字符数
```

要点：

- **消息判别位**：`role = "tool"`；结果字段收在 `toolResult` 对象里，两者都不出现时就是普通助手消息。
- **配对主键**：`toolResult.callID` 对应 `toolCalls[].id`（`Chat.Tool.id` 存的正是它，配对链路天然具备）。
- **不产生新段落**：一条工具结果对应一次已有调用，只更新状态，不新建消息段落、不算新一轮对话。
- **结果正文不在报文里**：正文可能很大且含敏感内容；后端另有 `tool_result_read` 工具供**模型**分页回读，不是面向前端的 HTTP 接口，前端拿不到正文。
- **取消语义**：客户端取消时后端整批丢弃工具结果，既不外发也不伪装成失败。

---

## Requirements

**消息识别**

- R1. 带 `toolResult` 的 SSE 消息必须被识别为「工具结果消息」并进入处理流程，不得被 `hasContent` 白名单判空丢弃，也不得被当成助手消息渲染成空气泡。
- R2. 工具结果消息不产生新的消息段落、不产生新的对话轮次，只更新既有工具调用条目的状态。

**配对**

- R3. 工具结果通过 `toolResult.callID` 与工具调用条目的 `id`（来自 `toolCalls[].id`）配对。
- R4. 配对不上时（`callID` 为空、或消息里找不到对应调用）静默忽略该条结果：不新建条目、不抛错、不中断消息处理。

**状态模型**

- R5. 每个工具调用条目有且只有一个状态：后端下发的 `ok` / `error` / `rejected`，以及前端自有的 `running`（已发起、执行中）、`aborted`（已中断）、`unknown`（状态未知）。
- R6. 工具结果消息到达时，把 `status`、`err`、`dur`、`clen` 落到配对上的条目上；`err` 只在失败态出现，成功态不带。
- R7. 条目从 `running` 进入终态时自动折叠（数据侧 `collapsed = true`）；结果到达前保持展开，用户能看见正在执行的调用。

**收束**

- R8. 消息流结束时，仍处于 `running` 的条目必须被收束成终态，不得永远显示「执行中」：
  - 流被用户取消或中止 → `aborted`（已中断）；
  - 流正常结束但始终没收到结果 → `unknown`（状态未知）。
  收束后条目折叠。

**展示**

- R9. 折叠头显示：工具名、状态徽标（颜色区分）、耗时（`dur`）；折叠态另显示参数摘要（沿用现状）。
- R10. 展开区显示：完整参数（沿用现状）、失败时的错误码文案、结果长度（`clen`）。
- R11. 错误码按枚举映射为本地化文案；遇到枚举外的错误码时兜底显示原文，不显示空白。
- R12. 新增的状态与错误码文案同步全部 7 个 locale 文件，键集合与插值参数保持一致。

**兼容**

- R13. 后端未升级（不下发 `toolResult`）时，工具调用仍全部可见，流结束时统一收束为 `unknown`，不出现永久「执行中」。
- R14. 前端不展示工具结果正文，也不在本次引入读取正文的接口。

**改动范围**

- R15. 改动限于前端解析层、数据层、渲染层与文案；不改 SSE 协议、不改 morrigan、不改仓库内 `service/`（它不是现网 chat 后端）。

---

## Acceptance Examples

- AE1. **Covers R1, R2.** Given SSE 下发一条 `role = "tool"` 且带 `toolResult` 的消息，when 消息渲染完成，then 页面上不出现新的助手气泡、也不出现空气泡，工具条目的状态变为该 `toolResult.status`。
- AE2. **Covers R3, R6.** Given 一条工具调用 `id = "call_1"`，when 收到 `toolResult` 且 `callID = "call_1"`、`status = "ok"`、`dur = 132`、`clen = 4096`，then 该条目显示「成功」、耗时 132ms、结果长度 4096 字符。
- AE3. **Covers R4.** Given 收到一条 `callID = "call_999"` 的结果，而消息里没有这个调用，when 消息处理完成，then 不报错、不新增条目，其余渲染正常。
- AE4. **Covers R5, R6.** Given 工具失败，when 收到 `status = "error"`、`err = "execution_failed"`，then 条目显示「失败」，展开区显示「执行失败」的错误码文案，不显示原始错误码文本。
- AE5. **Covers R6.** Given 工具被前置策略拒绝，when 收到 `status = "rejected"`，then 条目显示「已拒绝」，不显示错误码（后端该状态不带 `err`）。
- AE6. **Covers R7.** Given 工具正在执行，when 用户观察条目，then 它是展开的且显示「执行中」；and 给 结果消息到达，then 它自动折叠并显示终态。
- AE7. **Covers R7.** Given 结果到达前用户手动展开了条目，when 结果消息到达，then 条目保持展开（手动状态优先于自动折叠）。
- AE8. **Covers R8.** Given 用户在工具执行中点了停止，when 流结束，then 仍处于「执行中」的条目变为「已中断」并折叠。
- AE9. **Covers R8, R13.** Given 后端未升级、不下发任何 `toolResult`，when 一轮带工具的对话正常结束，then 工具条目可见、显示「状态未知」并折叠，不显示「执行中」。
- AE10. **Covers R11.** Given 收到枚举外的错误码 `err = "some_new_code"`，when 展开条目，then 显示 `some_new_code` 原文，不显示空白。
- AE11. **Covers R9, R10.** Given 工具成功且耗时较长，when 用户观察折叠头，then 显示工具名、「成功」徽标与耗时；展开后显示完整参数与结果长度。
- AE12. **Covers R12.** Given 切换到任意一种语言，when 观察工具状态与错误码，then 显示对应语言的文案，不出现裸 key。

---

## Success Criteria

- 一次带工具的对话，页面上每个工具条目都能看出成功、失败、已拒绝还是被中断，失败时能看到原因分类与耗时。
- 后端未升级时，前端不出现「永远执行中」的条目，也不报错。

---

## Scope Boundaries

- 不改 SSE 协议，不改 morrigan，不改仓库内 `service/`。
- 不展示工具结果正文，不新增读取正文的接口。
- 不做工具结果与调用的正文并排展示，不做执行日志 / 结果面板。
- 不做工具调用的重放、重试或手动触发。
- 不做思考段落（think）的展示形态调整。
- 不做工具状态的历史回查：后端 `getHistory` 不返回工具记录，刷新页面后状态来自前端本地持久化的 `chunks`（后端未升级时刷新后仍是「状态未知」）。
- 不改消息持久化的整体结构：`chunks` 仍为 `Chat.MessageChunk[]`，只在 `Chat.Tool` 上增加状态与元信息字段。

---

## Key Decisions

- **状态挂在调用条目上，不另立段落**：结果与调用是一对一关系，挂在条目上才能就地更新；另立 `tool_result` 段落需要额外的配对逻辑。
- **配对主键用 `callID` ↔ `toolCalls[].id`**：`Chat.Tool.id` 存的本来就是 `tc.id`，链路天然具备，不需要引入序号推断。
- **结果消息不落为新段落**：工具结果不是一轮对话，只是对既有调用的状态更新；落成新段落会让消息里多出没有正文的空气泡。
- **折叠时机从「发起点」改成「结果到达点」**：新协议下 `finishReason = "tool_calls"` 到达时工具才刚开始执行，此处折叠等于「刚发起就收起」。改为结果到达才折叠，用户能看见执行中的调用，状态变化也在同一条目上可见。
- **终态有两个前端自有值（`aborted` / `unknown`）**：取消路径后端整批丢弃结果，前端无从区分「被取消」与「后端没升级」，用两个值分别表达，避免把「状态未知」说成「已中断」。
- **错误码在前端映射文案**：后端只给枚举不给原文（原文可能含敏感内容），文案由前端按枚举本地化。
- **纯函数上提、组件只做装配**：仓库没有组件挂载测试框架（未装 `@vue/test-utils`），可判定的分支（配对、状态流转、收束、错误码映射）一律进 `src/views/chat/utils.ts` 由单测覆盖——沿用 `src/views/skill/utils.ts` / `src/views/memory/utils.ts` 的既有做法。

---

## Dependencies / Assumptions

- 依赖 morrigan 的 `feat/tool-result-feedback` 分支（`dafcfc2`）上线；后端未上线时的行为由 R13 兜底。配对主键的线上字段名以最新协议为准：`toolResult.callID`（后端提交 `dafcfc2` 中为 `callId`，随后改名）。
- 假设 morrigan 下发 `toolResult` 消息的顺序在对应的 `toolCalls` 消息之后（后端实现如此：调用消息先写，执行完成才写结果）。
- 依赖既有的 `Chat.MessageChunk` 结构与基于 `chunks` 的渲染链路（`src/views/chat/components/Message/Text.vue`）。
- 依赖既有的两层折叠状态：数据侧 `collapsed`（随消息持久化）+ 视图侧手动状态 Map（`Text.vue` 的 `toolCallStateKey`）。自动折叠只写数据侧，不覆盖用户的手动状态。
- `Chat.Tool` 上新增的字段会随 `chunks` 进 localStorage，体积增量可忽略。

---

## Outstanding Questions

### Resolved During Planning

- 折叠时机：结果到达后自动折叠（用户在 2026-11-15 确认）。
- 无结果的工具：收束为终态，不留「永远执行中」（用户确认）。
- 展示内容：状态徽标 + 耗时 + 错误码文案 + 结果长度（用户确认）。
- 结果正文：不展示（用户确认；后端不下发，也没有面向前端的正文接口）。

### Deferred to Implementation

- [Affects R9, R10] 状态徽标的视觉形态：纯文字标签、带色点的文字，还是图标；耗时用「132ms」还是「0.13s」；结果长度的单位文案。
- [Affects R12] 新增文案是否把 `chat` 段纳入 `locale.test.ts` 的键集合校验（当前只校验 corpus / skill / memory 三段）。
- [Affects R8] 「流被取消」的判定点：走 SSE 的 abort 事件还是 `AbortError` 捕获分支；两者在 `src/api/index.ts` 与 `src/views/chat/index.vue` 都可见，选定后在实现里统一。
