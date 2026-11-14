---
title: 'feat: 流式生成期间的消息等待状态'
type: feat
status: pending
date: 2026-11-13
---

# feat: 流式生成期间的消息等待状态

## Summary

消息在 SSE 流结束前，右上角的动作列一直摆着「重新生成」按钮和「更多」菜单——「重新生成」暗示这条消息已经完成、可以重来，与实际状态相反；「更多」里的「删除」在流式期间会打断写入。方案 A：**动作列在流式期间原地换成等待指示**，流结束后恢复原样。位置、尺寸都不变，布局不跳，用户视线不用挪。

本次只改消息组件的动作列渲染与一条多语言文案，不动 SSE 处理与消息数据结构。

---

## Problem Frame

`src/views/chat/components/Message/index.vue:129-147`，助手消息右侧的动作列：

```html
<div class="flex flex-col">
  <button v-if="!inversion" class="mb-2 transition ..." @click="handleRegenerate">
    <SvgIcon icon="ri:restart-line" />
  </button>
  <NDropdown :trigger="..." :options="options" @select="handleSelect">
    <button class="transition ...">
      <SvgIcon icon="ri:more-2-fill" />
    </button>
  </NDropdown>
</div>
```

两个按钮对助手消息**始终可见**，与消息是否还在生成无关。

流式期间的三个具体问题：

1. **「重新生成」语义冲突**：按钮出现即表示「这条消息已完成，可以重来」。而助手消息在流式期间还没写完，点它会发起一次并行的重新生成，与正在跑的流叠加。
2. **「更多」菜单里的「删除」会打断写入**：`deleteChatByCsid(csid, index)` 删掉消息后，SSE 仍在往同一个下标写，`updateChat` 会把内容写进下一条消息或越界。
3. **「复制」复制到半截文本**：菜单里的复制读的是 `props.text`，流式期间它是半成品。

### 已经存在的等待信号

正文里并不缺等待信号，缺的是动作列不与之矛盾：

| 位置 | 信号 |
| --- | --- |
| 文本段落 | `markdown-body-generate` 的闪烁光标（`chunk.loading` 时） |
| 思考段落 | 「思考中 {n}秒」+ 脉冲 `...` |
| 工具调用条目 | 脉冲 `...` |
| 页面底部 | 「停止响应」按钮（`src/views/chat/index.vue`） |

所以本次不动这些，只修动作列。

### 为什么不是「藏起来」

最初的诉求是流式期间不出现这两枚按钮。直接藏掉的问题是：动作列变成空白，**空白不传达任何状态**，用户反而不知道流是不是卡住了。原地替换成等待指示，同一个视觉位置从「现在能做什么」切换成「正在生成」，状态变化在用户视线里发生，不需要额外的说明文案。

---

## Requirements

**等待状态**

- R1. 助手消息的 SSE 流未结束期间，消息右侧动作列显示等待指示，不显示「重新生成」按钮。
- R2. 流式期间不显示「更多」菜单（复制 / 删除 / 显示原文三项都收起）。
- R3. 等待指示原地占据「重新生成」按钮的位置与尺寸，流式结束、指示消失、按钮恢复时布局不发生位移。
- R4. 流式结束的判定沿用消息自身的 `loading` 属性：助手消息在流式期间为 `true`，结束后置 `false`（含错误结束——错误消息同样恢复「重新生成」按钮，便于重试）。

**状态覆盖**

- R5. 等待指示覆盖全部「流未结束」的形态：刚发出、等待模型首个 token 的占位阶段、工具调用轮次之间、重新生成的进行中阶段。
- R6. 用户消息（`inversion`）不受影响：其动作列只有「更多」菜单，且从不在流式期间。

**文案**

- R7. 等待指示带一个悬浮提示文案（如「生成中…」），新增的 i18n 键同步全部 7 个 locale 文件。

**改动范围**

- R8. 只改消息组件的模板渲染与一条多语言文案，不动 SSE 处理、消息数据结构与 store。

---

## Scope Boundaries

- 不改正文里的等待信号（文本光标、思考计时、工具调用的脉冲点）。
- 不新增「停止生成」按钮——页面底部已有全局「停止响应」，不做单条消息级别的停止。
- 不在气泡内加「生成中…」文案行（方案 B），本次只做动作列。
- 不给气泡加呼吸边框等动效外壳（方案 C）。
- 不改「更多」菜单的选项与行为，只在流式期间整体不渲染。
- 不改复制、删除、重新生成三个动作的语义。

---

