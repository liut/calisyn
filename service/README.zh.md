# Calisyn Service

后端服务，支持多 Provider 的 AI 聊天 API。

## LLM Provider 支持

| Provider | 说明 | 默认 Model | 默认 Base URL |
| -------- | ---- | ---------- | ------------- |
| `openai` | OpenAI 官方 API | `gpt-4.1` | `https://api.openai.com/v1` |
| `anthropic` | Anthropic Claude API | `claude-sonnet-4.5` | `https://api.anthropic.com/v1` |
| `openrouter` | OpenRouter 聚合 API | `openai/gpt-4.1` | `https://openrouter.ai/api/v1` |
| `ollama` | 本地 Ollama 模型 | `llama3` | `http://localhost:11434/v1` |

## 环境变量

### LLM Provider 配置

| 变量 | 必填 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `LLM_PROVIDER` | 否 | `openai` | Provider 类型 |
| `LLM_API_KEY` | 是 | - | API 密钥 |
| `LLM_MODEL` | 否 | 因 Provider 而异 | 模型名称 |
| `LLM_BASE_URL` | 否 | 因 Provider 而异 | API 地址 |
| `LLM_TIMEOUT_MS` | 否 | `90000` | 请求超时 (毫秒) |
| `LLM_TEMPERATURE` | 否 | - | 温度参数 |

### 通用配置

| 变量 | 必填 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `AUTH_SECRET_KEY` | 否 | - | 访问权限密钥 |
| `API_PREFIX` | 否 | `/api` | API 路径前缀 |

## 快速开始

```bash
cd service

# 安装依赖
pnpm install

# 复制环境变量配置
cp .env.example .env

# 编辑 .env 填入你的 API Key
vim .env

# 开发模式
pnpm dev

# 生产构建
pnpm build
pnpm prod
```

## 部署

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

| 环境变量 | 必填 | 说明 |
| -------- | ---- | ---- |
| `PORT` | 是 | 默认 `3002` |
| `LLM_PROVIDER` | 是 | Provider 类型 |
| `LLM_API_KEY` | 是 | API 密钥 |
| `LLM_MODEL` | 否 | 模型名称 |
| `LLM_BASE_URL` | 否 | API 地址 |
| `AUTH_SECRET_KEY` | 否 | 访问密钥 |
| `API_PREFIX` | 否 | 路径前缀 |

### Sealos

[![Deploy on Sealos](https://raw.githubusercontent.com/labring-actions/templates/main/Deploy-on-Sealos.svg)](https://cloud.sealos.io/?openapp=system-fastdeploy%3FtemplateName%3Dcalisyn)

## API 端点

| 端点 | 方法 | 说明 |
| ---- | ---- | ---- |
| `/api/chat` | POST | 聊天（支持 `stream` 参数） |
| `/api/chat-sse` | POST | SSE 流式聊天 |
| `/api/config` | GET | 获取 LLM 配置 |
| `/api/session` | GET | 获取会话信息 |
| `/api/verify` | POST | 验证访问密钥 |

## 工具调用

内置 `web_fetch` 工具，支持网页内容抓取（带 SSRF 保护）。

## 防止爬虫

Nginx 配置参考：

```
if ($http_user_agent ~* "360Spider|JikeSpider|Spider|spider|bot|Bot|...")
{
  return 403;
}
```
