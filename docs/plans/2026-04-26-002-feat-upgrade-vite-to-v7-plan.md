---
title: 升级 Vite 6.x 至 Vite 7.x
type: feat
status: completed
date: 2026-04-26
---

# 升级 Vite 6.x 至 Vite 7.x

## Overview

将项目 Vite 依赖从 v6.4.2 升级至 v7.x（当前最新 v7.3.2），同步升级配套插件并验证破坏性变更对项目无影响。

## 当前状态

| 依赖 | 当前声明版本 | 当前安装版本 | 目标版本 |
|------|-------------|-------------|---------|
| vite | `^6.0.0` | 6.4.2 | `^7.0.0` |
| @vitejs/plugin-vue | `^5.0.0` | 5.2.4 | `^6.0.0` |
| vite-plugin-pwa | `^0.21.0` | 0.21.2 | `^1.0.0` |
| @types/node | `^20.0.0` | - | `^22.0.0` |
| Node.js | - | 22.15.0 | >=20.19 / >=22.12 |

## Vite 7 破坏性变更影响分析

基于 [Vite 7 Migration Guide](https://v7.vite.dev/guide/migration)，逐项分析对 Calisyn 的影响：

### 对项目有影响的变更

| 变更 | 影响 | 操作 |
|------|------|------|
| **Node.js 版本要求**: >= 20.19 / >= 22.12 | 当前 Node 22.15.0 ✅ | 更新 CLAUDE.md 中 Node >=18 → >=20.19 |
| **默认浏览器目标变更**: `'modules'` → `'baseline-widely-available'` | 构建输出目标浏览器版本提升（Chrome 107+, Safari 16+）。对现代 AI 应用无实际影响 | 验证构建产物，确认无需自定义 `build.target` |

### 对项目无影响的变更（已验证）

| 变更 | 验证结果 |
|------|---------|
| Sass 遗留 API 移除 | 项目使用 Less，不依赖 Sass |
| `splitVendorChunkPlugin` 移除 | 项目中未使用（grep 确认） |
| `transformIndexHtml` hook 签名变更 | 项目中无自定义 index.html 转换插件 |
| `legacy.proxySsrExternalModules` 移除 | 项目无 SSR |
| 废弃类型属性移除 | 项目中未引用相关类型 |
| 废弃 env API 属性移除 | 项目中未使用 |
| HotBroadcaster 相关类型移除 | 项目中未使用 |
| `optimizeDeps.entries` 始终为 glob | `vite.config.ts` 未配置 `optimizeDeps` |
| 中间件执行顺序变更 | 项目无自定义 `configureServer` 钩子 |
| `__vite_ssr_exportName__` SSR 变更 | 项目无 SSR |

### 插件兼容性（已验证）

| 插件 | Vite 7 兼容版本 | peerDependencies |
|------|----------------|-------------------|
| @vitejs/plugin-vue | >= 6.0.0 | `vite: "^5.0.0 \|\| ^6.0.0 \|\| ^7.0.0 \|\| ^8.0.0"` |
| vite-plugin-pwa | >= 1.0.0 | `vite: "^3.1.0 \|\| ... \|\| ^7.0.0"` |

### Vite 7 peerDependencies（对项目影响的）

Vite 7 新增了更严格的 peer dependency 版本范围。项目已安装的相关依赖：

| peer dep | 要求版本 | 当前版本 | 状态 |
|----------|---------|---------|------|
| `@types/node` | `^20.19.0 \|\| >=22.12.0` | `^20.0.0` | 需更新至 `^22.0.0` |
| `tsx` | `^4.8.1` | `^4.0.0` | 已满足（安装版本 >= 4.8.1 即可） |
| `yaml` | `^2.4.2` | `^2.0.0` | 已满足（安装版本 >= 2.4.2 即可） |
| `less` | `^4.0.0` | `^4.1.3` | ✅ 已满足 |

## 实施步骤

### Phase 1: 更新依赖版本

更新 `package.json` 中的版本声明：

```diff
- "vite": "^6.0.0",
+ "vite": "^7.0.0",
- "@vitejs/plugin-vue": "^5.0.0",
+ "@vitejs/plugin-vue": "^6.0.0",
- "vite-plugin-pwa": "^0.21.0",
+ "vite-plugin-pwa": "^1.0.0",
- "@types/node": "^20.0.0",
+ "@types/node": "^22.0.0",
```

然后执行：
```bash
pnpm install
```

### Phase 2: 验证构建

- [ ] `pnpm type-check` 通过 — `vue-tsc --noEmit`
- [ ] `pnpm build` 成功构建，无警告
- [ ] 检查构建产物大小与更新前对比无异常增大
- [ ] `pnpm dev` 正常启动，HMR 正常工作
- [ ] `pnpm lint` 通过
- [ ] `pnpm test` 通过

### Phase 3: 功能回归

- [ ] 前端页面正常加载
- [ ] API 代理正常工作（`/api`、`/auth` 代理到后端）
- [ ] 聊天功能正常（SSE 流式响应）
- [ ] PWA 离线功能（如启用 `VITE_PWA_ENABLE=true` 验证）
- [ ] 暗色模式正常工作
- [ ] i18n 国际化正常

### Phase 4: 文档更新

- [ ] 更新 `CLAUDE.md` 中 Node >=18 → Node >=20.19
- [ ] 可选的 `vite.config.ts` 添加 `future` 配置预适配 Vite 8

## 依赖变更矩阵

| 依赖 | 升级前 | 升级后 | 说明 |
|------|--------|--------|------|
| vite | ^6.0.0 | ^7.0.0 | 主要升级 |
| @vitejs/plugin-vue | ^5.0.0 | ^6.0.0 | 配套升级，Vite 7 必须 |
| vite-plugin-pwa | ^0.21.0 | ^1.0.0 | 配套升级，Vite 7 兼容 |
| @types/node | ^20.0.0 | ^22.0.0 | 满足 Vite 7 peer dep |

## 风险与回滚

- **风险等级**: 低。Vite 7 的破坏性变更几乎全部不涉及本项目。
- **回滚方式**: 还原 `package.json` 中 4 个依赖版本，执行 `pnpm install` 即可。
- **PWA 插件跨大版本**: `vite-plugin-pwa` 从 0.x → 1.x 可能有 API 变更。当前配置极简（仅 manifest + injectRegister），如有问题查看其 [CHANGELOG](https://github.com/vite-pwa/vite-plugin-pwa/releases)。

## 参考文档

- [Vite 7 Migration Guide](https://v7.vite.dev/guide/migration)
- [Vite 7 Announcement](https://v7.vite.dev/blog/announcing-vite7)
- 上游参考: [Vite 6 升级计划](docs/plans/2026-04-25-001-feat-upgrade-vite-to-v6-plan.md)