## Context & Research

### Relevant Code and Patterns

- 消息组件：`src/views/chat/components/Message/index.vue`（`Props` 含 `loading?: boolean`；动作列在模板末尾的 `flex flex-col` 块里）。
- `loading` 的来源：`src/views/chat/index.vue` 传给 `<Message>` 的 `:loading="item?.loading"`；助手消息在 `updateChat(..., { loading: true })` 时置真，流结束由 `updateChatSome(..., { loading: false })` 置假，错误分支同样置假。
- 占位阶段：发出消息后立即 `addChat(..., { loading: true })` 插入一条「思考中」的助手消息——此时还没有任何 SSE 事件，`loading` 已经是 `true` ✓。
- 工具调用轮次：工具轮结束只结束该轮，消息级 `loading` 保持 `true`（见 `2026-11-12-001-fix-tool-call-rendering-and-folding-plan.md` 的 U2），因此工具轮期间指示器应保持显示 ✓。
- 重新生成：`onRegenerate` 把该条消息重置为 `loading: true`（`text` 为「思考中」），因此重新生成进行中同样显示指示器，且「重新生成」按钮消失——顺带堵掉了「连点重新生成发起并行流」的隐患。
- 图标：`SvgIcon`（`src/components/common/SvgIcon/index.vue`）是 `@iconify/vue` 的 `Icon` 包装，只透传 class / style；图标默认 1em，与父级字号一致。
- 旋转动画：仓库用 Tailwind，`animate-spin` 可直接用；`animate-pulse` 已在思考段落与工具调用条目里使用（`Text.vue`）。
- 多语言：`src/locales/*.ts` 七个文件，`chat` 段当前不在 `locale.test.ts` 的校验范围内，仍按仓库约定全量补齐。

### Institutional Learnings

- 上一份计划的教训：可判定的分支应上提到纯函数并配单测；本计划只有一处模板条件分支（`loading` 真假），沿用既有做法不额外抽象。
- 上一份计划新增了 `src/views/chat/components/Message/Text.render.test.ts`（`createApp` + jsdom 挂载，不需要 `@vue/test-utils`），本次的渲染断言可以沿用同一手法。

---

## Key Technical Decisions

- **原地替换而不是藏起来**：动作列是「这条消息现在能对它做什么」的语义位，流式期间「能做的事」变成「正在生成」，在同一位上切换状态最自然；藏掉会让该列变成一片空白，反而丢掉状态信息。
- **用消息自身的 `loading` 而不是另加状态**：助手消息的 `loading` 已经精确覆盖「流未结束」的全部阶段（占位、生成中、工具轮之间、重新生成中），不需要额外的标志位，也不会与 store 里的状态不同步。
- **整个「更多」菜单收起而不是只禁用「删除」**：菜单是浮层，流式期间任何一项都意义不大（复制拿到半截文本），整体收起最简单，也避免菜单在流式中途弹出。
- **指示器不绑定点击**：渲染成 `div` 而非 `disabled` 按钮——禁用按钮仍可聚焦、仍像可点，语义上会误导。
- **提示用 `title` 而不是常驻文案**：常驻文案会把动作列撑宽、挤动布局；`title` 在悬停时给出说明，不占空间。

---

## Output Structure

    src/
      views/chat/components/Message/
        index.vue               # 修改：动作列的流式分支
      locales/
        zh-CN.ts, en-US.ts, zh-TW.ts, es-ES.ts, ko-KR.ts, ru-RU.ts, vi-VN.ts   # 修改：chat 段新增 generating

---

## Implementation Units

### U1. 动作列的等待指示

**Goal:** 流式期间动作列显示等待指示，结束后恢复「重新生成」与「更多」。

**Requirements:** R1, R2, R3, R4, R5, R6

**Dependencies:** None

**Files:**
- Modify: `src/views/chat/components/Message/index.vue`

**Approach:**
- 动作列改为三个互斥分支：`流式指示` / `重新生成按钮` / `更多菜单`。
- 指示器渲染成 `div`（不可点击、不聚焦），类名沿用按钮的 `mb-2` 与配色（`text-neutral-300 dark:text-neutral-200`），内部是 `SvgIcon icon="ri:loader-4-line" class="animate-spin"`；容器用 `flex items-center justify-center` 让图标居中，与按钮的图标位置一致。
- 「重新生成」按钮改为 `v-else-if="!inversion"`，与指示器互斥。
- 「更多」菜单的 `NDropdown` 加 `v-if="!loading"`——助手消息流式期间整个菜单不渲染；用户消息 `loading` 恒为 `false`，行为不变。
- 指示器带 `:title="t('chat.generating')"`。

