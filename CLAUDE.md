# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Calisyn is an AI chat application with Vue 3 frontend and Express backend.

- **Frontend**: Vue 3 + Vite + Naive UI + Pinia + Vue Router + Vue I18n + Tailwind CSS
- **Backend**: Express + Multi-Provider LLM (OpenAI, Anthropic, OpenRouter, Ollama)
- **Node Version**: >=18

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
  - `POST /api/chat` - Chat with optional streaming (`stream` param)
  - `POST /api/chat-sse` - Chat with Server-Sent Events (streaming)
  - `GET /api/config` - Get LLM config (provider, model, timeout)
  - `GET /api/session` - Get session info
  - `POST /api/verify` - Verify auth token
- **LLM Providers** (`service/src/llm/`):
  - `openai.ts` - OpenAI-compatible (OpenAI, OpenRouter, Ollama)
  - `anthropic.ts` - Anthropic Claude API
  - `tools.ts` - Tool registry with `web_fetch` tool (SSRF protected)
  - `index.ts` - Client factory with provider dispatch
- **Authentication**: `service/src/middleware/auth.ts` - AUTH_SECRET_KEY based
- **Rate Limiting**: `service/src/middleware/limiter.ts`

### Key Environment Variables

**Backend** (`service/.env`):
- `LLM_PROVIDER` - Provider type: `openai`, `anthropic`, `openrouter`, `ollama` (default: `openai`)
- `LLM_API_KEY` - API key (required for OpenAI/Anthropic/OpenRouter)
- `LLM_BASE_URL` - API base URL (optional, has defaults per provider)
- `LLM_MODEL` - Model name (optional, has defaults per provider)
- `LLM_TIMEOUT_MS` - Request timeout in ms (default: 90000)
- `LLM_TEMPERATURE` - Temperature setting (optional)
- `AUTH_SECRET_KEY` - Access password
- `API_PREFIX` - API path prefix (default: `/api`)

**Frontend** (`.env`):
- `VITE_API_PROXY_TO` - Backend proxy target (default: http://127.0.0.1:3002)
- `VITE_BASE_PATH` - Base path for deployment

## Key Files

- `vite.config.ts` - Vite config with proxy setup for `/api` and `/auth`
- `service/src/llm/index.ts` - LLM client factory with multi-provider support
- `service/src/llm/openai.ts` - OpenAI-compatible provider
- `service/src/llm/anthropic.ts` - Anthropic Claude provider
- `service/src/llm/tools.ts` - Tool registry with `web_fetch` (SSRF protected)
- `src/utils/request/axios.ts` - Axios instance with interceptors
- `src/store/modules/chat/index.ts` - Chat state management
