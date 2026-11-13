---
title: 'fix: 修复工具调用丢失并支持折叠'
type: fix
status: implemented
date: 2026-11-12
origin: docs/brainstorms/2026-11-12-tool-call-rendering-requirements.md
---

# fix: 修复工具调用丢失并支持折叠

## Summary

修复聊天消息里工具调用「只剩最后一条」的问题，并在此基础上把工具调用改成单个调用级可折叠条目。实现分四层落地——工具调用落地的纯函数、数据侧的类型与自动折叠策略、渲染侧的折叠条目、多语言文案。解析与渲染全在前端完成，不动 SSE 协议与后端。

---

## Problem Frame

`src/views/chat/index.vue` 的 `createSSEHandler` 在处理 `tool_calls` 消息时，用「替换最后一个 tool_call 段落」的方式落地：`toolCalls` 被整个换成当前这条消息携带的调用数组，而后端每轮下发的是该轮的完整数组。结果是新一轮覆盖上一轮、同一轮拆成多条时也只剩最后一个——用户抓到的报文中 3 轮共 4 个调用，页面上只剩 1 个。

同一段代码还有一处连带问题：`finishReason` 分支不区分 `tool_calls` 与 `stop`，工具轮结束时就把整条消息标记为已结束、所有段落 `loading` 置 false，而此时 agent 循环还在继续。

折叠能力叠加在修复之上：工具调用条目按单个调用提供折叠，折叠态显示工具名与参数摘要，展开态显示完整参数；进行中展开、该轮结束后自动折叠、用户可手动覆盖。动机与需求见 origin 文档。

---

## Requirements

以下需求沿用 origin 文档的编号，plan 只负责实现路径。

**工具调用的完整性**

- R1. 每一次工具调用都必须可见：同轮多调用、跨轮多调用全部渲染，不允许「只剩最后一条」。
- R2. 轮次边界以消息是否携带 `finishReason` 判定：携带 → 新起 tool_call 段落；不携带 → 并入上一个 tool_call 段落。
- R3. 同一 `id` 的调用再次到达时覆盖原条目，不追加重复项。
- R4. 无 `id` 的调用按到达顺序追加，互不覆盖。
- R5. 段落顺序即到达顺序；多段落各自成行。无 `chunks` 的历史消息仍按现有逻辑展示聚合后的工具调用。

**加载态**

- R6. 多轮工具调用期间消息加载态保持正确：`finishReason` 为 `tool_calls` 时不把整条消息标记为已结束，也不提前折叠仍在进行的思考段落。

**兼容性**

- R7. 工具调用字段名按驼峰 `toolCalls` 解析，与 morrigan 侧改名后的对外协议一致（改名计划见 morrigan 的 `docs/plans/2026-11-12-001-fix-tool-call-json-naming-plan.md`）。

**单次处理**

- R17. 每条 SSE 消息只被处理一次（详见 origin 的 R17）：重复处理会让工具调用落地两遍。

**改动范围**

- R8. 限定在前端解析与渲染层；`chunks` 仍为 `Chat.MessageChunk[]`，仅在 `Chat.Tool` 上新增折叠态字段。

**工具调用的折叠/展开**

- R9. 以单个调用为粒度折叠：折叠态显示工具名与参数摘要，展开态显示完整参数；同轮多调用各自独立折叠。
- R10. 摘要取格式化后的参数文本并截断（约 60 字符）；展开态显示完整参数，采用等宽字体按格式化 JSON 呈现。
- R11. 调用进行中默认展开；该轮结束后自动折叠；用户手动状态优先。
- R12. 折叠状态两层：自动策略写在数据侧（随消息持久化），手动切换写在视图侧（组件本地）。
- R13. 工具执行结果不并入折叠块，`[tool] name: result` 文本仍按现有方式渲染在正文中。
- R14. 折叠交互与 think 段落一致：可点击头部、箭头图标、内容区展开/收起。
- R15. 「本轮工具调用结束」与「整条消息结束」是两个独立判定。
- R16. 新增文案同步全部 7 个 locale 文件。

