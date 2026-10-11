---
title: 'feat: 记忆浏览与管理面板'
type: feat
status: completed
date: 2026-10-10
origin: docs/brainstorms/2026-10-10-memory-management-requirements.md
---

# feat: 记忆浏览与管理面板

## Summary

复用技能页那套「表格 + 抽屉」结构，给 Calisyn 加一个记忆页：侧边栏底部图标入口进入，表格浏览自己的记忆元数据，抽屉里读正文、修正分类 / 内容 / 分层并删除。实现分四层落地——记忆接口封装、页面纯函数与文案、页面接线与入口、列表与抽屉组件；列表请求固定限定本人，前端不做角色分支。

---

## Problem Frame

记忆由 agent 在对话中写入、经工具被模型召回，用户端一直没有可见面：记错的条目会一直作为事实被读回去。morrigan 的 `feat/memory-ownership`（fab00e2）补齐了归属约束与五个 HTTP 接口，前端缺的只是入口与页面。完整动机见 origin 文档。

---

## Requirements

以下需求沿用 origin 文档的编号，plan 只负责实现路径。

**入口与范围**

- R1. 独立记忆页 + 侧边栏底部图标入口，对所有登录用户显示。
- R2. 不做角色分支，不提供「指定用户 / 全站」视角，请求始终限定本人。
- R3. 不提供新建入口。
- R4. 鉴权与请求失败给出明确提示，不静默失败、不留空白页。

**列表与定位**

- R5. 表格展示 key、分层、分类、重要性评分、最近访问时间与更新时间，正文不在列表展示。
- R6. 分页展示并给出总数，点击行打开抽屉。
- R7. 默认按创建时间倒序，排序字段限定后端允许范围。
- R8. 提供关键词（按 key）与分层筛选，筛选走服务端参数。
- R9. 空、加载中、加载失败三态齐备，空态有说明而非「暂无数据」。

**详情与编辑**

- R10. 抽屉展示正文、分类、分层，以及只读的派生信号（重要性、衰减率、访问次数、最近访问时间、创建与更新时间）。
- R11. 抽屉内可编辑分类、正文、分层并保存，派生信号只读。
- R12. 保存成功后刷新抽屉与列表对应行；失败保留编辑内容并提示。
- R13. key 不可变更，界面不提供改名并说明需删除后重建。

**删除**

- R14. 删除需二次确认，提示写明不可恢复且不会再被召回。
- R15. 删除成功后从列表移除，失败保留原条目并提示。

**通用**

- R16. 文案接入现有多语言体系，所有 locale 文件同步补齐并通过一致性测试。
- R17. 复用现有请求封装、错误处理与页面接入模式，不引入新的请求基础设施。

**Origin actors:** A1（登录用户）、A2（Keeper，本页与普通用户一致）
**Origin flows:** F1（浏览与定位记忆）、F2（修正一条记忆）、F3（删除一条记忆）
**Origin acceptance examples:** AE1（同一页面、无视角切换）、AE2（列表无正文 / 抽屉有正文）、AE3（筛选走服务端）、AE4（保存与失败保留）、AE5（无改名入口）、AE6（删除二次确认）、AE7（条目已在别处删除时的提示）

---

## Scope Boundaries

- 不做新建记忆（origin 的对应边界沿用）。
- 不做 keeper 代查与全站视图。
- 不做聊天内的记忆旁路展示。
- 不做批量删除、导出、导入。
- 不展示向量与召回质量指标，不做衰减曲线可视化。
- 不改 morrigan 后端，不动对话链路，不动语料页与技能页。

---

## Context & Research

### Relevant Code and Patterns

- 列表面板与抽屉：`src/views/skill/components/SkillPanel.vue`（筛选条、远端表格、分页、请求序号防竞态、删除后回退页、三态空态）、`src/views/skill/components/SkillDrawer.vue`（按 id 拉详情、只读信号、局部 patch、二次确认）。
- 接口层与测试口径：`src/api/skill.ts`、`src/api/corpus.ts`（`{ status, result }` 信封的类型对齐写法）、`src/api/skill.test.ts`（mock 请求层断言参数成形）。
- 纯函数与测试：`src/views/skill/utils.ts` + `utils.test.ts`（错误映射、排序参数、patch 构造）。
- 页面接入：`src/router/index.ts`、`src/router/permission.ts`、`src/views/chat/layout/Layout.vue`（Root 子路由白名单，漏登记会被弹回聊天页）、`src/views/chat/layout/sider/Footer.vue`（图标入口写法）。
- 页面骨架：`src/views/skill/index.vue`（页头 + 返回聊天）。
- 多语言：`src/locales/*.ts`（七个语言文件、zh-CN 为基准）、`src/locales/locale.test.ts`（按键集合与插值参数逐语言比对）。

