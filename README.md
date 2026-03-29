# Calisyn

> Disclaimer: This project is only published on GitHub, based on the MIT license, free and for open source learning usage. And there will be no any form of account selling, paid service, discussion group, discussion group and other behaviors. Beware of being deceived.

[中文](README.zh.md)

![cover](./docs/c1.png)
![cover2](./docs/c2.png)

## Introduction

AI chat application with multi-provider LLM support, SSE streaming, and tool calling.

| Provider | Description |
| -------- | ----------- |
| `openai` | OpenAI Official API (default) |
| `anthropic` | Anthropic Claude API |
| `openrouter` | OpenRouter Aggregated API |
| `ollama` | Local Ollama Models |

**Features:**
- Multi-provider LLM support
- SSE streaming responses
- Tool Calling with built-in `web_fetch` tool
- Multi-session and context logic
- Multilingual interface and themes

## Roadmap

[✓] Server: Multi-provider support (OpenAI, Anthropic, OpenRouter, Ollama)

[✓] Server: SSE streaming responses

[✓] Server: Tool Calling + web_fetch

[✓] Multi-session storage and context logic

[✓] Formatting and beautification of code and other message types

[✓] Access control

[✓] Data import/export

[✓] Save messages as local images

[✓] Multilingual interface

[✓] Interface themes

[✗] More...

## Prerequisites

- **Node**: `>=18`
- **PNPM**: `npm install pnpm -g`

## Install & Run

```bash
# Install all dependencies
pnpm bootstrap

# Frontend only (port 1002)
pnpm dev

# Backend only (port 3002)
cd service && pnpm dev
```

For backend setup (LLM providers, deployment, env vars), see:
- [English](service/README.md)
- [中文](service/README.zh.md)

## Frontend Environment Variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `VITE_API_PATH` | `/api` | API request path |
| `VITE_API_PROXY_TO` | `http://127.0.0.1:3002` | Dev proxy target |

## Build

```bash
# Frontend
pnpm build

# Backend
cd service && pnpm build
```

## FAQ

Q: Why does `Git` commit always report errors?

A: Because there is a commit message verification, please follow the [Commit Guide](./CONTRIBUTING.md)

Q: Where to change the request interface if only the front-end page is used?

A: The `VITE_API_PATH` field in the `.env` file at the root directory.

Q: All files explode red when saving?

A: `vscode` please install the recommended plug-ins for the project, or manually install the `Eslint` plug-in.

Q: No typewriter effect on frontend?

A: One possible cause is Nginx reverse proxy with buffer enabled. Try adding `proxy_buffering off;` to your reverse proxy config.

## Contributing

Please read the [Contributing Guide](./CONTRIBUTING.md) before contributing.

Thanks to everyone who has contributed!

<a href="https://github.com/Chanzhaoyu/chatgpt-web/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Chanzhaoyu/chatgpt-web" />
</a>

## Acknowledgements

Thanks to All SoftWare for providing free Open Source license for this project.

## License

MIT ©