**Origin acceptance examples:** AE1–AE10（origin 文档）

---

## Scope Boundaries

- 不改 SSE 协议，不改 morrigan 后端。
- 不改仓库内 `service/` 的驼峰 `toolCalls` 形态——该服务不是现网 chat 后端。
- 不做工具执行结果与调用的配对展示，不做结果面板或执行日志展示。
- 不做工具调用的重放、重试或手动触发。
- 不做思考段落（think）的展示形态调整。
- 不做折叠状态的跨会话共享。
- 不引入新的 UI 依赖或组件库能力。

---

## Context & Research

### Relevant Code and Patterns

- SSE 处理主循环：`src/views/chat/index.vue` 的 `createSSEHandler` / `handleMessage`（`tool_calls` 落地在 97–133 行，`finishReason` 分支在 279–310 行，思考段落延迟折叠在 185–219 行）。
- 消息段落类型：`src/typings/chat.d.ts`（`Chat.MessageChunk` 的 `type` / `content` / `toolCalls` / `loading` / `collapsed` / `thinkDuration`；`Chat.Tool` 现只有 `name` / `arguments` / `id`）。
- 渲染层：`src/views/chat/components/Message/Text.vue`（思考段落折叠：`thinkCollapsedStates` Map、`isThinkCollapsed` / `toggleThinkCollapse`、头部点击 + 箭头图标、内容区 `v-show`；工具调用段落 437–450 行的 inline span 渲染；`formatArguments` / `formatValue` 参数格式化在 229–282 行）。
- 样式：`src/views/chat/components/Message/style.less`（`.think-content` 边框、背景、`max-height` + 滚动条、`fadeIn` 动画）。
- SSE 报文类型：`src/api/index.ts` 的 `StreamMessage`（`tool_calls?: Array<ToolCall>`）与 `ToolCall` / `Function`；`fetchChatStream` 的 `receiveMessage` 把解析后的 JSON 原样透传给 `onMessage`，不做键名归一。
- 纯函数与测试口径：`src/views/skill/utils.ts` + `utils.test.ts`、`src/views/memory/utils.ts` + `utils.test.ts`（视图目录放纯函数、配同名单测，是仓库既有做法）。
- 多语言：`src/locales/*.ts` 七个语言文件，`src/locales/locale.test.ts` 校验 corpus / skill / memory 三段的键集合与插值参数（`chat` 段当前不在校验范围内）。

### Institutional Learnings

- 仓库没有 `docs/solutions/`；`docs/todos/` 里的未决条目与本次无关。
- 既有教训：`src/views/chat/index.vue` 的 SSE 处理逻辑内联在 `.vue` 中，难以单测；可判定的分支应上提到视图目录的纯函数文件。

### External References

- 现网 chat 后端为另一项目 `morrigan`，本次按其实际报文实现（一轮一条携带完整数组、带 `finishReason: "tool_calls"`），不深入其实现。协议字段名的改名（`tool_calls` → `toolCalls`）由 morrigan 侧的独立计划完成，两边按同一节奏发布。

---

## Key Technical Decisions

- **轮次边界用 `finishReason` 判定，不用「id 是否出现过」判定**：后端每轮携带完整数组、id 跨轮不复用；用 id 判定会把「同一轮拆成多条消息」的多个调用误判成多轮，段落被切碎。
- **同轮内按 id 合并而非整段替换**：同时兼容参数续传与同轮多消息两种形态，任何情况下都不丢调用。
- **段落只增不减**：新轮次新起段落，历史轮次不再被触碰，从结构上消除「覆盖」这一类问题。
- **折叠粒度取单个调用**：参数长度差异极大（有的几字符、有的几百字符），按调用折叠才能各取所需。
- **折叠态两层存放**：数据侧记自动策略的结果、视图侧记用户手动切换，直接沿用 think 段落的既有实现，不引入新机制。
- **展开态显示格式化 JSON（缩进 2 空格）、摘要用扁平单行**：展开态要能直接复制命令，摘要要能一瞥即知；两者都基于同一份 `JSON.parse` 结果，避免两套解析。
- **`formatArguments` / `formatValue` 从 `Text.vue` 移到 `utils.ts`**：参数格式化要被视图层和纯函数同时使用，且需要单测。
- **纯函数上提、组件只做装配**：仓库没有组件挂载测试框架（未装 `@vue/test-utils`），可判定的分支（合并、摘要、折叠判定）一律进 `utils.ts` 由单测覆盖。