### Institutional Learnings

- 仓库没有 `docs/solutions/`；`docs/todos/` 里未决条目（dev server 暴露、workbox peer、计划文档精简等）与本次页面无关。

### External References

- morrigan 契约：`docs/swagger.json` 的 `convoMemory` / `convoMemoryBasic` / `convoMemorySet` 定义（`feat/memory-ownership` 分支）。
- 后端行为：`pkg/web/api/handle_convo.go`（五个接口与错误映射）、`pkg/services/stores/convo_x.go`（归属收窄、`SiftMatch` 前缀匹配、默认分页 20）。
- 排序白名单来自 andvari `stores/pgx` 的 `ModelSpec.CanSort`：仅 `id` / `created` / `updated`。

---

## Key Technical Decisions

- 复用技能页的「表格 + 抽屉」结构，不引入新的抽象或依赖：接口列表默认裁掉正文、正文需单独取详情，这套数据形态与技能页一一对应。
- 列表请求固定带「只看自己」的参数：后端的列表默认在 keeper 身份下返回全站，原样透传会让 keeper 在这页看到别人的记忆；前端据此把页面语义固定为本人，而不是去判断角色。
- 列表不拉正文、抽屉按 id 单独取正文：避免翻页时把全部正文一并拉下来。
- 排序只开放 `created` / `updated`（后端白名单决定），默认 `-created`，与技能页同一套参数形态。
- 筛选只做关键词（前缀匹配 key）与分层下拉；分类是自由文本、后端也是前缀匹配，单独做筛选项命中率过低。
- 分层按 `working` / `short-term` / `long-term` 三个已知值做标签与选项；库里出现未知值时原样只读展示，保存时不产出该字段。
- 正文是纯文本编辑，不做 Markdown 预览，也不加必填 / 格式校验：后端对正文无格式约束，空正文在数据模型里合法。
- 测试沿用仓库现有口径：接口参数成形、纯函数、路由注册与守卫、locale 一致性；仓库没有组件挂载测试框架，页面条件逻辑尽量上提到纯函数，SFC 只做装配。

---

## Open Questions

### Resolved During Planning

- 可排序字段：`created` / `updated`（`ModelSpec.CanSort` 白名单，已核实）。
- 关键词 / 分类 / 分层的匹配形态：前缀匹配（`SiftMatch` → `ILIKE 'value%'`），可与排序组合，已核实。
- 列表默认分页条数：服务端在未传分页参数时补 20 条（`defaultMemoryPageLimit`），前端显式传分页与之对齐。
- 错误到提示的映射：401 → 登录过期、403 → 无权限、404 → 条目不存在、其余 → 加载 / 保存 / 删除失败的兜底文案。
- 需要同步的语言文件：`src/locales/` 下七个语言文件，外加扩展 `locale.test.ts`。

### Deferred to Implementation

- 空态的说明文案与形态：撰写时定稿，不做「去创建一条」的引导（本版无新建入口）。
- 表格列宽与横向滚动宽度取值：按实际内容调，参照技能页的 `minWidth` / `scroll-x` 手法。
- 重要性评分的呈现细节（小数位或百分比）：实现时按真实数据分布定。

---

## Output Structure

    src/
      api/
        memory.ts            # 新增：记忆接口封装
        memory.test.ts       # 新增：接口参数成形测试
      views/
        memory/
          index.vue          # 新增：页面骨架（页头 + 返回聊天 + 面板）
          utils.ts           # 新增：分层标签、错误映射、patch 构造等纯函数
          utils.test.ts      # 新增：纯函数测试
          components/
            MemoryPanel.vue  # 新增：筛选 + 表格 + 分页 + 三态
            MemoryDrawer.vue # 新增：详情、编辑、保存、删除

---

## Implementation Units

### U1. 记忆接口封装

**Goal:** 提供记忆列表、详情、更新、删除四个调用，参数与类型与 morrigan 契约一致。

**Requirements:** R4, R5, R8, R10, R12, R15, R17

**Dependencies:** None

**Files:**
- Create: `src/api/memory.ts`
- Test: `src/api/memory.test.ts`

