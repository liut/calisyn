# Calisyn

> 声明：此项目只发布于 GitHub，基于 MIT 协议，免费且作为开源学习使用。并且不会有任何形式的卖号、付费服务、讨论群、讨论组等行为。谨防受骗。

[English](README.md)

![cover](./docs/c1.png)
![cover2](./docs/c2.png)

## 介绍

AI 聊天应用，支持多 Provider LLM、流式 SSE 响应和工具调用。

| Provider | 说明 |
| -------- | ---- |
| `openai` | OpenAI 官方 API (默认) |
| `anthropic` | Anthropic Claude API |
| `openrouter` | OpenRouter 聚合 API |
| `ollama` | 本地 Ollama 模型 |

**功能特点：**
- 多 Provider LLM 支持
- SSE 流式响应
- 工具调用 (Tool Calling)，内置 `web_fetch` 工具
- 多会话和上下文逻辑
- 界面多语言和主题

## 待实现路线

[✓] 后端: 多 Provider 支持 (OpenAI, Anthropic, OpenRouter, Ollama)

[✓] 后端: SSE 流式响应

[✓] 后端: 工具调用 (Tool Calling) + web_fetch

[✓] 多会话储存和上下文逻辑

[✓] 对代码等消息类型的格式化美化处理

[✓] 访问权限控制

[✓] 数据导入、导出

[✓] 保存消息到本地图片

[✓] 界面多语言

[✓] 界面主题

[✗] More...

## 前置要求

- **Node**: `>=18`
- **PNPM**: `npm install pnpm -g`

## 安装与运行

```bash
# 安装所有依赖
pnpm bootstrap

# 仅前端 (端口 1002)
pnpm dev

# 仅后端 (端口 3002)
cd service && pnpm dev
```

后端配置（LLM Provider、部署、环境变量）请参考：
- [English](service/README.md)
- [中文](service/README.zh.md)

## 前端环境变量

| 变量 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `VITE_API_PATH` | `/api` | API 请求路径 |
| `VITE_API_PROXY_TO` | `http://127.0.0.1:3002` | 开发代理目标 |

## 打包

```bash
# 前端
pnpm build

# 后端
cd service && pnpm build
```

## 常见问题

Q: 为什么 `Git` 提交总是报错？

A: 因为有提交信息验证，请遵循 [Commit 指南](./CONTRIBUTING.md)

Q: 如果只使用前端页面，在哪里改请求接口？

A: 根目录下 `.env` 文件中的 `VITE_API_PATH` 字段。

Q: 文件保存时全部爆红?

A: `vscode` 请安装项目推荐插件，或手动安装 `Eslint` 插件。

Q: 前端没有打字机效果？

A: 一种可能是 Nginx 反向代理开启了 buffer。请在反代参数后添加 `proxy_buffering off;`。

## 参与贡献

贡献之前请先阅读 [贡献指南](./CONTRIBUTING.md)

感谢所有做过贡献的人!

<a href="https://github.com/Chanzhaoyu/chatgpt-web/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Chanzhaoyu/chatgpt-web" />
</a>

## 致谢

感谢所有为这个项目提供免费开源许可的软件。

## License

MIT ©