---

## Open Questions

### Resolved During Planning

- 现网后端归属与报文形态：morrigan，以用户抓到的报文为准——`tool_calls` 下划线、一轮一条携带完整数组、每条带 `finishReason: "tool_calls"`。R7 据此收敛，不做驼峰兼容（origin 的 Q1 已同步更新）。
- 折叠粒度、折叠态内容、默认展开策略、工具结果是否并入：分别在「单个调用级」「工具名 + 参数摘要」「完成后自动折叠」「不并入」上定案（origin 的决策记录）。

### Deferred to Implementation

- 参数摘要的截断长度取 60 还是 80 字符，按真实参数分布定。**实现取 60 字符**（`summarizeToolArguments` 的默认 `limit`）。
- 折叠头是否额外显示耗时（当前 `Chat.Tool` 没有耗时字段，需要后端配合则不在本次范围）。
- 折叠块展开态的最大高度与滚动策略：参照 `.think-content` 的 `max-height: 400px` 取值，上限值实现时定。**实现取 `max-height: 400px` + `overflow-y: auto`**，与思考段落一致。

---

## Output Structure

    src/
      api/
        index.ts              # 修改：StreamMessage 的工具调用字段改名为驼峰 toolCalls
      typings/
        chat.d.ts             # 修改：Chat.Tool 增加 collapsed 折叠态字段
      views/chat/
        utils.ts              # 新增：工具调用落地、合并、参数格式化与摘要
        utils.test.ts         # 新增：纯函数测试
        index.vue             # 修改：调用落地接线、finishReason 分流、自动折叠
        components/Message/
          Text.vue            # 修改：工具调用折叠条目渲染
          style.less          # 修改：折叠块样式
      locales/
        zh-CN.ts, en-US.ts, zh-TW.ts, es-ES.ts, ko-KR.ts, ru-RU.ts, vi-VN.ts   # 修改：chat 段新增文案

---

## Implementation Units

### U1. 工具调用落地的纯函数

**Goal:** 把「一轮工具调用如何落进消息段落」和「参数如何格式化 / 摘要」收敛成可测的纯函数。

**Requirements:** R1, R2, R3, R4, R10

**Dependencies:** None

**Files:**
- Create: `src/views/chat/utils.ts`
- Test: `src/views/chat/utils.test.ts`

**Approach:**
- `applyToolCalls(chunks: Chat.MessageChunk[], rawCalls: ToolCall[], finishReason?: string): Chat.MessageChunk[]`
  - 把 `rawCalls` 映射成 `Chat.Tool`（`id` / `name` / `arguments`，缺字段补空串）。
  - 末段是 `tool_call` 且**没有** `finishReason` → 同一轮，合并进末段；否则 → 新起一段。
  - 合并规则：同 `id` 覆盖原条目（参数续传），`id` 为空或不同则追加（到达顺序）。
  - 合并时保留既有条目的折叠态字段，不因参数更新而重置用户已展开的条目。
- `formatToolArguments(args: string): string`——展开态文本：`JSON.parse` 成功则 `JSON.stringify(parsed, null, 2)`，失败则原样返回。
- `summarizeToolArguments(args: string, limit = 60): string`——折叠态摘要：复用现有 `formatValue` 的扁平化输出（`formatArguments` 的逗号连接形态），把换行折成空格后截断到 `limit` 并补省略号。
- 把 `Text.vue` 现有的 `formatArguments` / `formatValue` 迁到 `utils.ts` 并导出（保持行为不变，`Text.vue` 改为引用），避免两处格式化逻辑漂移。