**Approach:**
- 类型对齐 swagger 的 `convoMemory`：列表行不含正文，详情行含正文；字段为 `id` / `ownerID` / `key` / `cate` / `tier` / `importanceScore` / `lastAccessedAt` / `accessCount` / `decayRate` / `createdAt` / `updatedAt` / `creatorID` / `meta`。
- 信封沿用现有写法：`{ status, result, message }` 加 `as unknown as Promise<...>` 的类型对齐注释，调用方按 `res.result?.data ?? []`、`res.result?.total ?? 0` 取值。
- 列表请求固定带上「只看自己」的参数，分页、排序、筛选由调用方传入；列表不请求正文。
- 详情按 id 取，更新只提交调用方给出的字段，删除按 id。
- 不提供创建接口：页面不做新建。

**Patterns to follow:**
- `src/api/skill.ts`、`src/api/corpus.ts`（信封与类型对齐注释）
- `src/api/skill.test.ts`（mock `@/utils/request` 断言参数）

**Test scenarios:**
- Happy path: 无参调用列表时，请求仍带上「只看自己」的参数；传入分页、排序、关键词、分层时与它合并透传。
- Happy path: 详情、更新、删除分别打到对应 URL 与方法，更新只包含传入的字段。
- Error path: 请求层抛出的错误原样向上传播，不被吞掉或改写。
- Integration: 响应缺少 `result` 时，调用方按空列表与总数 0 处理而不抛错。

**Verification:** 四个函数在单测中断言到完整 URL 与参数对象；类型字段名与 swagger 定义逐一对得上。

---

### U2. 记忆页多语言文案

**Goal:** 补齐记忆页所需的 `memory.*` 文案，七个语言文件键集合与插值参数保持一致。

**Requirements:** R16

**Dependencies:** None

**Files:**
- Modify: `src/locales/zh-CN.ts`, `src/locales/en-US.ts`, `src/locales/zh-TW.ts`, `src/locales/es-ES.ts`, `src/locales/ko-KR.ts`, `src/locales/ru-RU.ts`, `src/locales/vi-VN.ts`
- Test: `src/locales/locale.test.ts`

**Approach:**
- 新增与 `corpus` / `skill` 平级的顶层 `memory` 段，覆盖：入口与标题、返回聊天、关键词与分层筛选、列表列名（key / 分类 / 分层 / 重要性 / 最近访问 / 更新时间 / 创建时间）、总数与空态、加载失败与重试、无权限 / 登录过期 / 条目不存在、详情标题与加载失败、可编辑字段名、三个分层值标签与未知值说明、只读信号标签、保存与删除失败、删除确认标题与正文、key 不可改的说明。
- `locale.test.ts` 的 messages 类型与用例扩展到 `memory` 段，照 `skill` 段现有两条用例（键集合 + 插值参数）各加一条。

**Patterns to follow:**
- `src/locales/zh-CN.ts` 的 `skill` 段（键命名与提示句式）
- `src/locales/locale.test.ts` 的 `skill` 两条用例

**Test scenarios:**
- Happy path: 七个语言的 `memory` 段键集合与插值参数全部一致，测试通过。
- Error path: 任一语言漏键或插值参数写错时，对应语言的用例失败并指出键名。

**Verification:** `pnpm test` 中 locale 用例全部通过；页面上不出现裸 key。

---

### U3. 记忆页纯函数

**Goal:** 把分层标签映射、错误到文案的映射、更新 patch 构造、排序参数与回退页判定收敛成可测的纯函数。

**Requirements:** R7, R8, R10, R11, R12, R15

**Dependencies:** U1, U2

**Files:**
- Create: `src/views/memory/utils.ts`
- Test: `src/views/memory/utils.test.ts`

**Approach:**
- 分层：已知值到标签 key 的映射，返回是否可编辑；未知值返回只读分支。
- 错误映射：先看请求层保留的 HTTP 状态（401 / 403 / 404），其余回落到调用方给的兜底 key。
- 更新 patch：与详情快照逐字段比较，只产出真正变化的 `cate` / `content` / `tier`；分层不可编辑时不产出 `tier`。
- 排序参数：`descend` 用前导 `-` 表达，与语料、技能面板同形。
- 删除后的回退页判定：当前页已被清空且总数仍大于 0 且不在第一页时需要回退一页。

**Patterns to follow:**
- `src/views/skill/utils.ts`（`skillErrorKey`、`buildSkillPatch`、`skillSortParam`）

**Test scenarios:**
- Happy path: 三个已知分层值分别映射到各自标签且可编辑；排序参数按 `created` / `updated` 与升降序拼出正确字符串。
- Edge case: 未知或空的分层值走只读分支，patch 构造不产出 `tier`。
- Happy path: Covers AE4. 只有正文变化时 patch 只含正文；三项都没变时 patch 为空对象。
- Error path: Covers AE7. 401 / 403 / 404 各自映射到对应文案 key，未知错误与空 message 回落到兜底 key。
- Edge case: 首页删除最后一条（总数仍大于 0）时不回退，非首页删除最后一条时回退一页。

