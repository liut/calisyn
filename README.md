# Calisyn

> Disclaimer: This project is only published on GitHub, based on the MIT license, free and for open source learning usage. And there will be no any form of account selling, paid service, discussion group, discussion group and other behaviors. Beware of being deceived.

[中文](README.zh.md)

![cover](./docs/c1.png)
![cover2](./docs/c2.png)

- [Calisyn](#calisyn)
	- [Introduction](#introduction)
	- [Roadmap](#roadmap)
	- [Prerequisites](#prerequisites)
		- [Node](#node)
		- [PNPM](#pnpm)
		- [Filling in the Key](#filling-in-the-key)
	- [Install Dependencies](#install-dependencies)
		- [Backend](#backend)
		- [Frontend](#frontend)
	- [Run in Test Environment](#run-in-test-environment)
		- [Backend Service](#backend-service)
		- [Frontend Webpage](#frontend-webpage)
	- [Environment Variables](#environment-variables)
	- [Packaging](#packaging)
		- [Use Docker](#use-docker)
			- [Docker Parameter Examples](#docker-parameter-examples)
			- [Docker build \& Run](#docker-build--run)
			- [Docker compose](#docker-compose)
			- [Prevent Crawlers](#prevent-crawlers)
		- [Deploy with Railway](#deploy-with-railway)
			- [Railway Environment Variables](#railway-environment-variables)
		- [Deploy with Sealos](#deploy-with-sealos)
		- [Package Manually](#package-manually)
			- [Backend Service](#backend-service-1)
			- [Frontend Webpage](#frontend-webpage-1)
	- [FAQ](#faq)
	- [Contributing](#contributing)
	- [Acknowledgements](#acknowledgements)
	- [Sponsors](#sponsors)
	- [License](#license)
## Introduction

Multi-provider AI chat application with SSE streaming and tool calling support.

| Provider | Description |
| -------- | ----------- |
| `openai` | OpenAI Official API (default) |
| `anthropic` | Anthropic Claude API |
| `openrouter` | OpenRouter Aggregated API |
| `ollama` | Local Ollama Models |

**Features:**
- Multi-provider support, switch via `LLM_PROVIDER` env var
- SSE streaming responses with `stream` parameter
- Tool Calling with built-in `web_fetch` tool
- Configurable API prefix (`API_PREFIX`)

**Warnings:**
1. When publishing the project to public network, you should set the `AUTH_SECRET_KEY` variable to add your password access, you should also modify the `title` in `index.html` to prevent it from being searched by keywords.

**Quick Switch Provider:**
1. Enter the `service/.env.example` file, copy the contents to `service/.env`
2. Set `LLM_PROVIDER` to `openai`, `anthropic`, `openrouter`, or `ollama`
3. Fill in corresponding `LLM_API_KEY` and `LLM_MODEL`

Environment variables:

See all parameter variables [here](#environment-variables)

## Roadmap
[✓] Multi-provider support (OpenAI, Anthropic, OpenRouter, Ollama)

[✓] SSE streaming responses

[✓] Tool Calling + web_fetch

[✓] Multi-session storage and context logic

[✓] Formatting and beautification of code and other message types

[✓] Access control

[✓] Data import/export

[✓] Save messages as local images

[✓] Multilingual interface

[✓] Interface themes

[✗] More...

## Prerequisites

### Node

`node` requires version `>=18`, use [nvm](https://github.com/nvm-sh/nvm) to manage multiple local `node` versions

```shell
node -v
```

### PNPM
If you haven't installed `pnpm`
```shell
npm install pnpm -g
```

### Filling in the Key
Set LLM Provider and fill in the corresponding API Key [Go to Introduction](#introduction)

```
# service/.env file

# LLM Provider: openai, anthropic, openrouter, ollama (default: openai)
LLM_PROVIDER=openai

# API Key (required)
LLM_API_KEY=sk-xxx

# Model (optional, has default)
LLM_MODEL=gpt-4o

# API URL (optional, has default)
LLM_BASE_URL=https://api.openai.com/v1
```

## Install Dependencies

> For the convenience of "backend developers" to understand the burden, the front-end "workspace" mode is not adopted, but separate folders are used to store them. If you only need to do secondary development of the front-end page, delete the `service` folder.

### Backend

Enter the folder `/service` and run the following commands

```shell
pnpm install
```

### Frontend
Run the following commands at the root directory
```shell
pnpm bootstrap
```

## Run in Test Environment
### Backend Service

Enter the folder `/service` and run the following commands

```shell
pnpm start
```

### Frontend Webpage
Run the following commands at the root directory
```shell
pnpm dev
```

## Environment Variables

**LLM Provider Config:**

- `LLM_PROVIDER` Provider type: `openai`, `anthropic`, `openrouter`, `ollama`, default: `openai`
- `LLM_API_KEY` API key
- `LLM_MODEL` Model name, defaults vary by provider
- `LLM_BASE_URL` API URL, defaults vary by provider
- `LLM_TIMEOUT_MS` Request timeout in ms, default: 90000
- `LLM_TEMPERATURE` Temperature setting, optional

**Common Config:**

- `AUTH_SECRET_KEY` Access permission key
- `API_PREFIX` API path prefix, default: `/api`

## Packaging

### Use Docker

#### Docker Parameter Examples

![docker](./docs/docker.png)

#### Docker build & Run

```bash
docker build -t calisyn .

# Foreground running
docker run --name calisyn --rm -it -p 127.0.0.1:3002:3002 --env OPENAI_API_KEY=your_api_key calisyn

# Background running
docker run --name calisyn -d -p 127.0.0.1:3002:3002 --env OPENAI_API_KEY=your_api_key calisyn

# Run address
http://localhost:3002/
```

#### Docker compose

[Hub address](https://hub.docker.com/repository/docker/liut7/chatgpt-web/general)

```yml
version: '3'

services:
  app:
    image: liut7/calisyn
    ports:
      - 127.0.0.1:3002:3002
    environment:
      # LLM Provider: openai, anthropic, openrouter, ollama
      LLM_PROVIDER: openai
      # API key
      LLM_API_KEY: sk-xxx
      # Model, optional
      LLM_MODEL: gpt-4o
      # API URL, optional
      LLM_BASE_URL: https://api.openai.com/v1
      # Access permission key, optional
      AUTH_SECRET_KEY: xxx
      # API path prefix, optional, default /api
      API_PREFIX: /api
```

#### Prevent Crawlers

**nginx**

Fill in the following configuration in the nginx configuration file to prevent crawlers. You can refer to the `docker-compose/nginx/nginx.conf` file to add anti-crawler methods

```
    # Prevent crawlers
    if ($http_user_agent ~* "360Spider|JikeSpider|Spider|spider|bot|Bot|2345Explorer|curl|wget|webZIP|qihoobot|Baiduspider|Googlebot|Googlebot-Mobile|Googlebot-Image|Mediapartners-Google|Adsbot-Google|Feedfetcher-Google|Yahoo! Slurp|Yahoo! Slurp China|YoudaoBot|Sosospider|Sogou spider|Sogou web spider|MSNBot|ia_archiver|Tomato Bot|NSPlayer|bingbot")
    {
      return 403;
    }
```

### Deploy with Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template/yytmgc)

#### Railway Environment Variables

| Environment variable | Required | Remarks |
| ------------------- | -------- | ------- |
| `PORT`              | Required | Default `3002`               |
| `LLM_PROVIDER`      | Required | `openai`, `anthropic`, `openrouter`, `ollama` |
| `LLM_API_KEY`       | Required | API key                       |
| `LLM_MODEL`         | Optional | Model name                    |
| `LLM_BASE_URL`      | Optional | API URL                       |
| `AUTH_SECRET_KEY`   | Optional | Access permission key         |
| `API_PREFIX`        | Optional | API path prefix, default `/api` |

> Note: Modifying environment variables on `Railway` will re-`Deploy`

### Deploy with Sealos

[![](https://raw.githubusercontent.com/labring-actions/templates/main/Deploy-on-Sealos.svg)](https://cloud.sealos.io/?openapp=system-fastdeploy%3FtemplateName%3Dcalisyn)

> Environment variables are consistent with Docker environment variables

### Package Manually
#### Backend Service
> If you don't need the `node` interface of this project, you can omit the following operations

Copy the `service` folder to the server where you have the `node` service environment.

```shell
# Install
pnpm install

# Pack
pnpm build

# Run
pnpm prod
```

PS: It is also okay to run `pnpm start` directly on the server without packing

#### Frontend Webpage

1. Modify the `VITE_API_PATH` field in the `.env` file at the root directory to your actual path of backend API

2. Run the following commands at the root directory, then copy the files in the `dist` folder to the root directory of your website service

[Reference](https://cn.vitejs.dev/guide/static -deploy.html#building-the-app)

```shell
pnpm build
```

## FAQ
Q: Why does `Git` commit always report errors?

A: Because there is a commit message verification, please follow the [Commit Guide](./CONTRIBUTING.md)

Q: Where to change the request interface if only the front-end page is used?

A: The `VITE_API_PATH` field in the `.env` file at the root directory.

Q: All files explode red when saving?

A: `vscode` please install the recommended plug-ins for the project, or manually install the `Eslint` plug-in.

Q: No typewriter effect on the front end?

A: One possible reason is that after Nginx reverse proxy, buffer is turned on, then Nginx will try to buffer some data from the backend before sending it to the browser. Please try adding `proxy_buffering off; ` after the reverse proxy parameter, then reload Nginx. Other web server configurations are similar.

## Contributing

Please read the [Contributing Guide](./CONTRIBUTING.md) before contributing

Thanks to everyone who has contributed!

<a href="https://github.com/Chanzhaoyu/chatgpt-web/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Chanzhaoyu/chatgpt-web" />
</a>

## Acknowledgements

Thanks to [JetBrains](https://www.jetbrains.com/) SoftWare for providing free Open Source license for this project.

## Sponsors

If you find this project helpful and can afford it, you can give me a little support. Anyway, thanks for your support~

<div style="display: flex; gap: 20px;">
	<div style="text-align: center">
		<img style="max-width: 100%" src="./docs/wechat.png" alt="WeChat" />
		<p>WeChat Pay</p>
	</div>
	<div style="text-align: center">
		<img style="max-width: 100%" src="./docs/alipay.png" alt="Alipay" />
		<p>Alipay</p>
	</div>
</div>

## License
MIT © [ChenZhaoYu]