**Patterns to follow:**
- `src/views/skill/utils.ts`（纯函数导出形态与命名）
- `src/views/memory/utils.ts`（错误映射类纯函数的写法）

**Test scenarios:**
- Happy path: Covers AE1. 三轮各自带 `finishReason` 依次落地 → 产生三个 tool_call 段落，调用总数为 4 且按到达顺序排列，先前段落不被改写。
- Happy path: Covers AE2. 同一轮两个调用分两条消息下发（均无 `finishReason`）→ 合并进同一段落，段落数为 1、调用数为 2。
- Happy path: Covers AE3. 同 `id` 的调用二次到达 → 段落内仍只有一条，参数为最新值。
- Edge case: Covers AE4. 无 `id` 的调用先后到达 → 两条都在，互不覆盖。
- Edge case: 无 `finishReason` 但末段不是 tool_call（如中间插了文本段）→ 新起段落，不并入。
- Edge case: 合并时同 `id` 条目的折叠态不被重置。
- Happy path: 参数是合法 JSON → 展开文本为缩进 2 空格的 JSON；不是合法 JSON → 原样返回。
- Happy path: 摘要超长时截断并补省略号；参数很短时摘要即全文。

**Verification:** `pnpm test` 中新单测全部通过；纯函数里不再出现与 SSE 事件循环耦合的逻辑。

---

### U2. 数据侧：类型与自动折叠策略

**Goal:** 让「本轮工具调用结束」与「整条消息结束」分开判定，并把自动折叠的结果写进数据侧。

**Requirements:** R6, R8, R11, R12, R15, R17

**Dependencies:** U1

**Files:**
- Modify: `src/api/index.ts`
- Modify: `src/typings/chat.d.ts`
- Modify: `src/views/chat/index.vue`

**Approach:**
- `src/api/index.ts` 的 `StreamMessage` 把工具调用字段改为驼峰 `toolCalls`（与 morrigan 改名后的对外协议一致）；`ToolCall` / `Function` 的内部字段名（`id` / `type` / `function` / `name` / `arguments`）不变，morrigan 不改数组内部结构。
- `Chat.Tool` 增加 `collapsed?: boolean`（单个调用级折叠要求状态挂在调用上；段落级的 `Chat.MessageChunk.collapsed` 继续专供 think 段落）。
- `handleMessage` 的工具调用分支改为调用 `applyToolCalls`，不再自行 push / 替换段落；原「把文本与思考段落标记为完成」的逻辑保持不变。
- `finishReason` 分支按取值分流：
  - `tool_calls` / `tool_use` → 只结束本轮工具调用：把该轮 tool_call 段落的 `loading` 置 false、其下每个调用的 `collapsed` 置 true；**不动** think 段落的折叠时机；**不**把消息整体 `loading` 置 false（下一轮还在继续）。
  - 其他取值（`stop` / `length`）→ 保持现有行为：所有段落 `loading` 置 false、think 折叠、消息 `loading` 置 false。
- 折叠状态写在 chunk 内、随消息经 `updateChat` / `updateChatSome` 写回 chat store，因此自动折叠结果随消息持久化（刷新后仍是折叠态）。
- **每条 SSE 消息只处理一次**：`fetchWithLongReply` 内部已经调用 `handleMessage(data)`，原先又调用 `_onMessage?.(data)`，而调用方传入的正是 `handler.handleMessage` 自己——同一事件被处理两遍。修法是去掉 `_onMessage` 这层回调（`fetch` 不再接受回调参数），并把 `handleMessage` 从 `createSSEHandler` 的返回值里移除，使重复调用在结构上不可能发生。
- **随之移除 `lastDelta` / `lastThink` 去重**：这两段去重是重复处理的补偿逻辑（提交 `c30fa1d` 引入），重复处理移除后它们会误伤合法的增量——连续两个相同的增量片段（如两个相同的 `delta`）会被当成重复而丢弃，且其提前 `return` 会跳过整条消息的更新。移除后文本与思考内容按流原样累加。