**Verification:** 纯函数单测覆盖以上场景；页面组件里不再残留同类条件判断。

---

### U4. 页面接入与入口

**Goal:** 记忆页可以通过侧边栏入口和直接访问路由进入，且不会被布局弹回聊天页。

**Requirements:** R1, R2, R3

**Dependencies:** U2

**Files:**
- Create: `src/views/memory/index.vue`
- Modify: `src/router/index.ts`, `src/views/chat/layout/Layout.vue`, `src/views/chat/layout/sider/Footer.vue`
- Test: `src/router/permission.test.ts`

**Approach:**
- 在 Root 下新增 `/memories` 子路由（name `Memory`，懒加载），并把它登记进 Layout 的白名单——漏登记会让直接打开被弹回聊天页。
- 侧边栏底部在技能入口旁加一个同款图标按钮（`ri:brain-line`，tooltip 用记忆入口文案），对所有登录用户显示，不加 keeper 判断。
- 页面骨架复用技能页：页头是「返回聊天」+ 标题，主体挂列表面板。
- 路由守卫不改：记忆页对所有登录用户开放，不需要像语料页那样的 keeper 拦截。

**Patterns to follow:**
- `src/views/chat/layout/sider/Footer.vue` 的技能入口写法
- `src/views/skill/index.vue` 的页头结构
- `src/router/permission.test.ts` 的路由注册断言

- Happy path: `/memories` 作为 Root 子路由注册且 name 为 `Memory`。
- Integration: 会话已建立时，守卫对记忆页直接放行——非 keeper 与 keeper 表现一致，不会被重定向到聊天页。

**Verification:** 从侧边栏点入口进入记忆页；直接打开 `#/memories` 停留在记忆页而不是被弹回聊天页。

---

### U5. 记忆列表面板

**Goal:** 用户能在页面上筛选、翻页、排序自己的记忆，并从行进入详情。

**Requirements:** R5, R6, R7, R8, R9, R15

**Dependencies:** U1, U3, U4

**Files:**
- Create: `src/views/memory/components/MemoryPanel.vue`

**Approach:**
- 顶部筛选条：关键词输入（回车或点搜索触发，清空即回到全量）+ 分层下拉，与技能页同样的排布方式。
- 表格走远端模式：列为 key、分类、分层、重要性评分、最近访问时间、更新时间、创建时间。创建时间是 origin 列表之外的补充列——排序白名单只有 `created` / `updated`，默认排序是创建时间倒序，没有这一列时排序状态在界面上不可见。
- 更新时间与创建时间可排序，默认 `-created`。
- 分页与总数、加载中状态交给表格自身的 `loading`，加载失败用错误条 + 重试而不是空态，避免把「取数失败」读成「没有记忆」。
- 请求序号防止旧响应覆盖新数据；保存或删除后重载当前页，页被清空时按 U3 的判定回退一页。
- 点击行打开抽屉，把该行 id 传下去。

**Patterns to follow:**
- `src/views/skill/components/SkillPanel.vue`（筛选条、`remote` 表格、三态空态、`reloadAfterMutation`、`loadToken`）

**Test scenarios:**
- Test expectation: none -- 本单元是可挂载组件的装配层，仓库没有组件挂载测试框架（未安装 `@vue/test-utils`），同类技能页与语料页的面板也只做装配；其中可判定的条件逻辑（排序参数、筛选参数成形、回退页、错误映射）已上提到 `utils.ts` 由 U3 覆盖。实现过程中若新增条件分支，同样上提并补测试。

**Verification:** 手动走查：切换分层与关键词后分页与总数同步变化；删除当前页最后一条时页面向后回退且不出现空表格；加载失败显示错误条与重试。

---

### U6. 记忆详情抽屉

**Goal:** 用户能读到一条记忆的完整正文，修正分类 / 内容 / 分层或删除它。

**Requirements:** R10, R11, R12, R13, R14, R15

**Dependencies:** U1, U3, U5

**Files:**
- Create: `src/views/memory/components/MemoryDrawer.vue`

