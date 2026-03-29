---
title: feat: Add multi-scenario logo customization
type: feat
status: active
date: 2026-03-30
---

# feat: Add multi-scenario logo customization

## Overview

为前端项目添加多场景 logo 定制能力，使同一个代码库可以针对不同部署场景（dev、testing、production）展示不同的品牌 logo。

## Problem Statement

当前 `logo.png` 是硬编码的静态导入，在构建时打包进 bundle：
```typescript
// src/views/chat/components/Message/Avatar.vue:7
import serviceAvatar from '@/assets/logo.png'
```

项目需要部署到多个场景，每个场景可能需要不同的 logo。要求一个简便的定制方案。

## Proposed Solution

**核心思路**：将 logo 从 `src/assets/logo.png` 迁移到 `public/logo.png`。Vite 对 `public/` 目录的文件会原样复制到构建输出（不做 hash 重命名），部署后直接覆盖服务器上的 logo 文件即可切换品牌。

**关键点**：
- `src/assets/` 下的文件会被 Vite 打包并 hash 重命名（如 `logo-b99f918d.png`）
- `public/` 下的文件会被 Vite 原样复制，路径固定为 `/logo.png`
- 部署后只需覆盖 `dist/logo.png` 或服务器对应路径

**优势**：
- 零代码变更（只需迁移文件位置）
- 零 CI/CD 变更
- 部署后随时可切换 logo，无需重新构建

## Implementation

### 1. 迁移 logo 到 public 目录

**移动 logo 文件：**
```bash
mv src/assets/logo.png public/logo.png
```

### 2. 修改 Avatar.vue 使用 public 路径

**修改 `src/views/chat/components/Message/Avatar.vue`：**

```typescript
const logoValue = import.meta.env.VITE_APP_LOGO || 'logo.png'
// 支持外部 URL（http://, https://, data:）或本地文件
const serviceAvatar = /^(https?|data):/.test(logoValue)
  ? logoValue
  : `${import.meta.env.VITE_BASE_PATH || ''}/${logoValue}`
```

**说明**：
- URL 可能是 `example.com/apps/chat#/chat/`
- 浏览器请求静态资源时不会带 `#` 后面的路径
- 需要 `${VITE_BASE_PATH}/${VITE_APP_LOGO}` → `example.com/apps/chat/logo.png`
- 支持多种格式：`logo.png`、`logo.svg`、`logo.webp` 等
- 支持外部 URL：`https://cdn.example.com/logo.png` 或 `data:image/png;base64,...`
- 本地文件优先使用 public 目录

### 3. 清理旧文件

**删除旧文件：**
```bash
rm src/assets/logo.png  # 删除已迁移的旧文件
```

## Files

- `public/logo.png` - 从 `src/assets/logo.png` 迁移，部署后可覆盖
- `src/views/chat/components/Message/Avatar.vue` - 改用 `${VITE_BASE_PATH}/${VITE_APP_LOGO}` 路径
- `src/assets/logo.png` - 删除（旧位置）
- `.env.example` - 添加 `VITE_APP_LOGO` 环境变量说明

## Alternative Approaches Considered

### 方案 B：多构建模式（已拒绝）
使用 `vite build --mode brand-a` 配合 `.env.brand-a` 文件，每套环境构建一次。

**问题**：同一个项目需要维护多套构建，增加 CI/CD 复杂度，不符合"简便"要求。

## Acceptance Criteria

- [ ] `public/logo.png` 存在且是当前默认 logo
- [ ] Avatar.vue 使用 `${VITE_BASE_PATH || ''}/${VITE_APP_LOGO || 'logo.png'}` 路径
- [ ] `VITE_APP_LOGO` 环境变量支持自定义文件名（如 `logo.svg`、`logo.webp`）
- [ ] 构建后文件不带 hash（验证 public 目录机制生效）
- [ ] 部署后可通过覆盖 logo 文件切换品牌
- [ ] 不影响当前 PWA 图标配置（`pwa-192x192.png` 等）

## Deployment Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. pnpm run build                                          │
│     - Vite 复制 public/logo.png 到 dist/logo.png             │
│     - 路径固定，不带 hash                                    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  2. 部署 dist/ 到服务器                                     │
│     - 部署后覆盖服务器上的 logo 文件即可切换品牌              │
│     - 例: scp custom-logo.png server:/var/www/apps/logo.png  │
└─────────────────────────────────────────────────────────────┘
```

## Logo 切换操作

**切换品牌 logo**（部署后执行）：
```bash
scp ./logos/logo-brand-a.png user@server:/var/www/apps/assistant/logo.png
```

**无需重新构建，无需修改 CI/CD**。