**Patterns to follow:**
- `src/views/chat/index.vue` 现有 think 段落折叠写法（`chunks.map` 生成新段落而非原地改）

**Test scenarios:**
- Test expectation: none -- 本单元是 `.vue` 内的接线层，仓库没有组件挂载测试框架；可判定的分支（合并、折叠判定）已上提到 U1 的纯函数。实现中若出现新的条件分支，同样上提并补测试。重复处理的修复同样无法用纯函数覆盖，靠「`handleMessage` 不再对外暴露 + `fetch` 不接受回调」的结构约束保证，并用真实报文人工走查验证。

**Verification:** 手动走查：一次带工具的对话结束后，工具调用条目为折叠态、消息不再显示加载态；工具轮与后续轮之间消息加载态不熄灭（AE6、AE9）。

---

### U3. 渲染侧：折叠条目

**Goal:** 工具调用渲染为单个调用级的可折叠条目。

**Requirements:** R9, R10, R12, R13, R14

**Dependencies:** U1, U2

**Files:**
- Modify: `src/views/chat/components/Message/Text.vue`
- Modify: `src/views/chat/components/Message/style.less`
- Test: `src/views/chat/components/Message/Text.render.test.ts`

**Approach:**
- 工具调用段落内，每个调用渲染为一个块级条目：
  - 头部（可点击）：工具图标 + 工具名 + 参数摘要 + 箭头图标（展开 `ri:arrow-down-s-line` / 折叠 `ri:arrow-right-s-line`，与 think 段落同一组图标）。
  - 内容区：等宽字体展示 `formatToolArguments` 的完整参数，长内容限高滚动（参照 `.think-content` 的 `max-height` + `overflow-y: auto`）。
- 折叠态判定与 think 段落同构：`isToolCallCollapsed(idx, tcIdx, tc)` 先看组件本地的手动状态 Map（键为 `idx-tcIdx`），没有手动状态时看 `tc.collapsed`；`toggleToolCallCollapse` 只改本地 Map，不回写数据侧（与 think 段落一致：手动切换不持久化，刷新后回到自动策略的结果）。
- 展开态按需渲染内容（`v-show`），折叠时不渲染参数全文，只渲染摘要。
- 工具执行结果不并入：`[tool] ...` 文本仍由既有的 text 段落渲染，折叠块内只有调用本身（R13）。
- 无 `chunks` 的历史消息走既有的顶层 `toolCalls` 分支，同步改为可折叠条目形态，保持新旧消息表现一致。

**Patterns to follow:**
- `Text.vue` 的 think 段落折叠实现（状态 Map、`isThinkCollapsed` / `toggleThinkCollapse`、头部点击、箭头图标、内容区 `v-show`）
- `style.less` 的 `.think-content`（边框、背景、限高滚动、`fadeIn` 动画）

**Test scenarios:**
- 渲染断言：`Text.render.test.ts` 用 `createApp` + jsdom 挂载组件（无需引入 `@vue/test-utils`），断言「折叠态：每个调用只出一行头部、参数体隐藏」「展开态：头部与参数体同时可见」「不同轮次的调用分属不同段落」。折叠判定逻辑本身是「本地手动状态优先、否则用数据侧状态」，与 think 同构。

**Verification:** 手动走查：长参数的调用折叠后不撑爆消息行、摘要可读；点击头部展开显示完整参数并可复制；再次点击收起；该轮结束后自动折叠；手动展开后保持展开直到重新生成（AE7、AE8）。

---

### U4. 多语言文案

**Goal:** 补齐折叠相关文案，七个语言文件键集合保持一致。

**Requirements:** R16

**Dependencies:** None

**Files:**
- Modify: `src/locales/zh-CN.ts`, `src/locales/en-US.ts`, `src/locales/zh-TW.ts`, `src/locales/es-ES.ts`, `src/locales/ko-KR.ts`, `src/locales/ru-RU.ts`, `src/locales/vi-VN.ts`