**Approach:**
- 打开时按 id 拉详情（列表行没有正文），加载中与加载失败都有明确状态，`result` 缺失按失败处理。
- 切换条目时必须清空上一条的详情与编辑态，否则会在新数据到达前短暂显示上一条的内容。
- 只读信号区展示重要性评分、衰减率、访问次数、最近访问时间与创建 / 更新时间；key 只展示并提供「不可修改，要改需删除后重建」的说明。
- 可编辑区是分类、正文、分层：分层用三个已知值的下拉；库里是未知值时该字段只读并给出说明，保存时不提交它。
- 保存只提交变化字段（U3 的 patch 构造），无变化时保存按钮不可用；成功后同时刷新抽屉与列表对应行，失败保留已编辑内容并提示。
- 删除走二次确认，文案写明不可恢复且不会再被召回；成功后由列表移除并触发重载。
- 保存或删除遇到「条目不存在」时给出对应提示并让列表重载，不残留加载态。
- 本单元直接兑现 origin 的 AE2（列表无正文、抽屉有正文）、AE4（保存后新值生效、失败保留编辑内容，其中「不改动时保存不可用」是本单元补充的界面约束）、AE5（无改名入口）、AE6（删除二次确认）。

**Patterns to follow:**
- `src/views/skill/components/SkillDrawer.vue`（按 id 拉详情、只读信号、局部 patch、二次确认、`saved` / `deleted` 事件回传）

**Test scenarios:**
- Test expectation: none -- 同 U5：仓库无组件挂载测试框架，技能抽屉同样只做装配，可判定的条件逻辑（patch 构造、错误映射、分层只读分支）由 U3 覆盖；实现中新增的条件分支同样上提并补测试。

**Verification:** 手动走查：改分类或正文后保存，抽屉与列表都显示新值；不改动时保存不可用；分层未知值的记忆可以改正文但分层保持原值；删除有二次确认且取消无副作用；抽屉打开期间条目被删除时给出「条目不存在」提示并刷新列表。

---

## System-Wide Impact

- **Interaction graph:** 侧边栏入口、路由注册、Layout 白名单三处共同决定页面可达性，任一处漏改都会表现为入口缺失或页面被弹回聊天页。
- **Error propagation:** 请求层保留 HTTP 状态与 message，页面只经 U3 的映射函数产出一句提示；越权与不存在由后端判定，前端不做归属推断。
- **State lifecycle risks:** 列表与抽屉是两次请求（列表无正文），保存或删除后必须刷新列表，避免陈旧快照写回；请求序号防止并发 load 的旧响应覆盖新数据。
- **API surface parity:** 同一份记忆同时被 agent 工具（`memory_list` / `memory_recall` / `memory_store` / `memory_forget`）读写，页面只是同一归属规则上的另一个调用方。
- **Integration coverage:** 需要真实后端联调才能验证分页默认值、筛选前缀匹配与 403 / 404 分支；单测只覆盖参数成形与纯函数。
- **Unchanged invariants:** 不改 morrigan、不改对话链路、不动语料页与技能页、不改路由守卫的 keeper 拦截规则。

---

## Risks & Dependencies

| 风险 | 缓解 |
|------|------|
| morrigan 的记忆接口仍在 `feat/memory-ownership` 分支，未合并部署 | 实现开始前确认分支已合并并部署；联调指向该分支，否则页面会整体落到失败态 |
| keeper 打开页面看到全站记忆 | 列表固定带「只看自己」的参数，后端对普通用户本就强制收窄 |
| 七语言漏键导致一致性测试失败 | 文案与 `locale.test.ts` 扩展同批交付（U2） |
| 后端返回未知分层值，保存时被静默改写 | 未知值只读、不产出 patch 字段（U3 的只读分支） |
| 列表与抽屉数据不一致（正文只在详情里） | 保存 / 删除后统一重载列表；抽屉每次打开按 id 重取 |

---

## Documentation / Operational Notes

- 无需改动 `CLAUDE.md` / `AGENTS.md`：新增页面遵守「Root 子页面必须登记进 Layout 白名单」的既有约定，且代码变更走分支与 PR。
- 本计划是 `docs/brainstorms/2026-10-10-memory-management-requirements.md` 的实现路径，需求变更应回上游文档而不是就地改计划。

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-10-10-memory-management-requirements.md](../brainstorms/2026-10-10-memory-management-requirements.md)
- 前端参照实现：`src/views/skill/components/SkillPanel.vue`、`src/views/skill/components/SkillDrawer.vue`、`src/api/skill.ts`、`src/views/skill/utils.ts`
- 后端契约：morrigan `docs/swagger.json` 的 `convoMemory` 定义、`pkg/web/api/handle_convo.go`、`pkg/services/stores/convo_x.go`（分支 `feat/memory-ownership`，fab00e2）
