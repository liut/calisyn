# Calisyn Service

Backend API service with multi-provider LLM support.

## LLM Providers

| Provider | Description | Default Model | Default Base URL |
| -------- | ----------- | ------------ | ---------------- |
| `openai` | OpenAI Official API | `gpt-4.1` | `https://api.openai.com/v1` |
| `anthropic` | Anthropic Claude API | `claude-sonnet-4.5` | `https://api.anthropic.com/v1` |
| `openrouter` | OpenRouter Aggregated API | `openai/gpt-4.1` | `https://openrouter.ai/api/v1` |
| `ollama` | Local Ollama Models | `llama3` | `http://localhost:11434/v1` |

## Environment Variables

### LLM Provider Config

| Variable | Required | Default | Description |
| -------- | -------- | ------- | ----------- |
| `LLM_PROVIDER` | No | `openai` | Provider type |
| `LLM_API_KEY` | Yes | - | API key |
| `LLM_MODEL` | No | varies | Model name |
| `LLM_BASE_URL` | No | varies | API URL |
| `LLM_TIMEOUT_MS` | No | `90000` | Request timeout (ms) |
| `LLM_TEMPERATURE` | No | - | Temperature |

### Common Config

| Variable | Required | Default | Description |
| -------- | -------- | ------- | ----------- |
| `AUTH_SECRET_KEY` | No | - | Access permission key |
| `API_PREFIX` | No | `/api` | API path prefix |

## Quick Start

```bash
cd service

# Install dependencies
pnpm install

# Copy environment config
cp .env.example .env

# Edit .env with your API Key
vim .env

# Development mode
pnpm dev

# Production build
pnpm build
pnpm prod
```

## Deployment

### Docker

```bash
docker build -t calisyn .

docker run --name calisyn -d -p 127.0.0.1:3002:3002 \
  --env LLM_PROVIDER=openai \
  --env LLM_API_KEY=sk-xxx \
  calisyn
```

### Docker Compose

```yml
version: '3'

services:
  app:
    image: liut7/calisyn
    ports:
      - 127.0.0.1:3002:3002
    environment:
      LLM_PROVIDER: openai
      LLM_API_KEY: sk-xxx
      LLM_MODEL: gpt-4o
      LLM_BASE_URL: https://api.openai.com/v1
      AUTH_SECRET_KEY: xxx
      API_PREFIX: /api
```

### Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template/yytmgc)

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `PORT` | Yes | Default `3002` |
| `LLM_PROVIDER` | Yes | Provider type |
| `LLM_API_KEY` | Yes | API key |
| `LLM_MODEL` | No | Model name |
| `LLM_BASE_URL` | No | API URL |
| `AUTH_SECRET_KEY` | No | Access key |
| `API_PREFIX` | No | Path prefix |

### Sealos

[![Deploy on Sealos](https://raw.githubusercontent.com/labring-actions/templates/main/Deploy-on-Sealos.svg)](https://cloud.sealos.io/?openapp=system-fastdeploy%3FtemplateName%3Dcalisyn)

## API Endpoints

| Endpoint | Method | Description |
| -------- | ------ | ----------- |
| `/api/chat` | POST | Chat (supports `stream` param) |
| `/api/chat-sse` | POST | SSE streaming chat |
| `/api/config` | GET | Get LLM config |
| `/api/session` | GET | Get session info |
| `/api/verify` | POST | Verify access key |

## Tool Calling

Built-in `web_fetch` tool for web content fetching (with SSRF protection).

## Anti-Crawler

Nginx config reference:

```
if ($http_user_agent ~* "360Spider|JikeSpider|Spider|spider|bot|Bot|...")
{
  return 403;
}
```
