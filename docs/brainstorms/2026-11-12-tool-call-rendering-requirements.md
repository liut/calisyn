---
date: 2026-11-12
topic: tool-call-rendering
---

# 修复工具调用只渲染最后一条

## Summary

SSE 流中的 `tool_calls` 被前端「替换式」落地：后到的一条工具调用消息会整个覆盖前一条消息写入的段落。同一轮里的多个调用、连续多轮里的调用都只剩最后一条可见。本次修复只动前端解析与渲染，不改 SSE 协议与后端实现。

在此之上追加一项展示增强：工具调用改为**单个调用级可折叠条目**——折叠态显示工具名与参数摘要，展开态显示完整参数；调用进行中默认展开，该轮结束后自动折叠，用户可手动覆盖。工具执行结果不并入折叠块。

---

## Problem Frame

### 现象

一次带工具的对话，页面上只出现一条 `strata__exec`，而后端实际下发过 4 次调用（3 轮，其中一轮含 2 个）。

抓到的 SSE 报文（节选，`csid` 略）：

```
10 message {"tool_calls":[{...call_2b08c3a8...},{...call_203f24b2...}],"finishReason":"tool_calls"} 17:58:08.029
11 message {}
12 message {"tool_calls":[{...call_7bb9e901...}],"finishReason":"tool_calls"}                   17:58:09.686
13 message {}
14 message {"tool_calls":[{...call_3f023a11...}],"finishReason":"tool_calls"}                   17:58:11.359
15 message {}
```

页面上显示的是最后一条。

### 根因

有两个叠加的根因。

**根因一：同一条 SSE 消息被处理了两次。**

`src/views/chat/index.vue` 的 `createSSEHandler` 里，`fetchWithLongReply` 在 `onMessage` 回调中调用 `handleMessage(data)`，随后又调用 `_onMessage?.(data)`；而两处调用方（`onConversation` / `onRegenerate`）传入的 `_onMessage` 正是 `handler.handleMessage` 自己：

```ts
// createSSEHandler 内部
onMessage: (data: StreamMessage) => {
  const shouldContinue = handleMessage(data)   // 第一次
  if (shouldContinue)
    continueRequest = true

  _onMessage?.(data)                            // 第二次（同一个 handleMessage）
}

// 调用方
await handler.fetch(handler.handleMessage)
```

于是每条 SSE 消息都走两遍 `handleMessage`。文本与思考内容被同一次重构引入的去重逻辑（`lastDelta` / `lastThink`，提交 `c30fa1d`）掩盖了，工具调用路径没有这层保护。

**根因二：工具调用以「替换末段」的方式落地。**

`src/views/chat/index.vue:97-133`，`createSSEHandler` 的 `handleMessage` 里，`tool_calls` 消息的处理是「替换最后一个 tool_call 段落」：

```ts
const toolCallData = data.tool_calls.map(tc => ({
  id: tc.id || '',
  name: tc.function?.name || '',
  arguments: tc.function?.arguments || '',
}))

const lastChunk = chunks[chunks.length - 1]
if (lastChunk && lastChunk.type === 'tool_call') {
  // 更新现有工具调用
  chunks[chunks.length - 1] = {
    type: 'tool_call',
    content: '',
    toolCalls: toolCallData,   // ← 整段替换
    loading: true,
  }
}
else {
  chunks.push({ type: 'tool_call', content: '', toolCalls: toolCallData, loading: true })
}
```

`toolCallData` 是**当前这条消息携带的完整一轮调用**，不是某一次调用的增量参数。`chunks` 在整条流生命周期内累积（`createSSEHandler` 的闭包变量），于是：

| 到达 | 动作 | 段落内容 |
| --- | --- | --- |
| msg 10 | push 新段落 | `[call_2b08…, call_203f…]` |
| msg 12 | 替换上一段 | `[call_7bb9…]` ← 前两个丢失 |
| msg 14 | 替换上一段 | `[call_3f02…]` ← 上一轮丢失 |

最终只剩一条，与现象一致。

代码注释「更新现有工具调用」与实现不符：它假设后到的消息是同一次调用的参数续传，但实际后端每轮下发的是该轮的完整调用数组。

### 两个根因的分工

根因一（重复处理）在旧的「替换末段」实现下是**不可见**的：同一份数据处理两遍，第二遍把第一遍的结果原样覆盖回去，看起来正常。根因二（替换末段）则把跨轮的调用清掉。

修掉根因二而留着根因一，重复就会显形：同一轮消息被处理两遍 → 两个内容相同的 tool_call 段落 → 一次对话里每个调用出现两次（2026-11-13 实测：一条携带 2 个调用的消息渲染出 4 行）。因此两个根因必须一起修。

