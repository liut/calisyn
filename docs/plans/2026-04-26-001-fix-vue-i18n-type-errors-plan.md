---
title: 修复 vue-i18n 类型错误
type: fix
status: active
date: 2026-04-26
---

# 修复 vue-i18n 类型错误

## Overview

修复 `vue-tsc` 类型检查中出现的 `Property '$t' does not exist` 错误。根本原因是代码在模板中使用了 `$t` (Options API 风格)，但项目已迁移到 Composition API 风格使用 `t()` 函数，导致类型不匹配。

## 问题分析

### 错误信息

```
Property '$t' does not exist on type '{ $: ComponentInternalInstance; ... }'
```

### 受影响文件 (8个)

| 文件 | 位置 |
|------|------|
| `src/components/common/Setting/General.vue` | 模板中多处 |
| `src/components/common/Setting/About.vue` | 模板中 |
| `src/components/common/Setting/Advanced.vue` | 模板中 |
| `src/components/common/Setting/index.vue` | 模板中 |
| `src/components/common/PromptStore/index.vue` | 模板中 |
| `src/views/chat/layout/Permission.vue` | 模板中 |
| `src/views/chat/layout/sider/index.vue` | 模板中 |
| `src/views/chat/layout/sider/List.vue` | 模板中 |

### 根本原因

项目使用 vue-i18n 的 Composition API 风格：

```ts
// src/locales/index.ts
import { t } from '@/locales'  // 导出一个全局 t 函数

// 在 <script setup> 中使用
const { t } = useI18n()  // 或者直接调用 t()
```

但在模板中仍使用 Options API 风格的 `$t`：

```html
<template>
  {{ $t('common.import') }}  <!-- 类型错误：$t 不存在 -->
</template>
```

### 为什么之前没报错？

| 版本组合 | 类型检查结果 |
|---------|-------------|
| vue-tsc v1 + TS 4.9.5 | 不检查模板中的 `$t` 类型 |
| vue-tsc v2 + TS 5.6 | **正确检查**模板类型，发现 `$t` 未定义 |

## 解决方案

### 方案选择

| 方案 | 优点 | 缺点 |
|------|------|------|
| A: 全部替换为 `t()` | 彻底解决，统一风格 | 需修改所有模板 |
| B: 使用 `useI18n()` | 类型安全，符合 Composition API | 仍需修改模板 |
| C: 全局类型声明 | 无需逐个文件修改 | 治标不治本 |
| D: 跳过 type-check | 快速，Vite 升级已完成 | 不推荐，隐藏问题 |

**推荐方案 C（尝试中）**：通过 Vue 模块扩展声明全局 `$t` 类型，无需逐个文件修改导入。

### 方案 D: 升级 vue-i18n 到 v11（已尝试，未解决）

升级 vue-i18n 从 9.14.5 到 11.4.0。

**结果：**
- `pnpm run build-only`: ✅ 成功构建
- `pnpm run type-check`: ❌ 仍报 `$t` 类型错误

**分析：** vue-i18n v11 也没有改变全局 `$t` 的类型声明方式，问题仍然是 vue-tsc v2 无法识别模板中的 `$t`。

**结论：** 需要改用方案 A 或 B，修改模板中的 `$t` 调用。

## 实施步骤

### Step 1: 确认 t 函数可全局访问

在 `src/locales/index.ts` 中已导出全局 `t` 函数：

```ts
export const t = i18n.global.t
```

但模板中直接使用 `$t` 找不到这个函数。需要在每个 Vue 文件中通过以下方式暴露 `t`：

```html
<script lang="ts" setup>
import { t } from '@/locales'
</script>

<template>
  {{ t('common.import') }}
</template>
```

### Step 2: 批量替换

将以下模式替换：

```
$t('  →  t('
$t("  →  t("
```

### Step 3: 验证

```bash
pnpm run type-check
pnpm run build
pnpm run lint
```

## 受影响的代码模式

### 典型错误示例

```html
<!-- General.vue:178 -->
{{ $t('common.import') }}

<!-- 需要改为 -->
{{ t('common.import') }}
```

### 需要导入的文件

每个受影响的 Vue 文件都需要在 `<script setup>` 中添加：

```ts
import { t } from '@/locales'
```

## 依赖

- `vue-i18n`: ^9.14.0 (当前版本)
- `vue-tsc`: ^2.0.0 (当前版本)
- `typescript`: ~5.6.0 (当前版本)

## 参考

- [Vue I18n - Composition API](https://vue-i18n.intlify.dev/guide/composition.html)
- [vue-i18n global t function typing](https://github.com/vuejs/core/issues/4299)
