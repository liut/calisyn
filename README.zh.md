# Calisyn

> 声明：此项目只发布于 GitHub，基于 MIT 协议，免费且作为开源学习使用。并且不会有任何形式的卖号、付费服务、讨论群、讨论组等行为。谨防受骗。

[English](README.md)

![cover](./docs/c1.png)
![cover2](./docs/c2.png)

- [Calisyn](#calisyn)
	- [介绍](#介绍)
	- [待实现路线](#待实现路线)
	- [前置要求](#前置要求)
		- [Node](#node)
		- [PNPM](#pnpm)
		- [填写密钥](#填写密钥)
	- [安装依赖](#安装依赖)
		- [后端](#后端)
		- [前端](#前端)
	- [测试环境运行](#测试环境运行)
		- [后端服务](#后端服务)
		- [前端网页](#前端网页)
	- [环境变量](#环境变量)
	- [打包](#打包)
		- [使用 Docker](#使用-docker)
			- [Docker 参数示例](#docker-参数示例)
			- [Docker build \& Run](#docker-build--run)
			- [Docker compose](#docker-compose)
			- [防止爬虫抓取](#防止爬虫抓取)
		- [使用 Railway 部署](#使用-railway-部署)
			- [Railway 环境变量](#railway-环境变量)
		- [使用 Sealos 部署](#使用-sealos-部署)
		- [手动打包](#手动打包)
			- [后端服务](#后端服务-1)
			- [前端网页](#前端网页-1)
	- [常见问题](#常见问题)
	- [参与贡献](#参与贡献)
	- [致谢](#致谢)
	- [赞助](#赞助)
	- [License](#license)
## 介绍

支持多 Provider 的 AI 聊天应用，支持流式 SSE 响应和工具调用。

| Provider | 说明 |
| -------- | ---- |
| `openai` | OpenAI 官方 API (默认) |
| `anthropic` | Anthropic Claude API |
| `openrouter` | OpenRouter 聚合 API |
| `ollama` | 本地 Ollama 模型 |

**功能特点：**
- 多 Provider 支持，通过 `LLM_PROVIDER` 环境变量切换
- SSE 流式响应，支持 `stream` 参数
- 工具调用 (Tool Calling)，内置 `web_fetch` 工具
- API 路径可配置 (`API_PREFIX`)

**警告：**
1. 把项目发布到公共网络时，你应该设置 `AUTH_SECRET_KEY` 变量添加你的密码访问权限，你也应该修改 `index.html` 中的 `title`，防止被关键词搜索到。

**快速切换 Provider：**
1. 进入 `service/.env.example` 文件，复制内容到 `service/.env` 文件
2. 设置 `LLM_PROVIDER` 为 `openai`、`anthropic`、`openrouter` 或 `ollama`
3. 填写对应的 `LLM_API_KEY` 和 `LLM_MODEL`

环境变量：

全部参数变量请查看或[这里](#环境变量)

```
/service/.env.example
```

## 待实现路线
[✓] 多 Provider 支持 (OpenAI, Anthropic, OpenRouter, Ollama)

[✓] SSE 流式响应

[✓] 工具调用 (Tool Calling) + web_fetch

[✓] 多会话储存和上下文逻辑

[✓] 对代码等消息类型的格式化美化处理

[✓] 访问权限控制

[✓] 数据导入、导出

[✓] 保存消息到本地图片

[✓] 界面多语言

[✓] 界面主题

[✗] More...

## 前置要求

### Node

`node` 需要 `>=18` 版本，使用 [nvm](https://github.com/nvm-sh/nvm) 可管理本地多个 `node` 版本

```shell
node -v
```

### PNPM
如果你没有安装过 `pnpm`
```shell
npm install pnpm -g
```

### 填写密钥
设置 LLM Provider 并填写对应的 API Key [跳转](#介绍)

```
# service/.env 文件

# LLM Provider: openai, anthropic, openrouter, ollama (默认: openai)
LLM_PROVIDER=openai

# API Key (必填)
LLM_API_KEY=sk-xxx

# 模型 (可选，有默认值)
LLM_MODEL=gpt-4o

# API 地址 (可选，有默认值)
LLM_BASE_URL=https://api.openai.com/v1
```

## 安装依赖

> 为了简便 `后端开发人员` 的了解负担，所以并没有采用前端 `workspace` 模式，而是分文件夹存放。如果只需要前端页面做二次开发，删除 `service` 文件夹即可。

### 后端

进入文件夹 `/service` 运行以下命令

```shell
pnpm install
```

### 前端
根目录下运行以下命令
```shell
pnpm bootstrap
```

## 测试环境运行
### 后端服务

进入文件夹 `/service` 运行以下命令

```shell
pnpm start
```

### 前端网页
根目录下运行以下命令
```shell
pnpm dev
```

## 环境变量

**LLM Provider 配置：**

- `LLM_PROVIDER` Provider 类型：`openai`、`anthropic`、`openrouter`、`ollama`，默认：`openai`
- `LLM_API_KEY` API 密钥
- `LLM_MODEL` 模型名称，默认值因 Provider 而异
- `LLM_BASE_URL` API 地址，默认值因 Provider 而异
- `LLM_TIMEOUT_MS` 请求超时，单位毫秒，默认：90000
- `LLM_TEMPERATURE` 温度参数，可选

**通用配置：**

- `AUTH_SECRET_KEY` 访问权限密钥
- `API_PREFIX` API 路径前缀，默认：`/api`

## 打包

### 使用 Docker

#### Docker 参数示例

![docker](./docs/docker.png)

#### Docker build & Run

```bash
docker build -t calisyn .

# 前台运行
docker run --name calisyn --rm -it -p 127.0.0.1:3002:3002 --env OPENAI_API_KEY=your_api_key calisyn

# 后台运行
docker run --name calisyn -d -p 127.0.0.1:3002:3002 --env OPENAI_API_KEY=your_api_key calisyn

# 运行地址
http://localhost:3002/
```

#### Docker compose

[Hub 地址](https://hub.docker.com/repository/docker/liut7/chatgpt-web/general)

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
      # API 密钥
      LLM_API_KEY: sk-xxx
      # 模型，可选
      LLM_MODEL: gpt-4o
      # API 地址，可选
      LLM_BASE_URL: https://api.openai.com/v1
      # 访问权限密钥，可选
      AUTH_SECRET_KEY: xxx
      # API 路径前缀，可选，默认 /api
      API_PREFIX: /api
```

#### 防止爬虫抓取

**nginx**

将下面配置填入nginx配置文件中，可以参考 `docker-compose/nginx/nginx.conf` 文件中添加反爬虫的方法

```
    # 防止爬虫抓取
    if ($http_user_agent ~* "360Spider|JikeSpider|Spider|spider|bot|Bot|2345Explorer|curl|wget|webZIP|qihoobot|Baiduspider|Googlebot|Googlebot-Mobile|Googlebot-Image|Mediapartners-Google|Adsbot-Google|Feedfetcher-Google|Yahoo! Slurp|Yahoo! Slurp China|YoudaoBot|Sosospider|Sogou spider|Sogou web spider|MSNBot|ia_archiver|Tomato Bot|NSPlayer|bingbot")
    {
      return 403;
    }
```

###  使用 Railway 部署

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template/yytmgc)

#### Railway 环境变量

| 环境变量名称     | 必填 | 备注                      |
| ---------------- | ---- | ------------------------- |
| `PORT`           | 必填 | 默认 `3002`               |
| `LLM_PROVIDER`   | 必填 | `openai`, `anthropic`, `openrouter`, `ollama` |
| `LLM_API_KEY`    | 必填 | API 密钥                  |
| `LLM_MODEL`      | 可选 | 模型名称                  |
| `LLM_BASE_URL`   | 可选 | API 地址                  |
| `AUTH_SECRET_KEY`| 可选 | 访问权限密钥              |
| `API_PREFIX`     | 可选 | API 路径前缀，默认 `/api` |

> 注意: `Railway` 修改环境变量会重新 `Deploy`

### 使用 Sealos 部署

[![](https://raw.githubusercontent.com/labring-actions/templates/main/Deploy-on-Sealos.svg)](https://cloud.sealos.io/?openapp=system-fastdeploy%3FtemplateName%3Dcalisyn)

> 环境变量与 Docker 环境变量一致

### 手动打包
#### 后端服务
> 如果你不需要本项目的 `node` 接口，可以省略如下操作

复制 `service` 文件夹到你有 `node` 服务环境的服务器上。

```shell
# 安装
pnpm install

# 打包
pnpm build

# 运行
pnpm prod
```

PS: 不进行打包，直接在服务器上运行 `pnpm start` 也可

#### 前端网页

1、修改根目录下 `.env` 文件中的 `VITE_API_PATH` 为你的实际后端接口路径

2、根目录下运行以下命令，然后将 `dist` 文件夹内的文件复制到你网站服务的根目录下

[参考信息](https://cn.vitejs.dev/guide/static-deploy.html#building-the-app)

```shell
pnpm build
```

## 常见问题
Q: 为什么 `Git` 提交总是报错？

A: 因为有提交信息验证，请遵循 [Commit 指南](./CONTRIBUTING.md)

Q: 如果只使用前端页面，在哪里改请求接口？

A: 根目录下 `.env` 文件中的 `VITE_API_PATH` 字段。

Q: 文件保存时全部爆红?

A: `vscode` 请安装项目推荐插件，或手动安装 `Eslint` 插件。

Q: 前端没有打字机效果？

A: 一种可能原因是经过 Nginx 反向代理，开启了 buffer，则 Nginx 会尝试从后端缓冲一定大小的数据再发送给浏览器。请尝试在反代参数后添加 `proxy_buffering off;`，然后重载 Nginx。其他 web server 配置同理。

## 参与贡献

贡献之前请先阅读 [贡献指南](./CONTRIBUTING.md)

感谢所有做过贡献的人!

<a href="https://github.com/Chanzhaoyu/chatgpt-web/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Chanzhaoyu/chatgpt-web" />
</a>

## 致谢

感谢 [JetBrains](https://www.jetbrains.com/) 为这个项目提供免费开源许可的软件。

## 赞助

如果你觉得这个项目对你有帮助，并且情况允许的话，可以给我一点点支持，总之非常感谢支持～

<div style="display: flex; gap: 20px;">
	<div style="text-align: center">
		<img style="max-width: 100%" src="./docs/wechat.png" alt="微信" />
		<p>WeChat Pay</p>
	</div>
	<div style="text-align: center">
		<img style="max-width: 100%" src="./docs/alipay.png" alt="支付宝" />
		<p>Alipay</p>
	</div>
</div>

## License
MIT © [ChenZhaoYu](./license)