| | 只修根因一 | 只修根因二 |
| --- | --- | --- |
| 旧实现（替换末段） | 正常 | 正常（跨轮丢失） |
| 新实现（轮次分段） | 每个调用渲染两次 | 正常 |

### 两种丢失形态

同一个覆盖逻辑造成两种丢失：

1. **跨轮丢失**（本次现象）：多轮工具调用时，前几轮的调用被后一轮替换。
2. **同轮丢失**：仓库内 `service/src/index.ts:191-201` 对每个 tool call 单独发一条 SSE 事件（一次一个 `toolCalls` 数组元素），同一轮的多个调用同样只有最后一个能留下。

### 渲染层

`src/views/chat/components/Message/Text.vue:437-450` 按段落渲染 `chunk.toolCalls`，多个 tool_call 段落会分别渲染成多行，本身不会互相覆盖——问题出在写入段落时的替换。

### 次生问题

`finishReason` 分支（`src/views/chat/index.vue:279-310`）不区分 `stop` 与 `tool_calls`：收到 `finishReason: "tool_calls"` 时同样执行 `updateChatSome(..., { loading: false, chunks })`，把消息标记为已结束、把所有段落的 `loading` 置 false。但此时 agent 循环仍在继续（下一轮还会来），消息气泡的加载态会中途熄灭再重新亮起。

### 附带发现：字段名不一致（待确认）

- 前端只认下划线：`src/api/index.ts:42-52` 的 `StreamMessage.tool_calls`，`src/api/index.ts:129-148` 把 SSE 原始 JSON 直传，没有做键名归一。
- 仓库内 `service/src/index.ts:32` 的 `StreamMessage` 用的是驼峰 `toolCalls`，`service/src/index.ts:191-201` 也按驼峰下发。

两侧对不上时，用仓库内 `service/` 提供的 `/api/chat` 不会渲染任何工具调用；而用户抓到的实际报文是下划线 `tool_calls`，每轮一条、携带完整数组。说明现网 `/api/chat` 的提供方与仓库内 `service/` 不是同一份实现，或 `service/` 已落后于部署版本。此项需要在实现前确认（见 Outstanding Questions）。

---

## Requirements

**工具调用的完整性**

- R1. 后端下发的每一次工具调用都必须在页面上可见：同一轮消息里携带的多个调用全部渲染；先后多轮各自携带的调用全部渲染，不允许出现「只剩最后一条」。
- R2. 轮次边界以消息是否携带 `finishReason` 判定：携带 `finishReason` 表示该轮已结束，后续调用属于新一轮，须另起一个 tool_call 段落；不携带表示同一轮的后续消息，须并入上一个 tool_call 段落。
- R3. 同一 `id` 的调用再次到达时，视为同一次调用的参数更新，覆盖原条目而不是追加重复项。
- R4. 没有 `id` 的调用不得互相覆盖，按到达顺序追加。
- R5. 段落顺序即到达顺序；多个 tool_call 段落各自成行，互不覆盖。消息没有 `chunks` 的历史消息仍按现有逻辑展示聚合后的工具调用。

**加载态**

- R6. 多轮工具调用期间，消息的加载态保持正确：`finishReason` 为 `tool_calls` 时不应把整条消息标记为已结束，也不应清掉正在进行中的思考段落的折叠时机。

**兼容性**

- R7. 工具调用字段名统一为驼峰 `toolCalls`：现网后端 morrigian 的 `api.ChatMessage` 已从 `tool_calls` 改名（见 morrigan 的 `docs/plans/2026-11-12-001-fix-tool-call-json-naming-plan.md`），前端按驼峰解析；仓库内 `service/` 的驼峰形态不是现网 chat 后端，不在范围内。

**改动范围**

- R8. 本次修复限定在前端解析与渲染层，不改动 SSE 协议与后端服务实现。消息持久化结构不变：`chunks` 仍为 `Chat.MessageChunk[]`，仅在 `Chat.Tool` 上新增折叠态字段。

**工具调用的折叠/展开**