**Approach:**
- 在 `chat` 段新增折叠所需的文案：折叠条目的无障碍 / 提示标签（如 `chat.toolCall`：工具调用）。折叠头本身只显示工具名与摘要，不需要额外标题文案。
- 七个语言文件同步补齐；`chat` 段当前不在 `locale.test.ts` 的校验范围内（该测试只覆盖 corpus / skill / memory），本次按仓库约定全量补齐即可，是否把 `chat` 段纳入校验留作后续。

**Patterns to follow:**
- `src/locales/zh-CN.ts` 的 `chat` 段（`thinking` / `thinkingWithDuration` / `thoughtFor` 的键命名与句式）

**Test scenarios:**
- Happy path: 七个语言的 `chat` 段新增键全部存在，页面不出现裸 key。
- Error path: 任一语言漏键时页面对应位置显示原始 key，人工核对七个文件。

**Verification:** `pnpm test` 通过；切换语言逐一确认折叠条目文案正常。

---

## System-Wide Impact

- **Interaction graph:** 解析（`handleMessage`）→ 段落结构（`chunks`）→ 渲染（`Text.vue`）三处必须同步改动：只改解析会出现「调用都在但折叠态不生效」，只改渲染会出现「仍然只显示最后一条」。
- **Error propagation:** SSE 报文形态由后端决定；解析层对缺字段（无 `id`、无 `function`、参数非 JSON）一律降级处理，不抛错。
- **State lifecycle risks:** `chunks` 会随 chat state 持久化到 localStorage，每个工具调用多一个 `collapsed` 布尔字段，体积增量可忽略；`updateChat` 整体替换消息对象，因此折叠状态必须随 `chunks` 一起写入，不能只留在组件本地。
- **API surface parity:** 不涉及接口变更。
- **Integration coverage:** 需要 morrigan 后端联调才能验证真实报文下的完整链路；单测只覆盖纯函数。
- **Unchanged invariants:** 不改 SSE 协议、不改 morrigan、不改 `service/`、不改 think 段落的既有折叠行为、不改消息持久化的整体结构。

---

## Risks & Dependencies

| 风险 | 缓解 |
|------|------|
| morrigan 的报文形态后续变化（如改成每个调用一条事件、或不带 `finishReason`） | 合并逻辑对两种形态都成立：同轮多消息合并、不带 `finishReason` 时多轮并入同一段落——调用不丢，仅分组不同 |
| 工具调用字段改名（`tool_calls` → `toolCalls`）与前端不同步发布 | 后端过渡期双写（morrigan 计划 U2），前端切到驼峰后再由后端摘除下划线字段；未同步的窗口内表现为工具调用不显示而非报错，需按发布顺序走 |
| `finishReason` 分流改动影响 think 段落的折叠时机 | `tool_calls` 轮不动 think 段落的 `collapsed`；回归走查一次带思考的对话 |
| 手动折叠不持久化，刷新后回到自动折叠态 | 与 think 段落行为一致，属既定取舍；自动折叠结果本身是持久化的 |
| `chunks` 体积随工具调用数量增长 | 每个调用仅多一个布尔字段；参数文本本身已是既有开销，不新增放大 |
| 折叠展开态长内容撑高消息 | 参照 `.think-content` 限高 + 滚动，不让单个调用无限拉长消息 |

---

## Documentation / Operational Notes

- 无需改动 `CLAUDE.md` / `AGENTS.md`：本次不新增页面、不新增路由，沿用既有 SSE 处理与消息渲染约定。
- 代码变更走分支与 PR（`docs/` 里的需求与计划文档可直接进 `main`）。
- 本计划是 `docs/brainstorms/2026-11-12-tool-call-rendering-requirements.md` 的实现路径，需求变更应回上游文档而不是就地改计划。

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-11-12-tool-call-rendering-requirements.md](../brainstorms/2026-11-12-tool-call-rendering-requirements.md)
- 前端参照实现：`src/views/chat/index.vue`（`createSSEHandler`）、`src/views/chat/components/Message/Text.vue`、`src/views/chat/components/Message/style.less`、`src/views/skill/utils.ts`
