---
title: 升级 Vite 4.2.0 至 Vite 6.x
type: feat
status: completed
date: 2026-04-25
---

# 升级 Vite 4.2.0 至 Vite 6.x

## Overview

将项目 Vite 依赖从 v4.2.0 升级至 v6.x，途经 v5.x。需同步升级相关插件并处理破坏性变更。

## 当前状态

| 依赖 | 当前版本 |
|------|----------|
| vite | ^4.2.0 |
| @vitejs/plugin-vue | ^4.0.0 |
| vite-plugin-pwa | ^0.14.4 |
| typescript | ~4.9.5 |
| vue | ^3.2.47 |

## 迁移路径

```
Vite 4.2.0 → Vite 5.x → Vite 6.x
```

## Vite 4 → 5 破坏性变更

### Node.js 版本要求
- **要求**: Node.js 18+ (当前项目 Node >=18 已满足)

### Rollup 4
- `import assertions` 改名为 `import attributes`
- `moduleResolution: 'bundler'` (或 `node16`/`nodenext`) 是 Rollup 4 的要求

### CJS Node API 废弃
- `vite.config.js` 需使用 ESM 语法
- 确认 `package.json` 有 `"type": "module"` 或使用 `.mjs`/`.mts` 扩展名

### define 处理变更
- Vite 5 使用 esbuild 处理 build 时的替换，与 dev 行为一致
- 确保 `define` 配置的值符合 esbuild 语法（JSON 对象或单一标识符）

### worker.plugins 变更为函数
```ts
// Before (Vite 4)
worker.plugins: [...]

// After (Vite 5)
worker.plugins: () => [...]
```

### 路径含 `.` 时的 fallback 行为
- 含 `.` 的路径现在会 fallback 到 index.html

## Vite 5 → 6 破坏性变更

### resolve.conditions 默认值变更
```ts
// Vite 5 默认值: []
// Vite 6 默认值: ['module', 'browser', 'development|production']

// Vite 6 导出了 defaultClientConditions 和 defaultServerConditions
```

### JSON stringify 行为
- Vite 6 新增 `'auto'` 默认值，只对大 JSON 文件做 stringify
- `json.stringify: true` 时 `json.namedExports` 不再被禁用

### postcss-load-config v6
- 需要 `tsx` 或 `jiti` 来加载 TypeScript postcss 配置
- 需要 `yaml` 来加载 YAML postcss 配置

### Sass 现代 API
- Vite 6 默认使用 Sass 现代 API
- 遗留 API 将于 Vite 7 移除

### CSS 输出文件名 (库模式)
- 不再固定为 `style.css`，现在使用 `build.lib.fileName` 类似命名

## 实施步骤

### Phase 1: 升级至 Vite 5.x

- [ ] 升级 `vite` 至 `^5.4.0`
- [ ] 升级 `@vitejs/plugin-vue` 至 `^5.0.0`
- [ ] 升级 `vite-plugin-pwa` 至 `^0.20.0` (兼容 Vite 5)
- [ ] 更新 `tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "moduleResolution": "bundler"
    }
  }
  ```
- [ ] 检查并更新 `vite.config.ts`:
  - `worker.plugins` 改为函数形式

### Phase 2: 升级至 Vite 6.x

- [ ] 升级 `vite` 至 `^6.0.0`
- [ ] 升级 `@vitejs/plugin-vue` 至 `^5.2.0`
- [ ] 升级 `vite-plugin-pwa` 至 `^0.21.0`
- [ ] 添加 `postcss-load-config` 需要的依赖:
  ```bash
  pnpm add -D tsx yaml
  ```
- [ ] 更新 `vite.config.ts` 中的 `resolve.conditions`:
  ```ts
  import { defaultClientConditions } from 'vite'

  resolve: {
    conditions: [...defaultClientConditions],
  }
  ```
- [ ] 检查 Sass 配置是否需要 `css.preprocessorOptions.sass.api`

### Phase 3: 验证

- [ ] `pnpm dev` 正常启动
- [ ] `pnpm build` 正常构建
- [ ] `pnpm type-check` 通过
- [ ] `pnpm lint` 通过
- [ ] `pnpm test` 通过

## 依赖版本矩阵

| 依赖 | Vite 5 兼容版本 | Vite 6 兼容版本 |
|------|----------------|----------------|
| vite | ^5.4.0 | ^6.0.0 |
| @vitejs/plugin-vue | ^5.0.0 | ^5.2.0 |
| vite-plugin-pwa | ^0.20.0 | ^0.21.0 |
| typescript | ~5.0.0 | ~5.6.0 |

## 风险与注意事项

1. **tsconfig.json moduleResolution**: 当前为 `"node"`，需改为 `"bundler"` 以兼容 Rollup 4
2. **Sass API**: 如果项目使用 Sass，可能需要调整配置
3. **PWA 插件**: 版本跨度大，建议查看 CHANGELOG 确认无重大变更

## 参考文档

- [Vite 5 Migration Guide](https://v5.vite.dev/guide/migration.html)
- [Vite 6 Migration Guide](https://v6.vite.dev/guide/migration.html)
- [postcss-load-config v6 Breaking Changes](https://github.com/postcss/postcss-load-config/releases)