- R9. 工具调用以**单个调用**为粒度提供折叠：每个调用是一个独立条目，折叠态显示工具名与参数摘要，展开态显示完整参数；同一轮内的多个调用各自独立折叠，互不影响。
- R10. 折叠态的参数摘要取格式化后的参数文本并截断（约 60 字符）；展开态显示完整参数，采用等宽字体按格式化 JSON 呈现，不再使用现在的 `key: value, key: value` 逗号连接。
- R11. 调用进行中默认展开；该轮工具调用结束后自动折叠。用户手动展开/折叠后的状态优先于自动策略。
- R12. 折叠状态分两层：自动策略的结果写在数据侧（随消息一起持久化），用户手动切换写在视图侧（组件本地，刷新后回到自动策略的结果）——与 think 段落的既有做法一致。
- R13. 工具执行结果不并入折叠块：后端以 `[tool] name: result` 文本下发的结果仍按现有方式渲染在消息正文中，不与调用配对。
- R14. 折叠交互与 think 段落保持一致：可点击的头部、指示状态的箭头图标、内容区展开/收起。
- R15. 「该轮工具调用结束」与「整条消息结束」是两个独立判定：`finishReason` 为 `tool_calls` / `tool_use` 只表示本轮工具调用结束（据此触发自动折叠），不结束整条消息的加载态。
- R16. 新增折叠相关文案需同步全部 7 个 locale 文件（`chat` 区块目前不在 `locale.test.ts` 的校验范围内，仍按仓库约定全量补齐）。
- R17. 每条 SSE 消息只被处理一次：同一事件不得落地两遍，工具调用、文本、思考内容都不得重复。文本与思考内容原有的去重逻辑是为重复处理准备的补偿，随重复处理一起移除——否则连续相同的增量片段会被误判为重复而丢失。

---

## Acceptance Examples

- AE1. **Covers R1, R2.** Given SSE 依次下发三轮 `tool_calls`（每轮带 `finishReason: "tool_calls"`，第一轮含 2 个调用），when 消息渲染完成，then 页面上可见 4 个工具调用，按到达顺序排列，前一轮的调用不被后一轮覆盖。
- AE2. **Covers R1, R2.** Given 同一轮的 2 个工具调用被拆成 2 条消息下发（均不带 `finishReason`），when 消息渲染完成，then 2 个调用都可见，且归在同一个工具调用段落内。
- AE3. **Covers R3.** Given 同一 `id` 的工具调用后续又下发一次（参数续传），when 消息渲染完成，then 页面上该调用只有一条，且展示的是最新参数。
- AE4. **Covers R4.** Given 后端下发的调用没有 `id`，when 多条此类调用先后到达，then 每条都可见，互不覆盖。
- AE5. **Covers R7.** Given 服务端按 `toolCalls`（驼峰）下发工具调用，when 消息渲染完成，then 工具调用被解析并渲染。
- AE6. **Covers R6.** Given 一轮工具调用结束后还有后续轮次，when 用户观察消息气泡，then 加载态在整条流结束前保持开启，不出现中途熄灭再亮起。
- AE7. **Covers R9, R10.** Given 一轮工具调用含 2 个调用且参数都很长，when 消息渲染完成，then 两个调用各是一个可折叠条目，折叠态显示工具名与截断的参数摘要，展开后显示完整参数且不与另一个调用混在一起。
- AE8. **Covers R11, R12.** Given 一次工具调用正在执行，when 用户观察该条目，then 它是展开的；and 给 该轮工具调用结束后，then 它自动折叠；and 用户手动展开后，then 保持展开直到消息重新生成。
- AE9. **Covers R15.** Given 一轮工具调用结束、其后还有下一轮工具调用，when 用户观察消息气泡，then 消息仍处于加载态，且已结束那一轮的调用处于折叠态。
- AE10. **Covers R13.** Given 后端下发了 `[tool] name: result` 的结果文本，when 消息渲染完成，then 该结果仍作为正文文本渲染，不出现在折叠块内。
- AE11. **Covers R17.** Given 一条 SSE 消息携带 2 个工具调用，when 消息渲染完成，then 页面上只有 2 个工具调用条目，不出现 4 行（重复处理导致的翻倍）。

---

## Success Criteria

- 页面上可见的工具调用数量与后端实际下发的调用数量一致。
- 规划者拿到本文档即可确定行为边界，无需再补产品决策；剩余待确认项集中在后端报文形态（Outstanding Questions）。

---

## Scope Boundaries

- 不改 SSE 协议，不改 `service/` 与任何后端服务的实现。
- 不做工具执行结果与调用的配对展示，不做工具调用结果面板或执行日志展示。
- 不做工具调用的重放、重试或手动触发。
- 不做思考段落（think）的展示形态调整。
- 不做折叠状态的跨会话共享：折叠状态随消息走。
- 不改消息持久化结构：`chunks` 仍以 `Chat.MessageChunk[]` 形态存入 chat store。

---

## Key Decisions

