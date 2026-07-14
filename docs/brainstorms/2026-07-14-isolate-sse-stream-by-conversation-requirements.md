---
date: 2026-07-14
topic: isolate-sse-stream-by-conversation
---

# Isolate SSE Stream by Conversation

## Summary

把每条 SSE 生成任务归属于其发起会话，切换会话不再影响流式写入目标；切换后原生成后台继续，不同会话允许并发生成，但同一会话同时只允许一条流，“停止生成”仅作用于当前会话。

## Problem Frame

在 `src/views/chat/index.vue` 的 `createSSEHandler` 中，SSE 的写入目标 `currentCsid` 在每个 chunk 到来时都重读 `route.params.csid`（行 86、201、254 等），而不是锁定为发起请求时的会话。用户在前一条流尚未结束时通过 `src/views/chat/layout/sider/List.vue:23` 切换到其他会话，旧请求的后续 chunk 会写入新选中会话的 `chat[].data[]`，导致内容互相覆盖、界面混乱，即使再切回原会话也已污染。该问题根源于“当前路由”被同时承担了“写入目标”和“展示目标”两重职责。

## Requirements

- R1. 任何进行中的 SSE 流，其生成内容（消息文本、loading 状态、停止操作可作用的目标）只写入该流发起时的会话标识，不被后续路由切换改变。
- R2. 用户在 SSE 尚未结束时切换到其他会话，原流继续接收并只更新原会话；切回原会话时能看到切走之后继续生成的内容。
- R3. 不同会话之间允许并发生成；同一会话同时只允许一条进行中的流，重复发起时按既有 “新请求替换旧请求” 路径中止旧流（与 `setActive` 路径下“浏览不停止”的语义区分）。
- R4. “停止生成”仅终止当前展示会话对应的流；其他后台会话的流不受影响。
- R5. 删除一个仍处于生成中的会话时，先中止该会话对应的流，再按现有逻辑移除会话数据；后续到达的迟到数据不得写入任何会话。
- R6. 当前会话的 SSE 正常完成（含异常结束）后，停止按钮与 loading 状态按会话隔离恢复，不影响其他后台会话的对应状态。

## Acceptance Examples

- AE1. **Covers R1, R2.** Given 会话 A 正在生成，when 用户在 aside 切换到会话 B 并停留若干秒，then 切回会话 A 时 A 的最后一条消息反映切走期间继续接收到的内容，且会话 B 不包含 A 的生成内容。
- AE2. **Covers R1, R4.** Given 会话 A 与会话 B 同时生成中，when 用户在会话 B 页面点击“停止生成”，then 仅会话 B 停止；会话 A 仍继续生成且其停止按钮仍可用。
- AE3. **Covers R3.** Given 会话 A 正在生成，when 用户在会话 A 页面再次发送新消息，then 会话 A 中旧的流被中止，新的流继续归属会话 A；其他后台会话不受影响。
- AE4. **Covers R5.** Given 会话 A 正在生成，when 用户在 aside 删除会话 A，then 对应流立即中止，且之后无任何 chunk 写入任何会话（包含因 race 到达的迟到事件）。
- AE5. **Covers R6.** Given 会话 A 在后台生成中且会话 B 正在展示，when 会话 A 的流自然结束，then 会话 A 自身 loading 状态与停止按钮按其归属恢复，会话 B 的展示状态不受影响。

## Success Criteria

- 用户从体验上不再看到“流式输出串到非发起会话”的现象：切换会话或并发多会话时，每个会话的内容与生成状态彼此独立。
- 规划者拿到本文档即可确定产品行为边界，无需再就 “切换时是否停止流 / 是否允许并发 / 删除生成中会话如何处理” 做产品决策。

## Scope Boundaries

- 不在本次范围：aside 中为后台生成中的会话新增 “生成中” 或 “已完成” 状态提示。
- 不在本次范围：同一会话内多条 SSE 同时生成的场景。
- 不在本次范围：与本缺陷无关的聊天状态管理重构（包括消息持久化、路由结构、LLM provider 改造）。
- 不在本次范围：调整 `service/src/llm/` 任何流式协议或服务端实现。

## Key Decisions

- 隔离维度选择 “按会话归属” 而非 “按全局单流”：与用户已经认可的 “后台继续” + “允许并发” 语义一致，且复用既有 `csid` 主键，避免引入额外的消息/任务 ID。
- 写入目标在流发起时锁定，路由只负责选择展示哪个会话：分离 “写入目标” 与 “展示目标” 是修复覆盖问题的最小改动。
- 删除生成中会话选择 “立即停止 + 丢弃迟到数据” 而非 “延后删除”：避免迟到数据落到不存在的会话或被错误归并到其他会话。

## Dependencies / Assumptions

- 依赖：前端已有按 `csid` 索引的消息存储（`src/store/modules/chat/index.ts` 中 `chat[].data[]` 与 `updateChatByCsid`），以及全局 `AbortController` 与 `onUnmounted` 既有中止基础设施。
- 假设：服务端的 SSE 协议不需调整（`conversation-id` 回写、`csid` 透传等已具备），本次修复完全在前端会话/任务管理层完成。
- 假设：用户重新生成 / 同一会话再次发送在产品上属于 “新请求替换旧请求” 语义，与本需求不冲突。

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Technical] 在 `createSSEHandler` 中应以何种结构持有 “流 → 归属 csid” 的映射（数组 / Map / store 字段），以及如何与 `AbortController` 配对释放。
- [Affects R5][Technical] 删除会话时如何确保流中止、组件状态与 store 状态三者的清理顺序，避免删除后仍有 UI 残影或迟到 chunk 命中已释放的 csid。
