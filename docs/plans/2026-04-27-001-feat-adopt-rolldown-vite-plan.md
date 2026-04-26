---
title: feat: Adopt rolldown-vite as Vite bundler replacement
type: feat
status: active
date: 2026-04-27
---

# feat: Adopt rolldown-vite as Vite bundler replacement

## Overview

将前端构建工具从 Vite 7（Rollup + esbuild 双引擎）迁移到 `rolldown-vite`（Rolldown 统一 Rust 引擎），以获得更快的构建性能和统一的开发/生产体验。

当前项目使用 Vite 7.3.2（底层 Rollup 4.43.0 + esbuild），`rolldown-vite@7.3.1` 提供了实验性的 Rolldown（Rust）引擎作为 drop-in 替换。

## Problem Statement / Motivation

当前 Vite 架构使用**双引擎**：
- **开发阶段**：esbuild（Go）做预构建
- **生产构建**：Rollup（JavaScript）做打包

这带来以下问题：

1. **开发/生产不一致**：两套引擎行为不同，可能出现开发正常、生产构建出错的情况
2. **性能瓶颈**：Rollup 基于 JavaScript，大型项目构建速度受限
3. **维护负担**：Vite 内部大量 glue code 对齐两套工具的行为

`rolldown-vite` 用统一的 Rolldown（Rust）引擎替换上述所有组件，预期带来：
- **10-30x Rollup 的构建性能**
- **统一的开发/生产行为**
- **更好的 HMR 和代码分割能力**

## Proposed Solution

通过 pnpm 的包别名（package alias）机制，将 `vite` 替换为 `rolldown-vite`：

```json
// package.json
{
  "devDependencies": {
    "vite": "npm:rolldown-vite@7.3.1"
  }
}
```

**无需修改 `vite.config.ts`**，因为当前配置极简，不涉及已知不兼容选项。

## Technical Considerations

### 当前配置兼容性分析

| Vite 配置项 | 当前值 | rolldown-vite 兼容性 |
|---|---|---|
| `plugins` | `@vitejs/plugin-vue` + 可选 `vite-plugin-pwa` | 需验证 |
| `resolve.alias` | `@` → `src/` | 兼容（已启用 Rust native resolve） |
| `server.proxy` | `/api`, `/auth` | 兼容 |
| `server.port` | 1002 | 兼容 |
| `build.reportCompressedSize` | false | 兼容 |
| `build.sourcemap` | false | 兼容 |
| `build.rollupOptions` | 未使用 | 无冲突 |
| `css.preprocessorOptions` | less | 兼容 |

### 关键内部变更

| 组件 | Vite 7 (Rollup) | rolldown-vite | 影响 |
|---|---|---|---|
| 生产构建 | Rollup 4.x | Rolldown (Rust) | 构建速度大幅提升 |
| 预构建/优化 | esbuild | Rolldown (Rust) | 统一引擎 |
| JS 压缩 | esbuild | Oxc (Rust) | 更快压缩 |
| CSS 压缩 | esbuild | Lightning CSS (Rust) | 更快压缩 |
| 语法降级 | esbuild | Oxc (Rust) | 目标浏览器未变 |

### 已知限制

1. **`manualChunks` → `advancedChunks`**：如果后续需要自定义代码分割，API 有变化（当前未使用）
2. **选项校验警告**：不支持的 Rollup 选项会输出 warning（如 `generatedCode`），当前配置不涉及
3. **`esbuild` 变为可选 peer dependency**：如果插件使用 `transformWithEsbuild`，需单独安装 esbuild
4. **实验性质**：`rolldown-vite` 是实验性包，patch 版本可能引入 breaking changes

### 风险等级

**Low-Medium** — 配置极简、无已知不兼容选项，但 `rolldown-vite` 是实验性包。

## System-Wide Impact

- **构建流程**：`pnpm build`、`pnpm dev` 行为不变，底层引擎变更
- **Docker 构建**：`Dockerfile` 多阶段构建无需修改（`pnpm build` → `dist/` 不变）
- **测试**：Vitest 4.x 有自己的 Vite 依赖，不受影响
- **类型检查**：`vue-tsc` 不受影响
- **Lint**：ESLint 不受影响
- **PWA**：`vite-plugin-pwa` 需验证兼容性

## Acceptance Criteria

- [ ] `package.json` 中 vite 别名指向 `rolldown-vite@7.3.1`
- [ ] `pnpm install` 成功，无依赖冲突
- [ ] `pnpm dev` 启动无警告/错误，前端可正常访问
- [ ] `pnpm build` 构建成功，产物大小与之前相当或更小
- [ ] `pnpm test` 全部通过（Vitest 不受影响）
- [ ] `vite-plugin-pwa`（如启用）热更新和构建正常
- [ ] `pnpm start`（生产预览模式）功能正常
- [ ] Docker build 成功（`docker build -t calisyn .`）

## Success Metrics

- 构建时间减少（与 Vite 7 + Rollup 对比）
- 无功能回退（所有现有功能正常）
- 无新增 warning（除 rolldown-vite 已知限制外）

## Dependencies & Risks

| 依赖/风险 | 描述 | 缓解措施 |
|---|---|---|
| `@vitejs/plugin-vue` 兼容性 | Vue SFC 编译插件需支持 Rolldown | ecosystem-ci 已验证 Rollup 插件兼容 |
| `vite-plugin-pwa` 兼容性 | PWA 插件依赖 Rollup 特定 API | 测试 PWA 构建 |
| 实验性包风险 | patch 版本可能有 breaking changes | **固定版本号**，不适用 `^` |
| 后续升级路径 | rolldown-vite 未来会合并回 Vite 主仓库 | 需要时可切回标准 Vite |

## Rollback Plan

回滚仅需两步：

1. `package.json` 恢复 `"vite": "^7.0.0"`
2. `pnpm install`

回滚后 `pnpm dev`/`pnpm build` 应立即可用。

## Sources & References

### External
- [Vite 7 Rolldown Guide](https://v7.vite.dev/guide/rolldown) — 官方迁移指南
- [rolldown-vite GitHub](https://github.com/vitejs/rolldown-vite) — 源码、issue 跟踪
- [Rolldown benchmarks](https://github.com/rolldown/benchmarks) — 性能对比

### Internal
- [Vite 4→6 升级计划](2026-04-25-001-feat-upgrade-vite-to-v6-plan.md) — 先前升级经验
- [Vite 6→7 升级计划](2026-04-26-002-feat-upgrade-vite-to-v7-plan.md) — 最近升级经验
- `vite.config.ts` — 当前 Vite 配置
- `package.json` — 当前依赖版本