- **轮次边界用 `finishReason` 判定，而不是用「id 是否出现过」判定**：后端每轮携带完整调用数组、id 跨轮不复用，用 id 判定会把「同一轮拆成多条消息」的多个调用误判成多轮，段落会被切碎。
- **同轮内按 id 合并而不是整段替换**：同时兼容参数续传与同轮多消息两种下发方式，且任何形态下都不会丢调用。
- **段落只增不减**：新轮次新起段落，历史轮次的段落不再被触碰，从结构上消除「覆盖」这一类问题。
- **修复逻辑抽成纯函数放在 `src/views/chat/utils.ts` 并配单测**：SSE 处理内联在 `.vue` 的 `createSSEHandler` 里不便测试；仓库既有做法是视图目录下放纯函数与 `utils.test.ts`（见 `src/views/skill/utils.ts`、`src/views/memory/utils.ts`）。
- **折叠粒度取「单个调用」而不是「整轮」**：参数长度差异极大（有的只有一行、有的几百字符），按调用折叠才能各取所需；整轮折叠展开后仍是一长串。
- **折叠态保留参数摘要而不是只有工具名**：不展开也能看出这次调用做了什么，省掉一次点击。
- **进行中保持展开、结束后自动折叠**：与 think 段落「结束后折叠、用户可手动覆盖」的行为一致，也让长命令不撑爆消息。
- **折叠状态两层存放（数据侧自动策略 + 视图侧手动覆盖）**：直接沿用 think 段落的既有实现，不引入新的持久化机制。
- **工具结果不并入折叠块**：结果以独立文本消息下发，与调用配对需要额外的顺序推断，而用户后端当前并不下发结果；先把调用本身折叠清楚。

---

## Dependencies / Assumptions

- 依赖既有的 `Chat.MessageChunk` 结构（`src/typings/chat.d.ts:13-20`）与基于 `chunks` 的渲染链路（`src/views/chat/components/Message/Text.vue:437-450`）。
- 假设后端每轮工具调用结束时给出 `finishReason`（当前报文样例为 `tool_calls`）；若某后端只发 `tool_calls` 而不带 `finishReason`，多轮会并入同一段落——调用不丢，仅分组不同。
- 假设后端为工具调用提供稳定 `id`（当前报文样例为 `call_` 前缀）；无 `id` 时按 R4 追加。
- 折叠实现依赖 think 段落既有的折叠机制（`Text.vue` 的 `thinkCollapsedStates` / `isThinkCollapsed` / `toggleThinkCollapse`），以及 `Chat.MessageChunk.collapsed` 作为参照。
- 单个调用级折叠要求折叠态挂在调用上而非段落上，需要在 `Chat.Tool`（现只有 `name` / `arguments` / `id`）上新增折叠态字段；`chunks` 会随 chat state 进 localStorage，字段体积需可忽略。
- 假设参数文本沿用现有 `formatArguments` 的格式化逻辑即可得到可读结果，展开态不需要引入 markdown 渲染。

---

## Outstanding Questions

### Resolve Before Planning

- ~~[Q1][Technical] 现网 `/api/chat` 由哪个服务提供？~~ **已解决（2026-11-12）**：现网 chat 后端是另一个项目 `morrigan`，以用户抓到的报文为准——`tool_calls` 下划线字段、一轮一条消息携带该轮完整调用数组、每条带 `finishReason: "tool_calls"`。仓库内 `service/` 不是现网后端，其驼峰 `toolCalls` 形态不在本次范围。**追加（2026-11-12）**：命名统一方向确定——morrigan 的 `tool_calls` 改名为驼峰 `toolCalls`（见 morrigan 的 `docs/plans/2026-11-12-001-fix-tool-call-json-naming-plan.md`），前端随之按驼峰解析；协议其余部分（`delta` / `think` / `finishReason` / `csid`）本就是驼峰，不动。
- [Q2][Technical] 后端是否保证每个工具调用带 `id`？若不保证，R4 是唯一兜底路径。（报文样例中每个调用都带 `call_` 前缀 id，实现按「有 id 用 id、无 id 按到达顺序追加」处理即可，无需阻塞。）

### Deferred to Planning

- [Affects R2][Technical] `finishReason` 的具体取值集合（`tool_calls` / `tool_use` / 其他），以及是否需要在后端补一个明确的「本轮结束」标记。
- [Affects R6][Technical] `finishReason` 分支是否需要按取值分流：`stop` 才结束消息，`tool_calls` 只结束工具调用段落。
- [Affects R1][Technical] 纯函数的落点与签名（`src/views/chat/utils.ts` 的导出形态），以及 `utils.test.ts` 的用例组织。
- [Affects R7][Technical] 键名归一放在前端解析层（`src/api/index.ts`）还是视图层（`src/views/chat/index.vue`）。
- [Affects R9][Technical] 单个调用级折叠的状态落点：`Chat.Tool.collapsed` 与手动状态 Map（视图侧 `idx-tcIdx` 键）的具体分工。
- [Affects R10][Technical] 参数摘要的截断长度与截断位置（按字符截断还是按参数条目截断），以及展开态用「格式化 JSON 文本」还是「键值分行」。
- [Affects R11][Technical] 自动折叠的触发时机：收到本轮 `finishReason` 立即折叠，还是像 think 那样延迟一段时间再折。
- [Affects R16][Technical] 需要新增的 locale 键清单。
