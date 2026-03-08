# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChatGPT Web is a dual-model ChatGPT web application with Vue 3 frontend and Express backend.

- **Frontend**: Vue 3 + Vite + Naive UI + Pinia + Vue Router + Vue I18n + Tailwind CSS
- **Backend**: Express + ChatGPT SDK (supports both official API and unofficial Web API)
- **Node Version**: ^16 || ^18 || ^20

## Common Commands

```bash
# Install dependencies
pnpm bootstrap

# Development
pnpm dev                    # Frontend (port 1002)
cd service && pnpm dev      # Backend (port 3002)

# Build
pnpm build                  # Frontend only
cd service && pnpm build    # Backend only

# Lint
pnpm lint                   # Frontend lint
pnpm lint:fix               # Frontend lint with auto-fix
cd service && pnpm lint     # Backend lint
```

## Architecture

### Frontend (`/src`)

- **Entry**: `src/main.ts` - bootstraps Vue app with plugins
- **State Management**: Pinia stores in `src/store/modules/`
  - `app/` - app-wide state (theme, language)
  - `chat/` - chat messages and conversations
  - `settings/` - user settings
  - `auth/` - authentication state
  - `user/` - user profile
  - `prompt/` - prompt templates
- **API Layer**: `src/api/` - Axios-based API calls, proxied to backend
- **Routing**: `src/router/` with permission guard
- **i18n**: `src/locales/` - supports en-US, zh-CN, zh-TW, ko-KR, ru-RU, vi-VN

### Backend (`/service/src`)

- **Entry**: `service/src/index.ts` - Express server on port 3002
- **API Endpoints**:
  - `POST /chat-sse` - Chat with Server-Sent Events (streaming)
  - `POST /chat-process` - Deprecated chat API
  - `GET /config` - Get ChatGPT config
  - `GET /session` - Get session info
  - `POST /verify` - Verify auth token
- **Authentication**: `service/src/middleware/auth.ts` - AUTH_SECRET_KEY based
- **Rate Limiting**: `service/src/middleware/limiter.ts`

### Key Environment Variables

**Backend** (`service/.env`):
- `OPENAI_API_KEY` - Official API key (takes precedence)
- `OPENAI_ACCESS_TOKEN` - Web API token
- `AUTH_SECRET_KEY` - Access password
- `OPENAI_API_MODEL` - Model (default: gpt-3.5-turbo)
- `API_REVERSE_PROXY` - Reverse proxy for Web API

**Frontend** (`.env`):
- `VITE_API_PROXY_TO` - Backend proxy target (default: http://127.0.0.1:3002)
- `VITE_BASE_PATH` - Base path for deployment

## Key Files

- `vite.config.ts` - Vite config with proxy setup for `/api` and `/auth`
- `service/src/chatgpt/index.ts` - ChatGPT client wrapper
- `src/utils/request/axios.ts` - Axios instance with interceptors
- `src/store/modules/chat/index.ts` - Chat state management