**Patterns to follow:**
- `src/views/chat/components/Message/index.vue` 现有按钮的类名与 `SvgIcon` 用法
- `Text.vue` 里 `animate-pulse` 的用法（同一套 Tailwind 动效）

**Test scenarios:**
- 渲染断言（沿用 `Text.render.test.ts` 的 `createApp` + jsdom 手法，新建 `Message/index.render.test.ts`）：
  - `loading: true` 的助手消息：出现等待指示，不出现 `.ri:restart-line` 对应的重新生成按钮，不出现「更多」按钮
  - `loading: false` 的助手消息：出现重新生成按钮与「更多」按钮，不出现等待指示
  - `inversion: true` 的用户消息：不出现等待指示与重新生成按钮，出现「更多」按钮
- 手工走查：发一条消息，从点下发送到流结束，观察右侧动作列——指示器应在占位阶段就出现，中途工具轮不消失，流结束瞬间换成重新生成按钮。

**Verification:** `pnpm test` 通过；`pnpm type-check` 与 `pnpm lint` 干净。

---

### U2. 等待提示文案

**Goal:** 补齐七个语言的等待提示文案。

**Requirements:** R7

**Dependencies:** U1

**Files:**
- Modify: `src/locales/zh-CN.ts`, `src/locales/en-US.ts`, `src/locales/zh-TW.ts`, `src/locales/es-ES.ts`, `src/locales/ko-KR.ts`, `src/locales/ru-RU.ts`, `src/locales/vi-VN.ts`

**Approach:**
- 在 `chat` 段新增 `generating` 键（如 zh-CN：'生成中…'），作为指示器的 `title` 文案。
- 七个语言文件同步补齐。

**Patterns to follow:**
- `src/locales/zh-CN.ts` 的 `chat` 段键命名与句式

**Test scenarios:**
- 切换语言悬停等待指示，提示文案正常显示、不出现裸 key。

**Verification:** `pnpm test` 通过（`chat` 段当前不在 `locale.test.ts` 校验范围内，按仓库约定人工核对七个文件）。

---

## System-Wide Impact

- **Interaction graph:** `Message` 的 `loading` 属性 → 动作列渲染分支。只影响这一个组件的模板，无下游依赖。
- **Error propagation:** 不涉及错误路径；错误消息的 `loading` 为 `false`，恢复「重新生成」按钮，可重试。
- **State lifecycle risks:** 不引入新状态；`loading` 已是消息级字段，随消息持久化，刷新后行为一致。
- **API surface parity:** 不涉及接口变更。
- **Integration coverage:** 与 SSE 流式渲染联动验证——工具轮、重新生成两个阶段都要看到指示器不消失。
- **Unchanged invariants:** 正文等待信号、菜单选项与行为、重新生成的语义、SSE 处理逻辑、消息数据结构。

---

## Risks & Dependencies

| 风险 | 缓解 |
|------|------|
| 指示器太弱，长文本流里被忽略 | 位置与「重新生成」按钮重合，状态切换发生在用户视线内；悬停有文案说明 |
| `loading` 在某些结束路径上没被置假，指示器常驻 | 结束路径统一走 `updateChatSome(..., { loading: false })`（含错误分支）；实现后按 U1 的走查项逐一确认 |
| 隐藏「更多」菜单让用户流式期间无法复制 | 流式期间复制只能拿到半截文本，收益本就低；流结束即恢复 |
| 与底部全局「停止响应」按钮重复 | 两者作用层级不同（全局停止 vs 状态指示），不改动底部按钮 |

---

## Documentation / Operational Notes

- 本计划是 `docs/plans/2026-11-12-001-fix-tool-call-rendering-and-folding-plan.md` 的补充修订，两者互不依赖，可独立实现。
- 文档直进 `main`；代码变更走分支与 PR。
- 实现时同步更新本计划的状态（`status: pending` → `implemented`）。

---

## Sources & References

- 消息组件：`src/views/chat/components/Message/index.vue`
- `loading` 的写入方：`src/views/chat/index.vue`（`updateChat` / `updateChatSome` / `onRegenerate`）
- 图标包装：`src/components/common/SvgIcon/index.vue`
- 同类渲染断言先例：`src/views/chat/components/Message/Text.render.test.ts`
- 相关计划：`docs/plans/2026-11-12-001-fix-tool-call-rendering-and-folding-plan.md`
