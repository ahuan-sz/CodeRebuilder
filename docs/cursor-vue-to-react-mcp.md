# 在 Cursor 中配合 vue-to-react-mcp 与本应用

CodeRebuilder 在 **Electron 桌面端** 运行迁移流水线；**MCP（Model Context Protocol）** 运行在 **Cursor 编辑器**里，用于给模型提供项目结构与依赖上下文。两者通过你维护的「规范文档」对齐，而不是直接 socket 通信。

## 推荐工作流

1. **在 Cursor 里配置 MCP**  
   打开 Cursor → Settings → MCP，按 `vue-to-react-mcp`（或你选用的 Vue→React MCP 服务）的说明添加 server。用 Agent/Chat 对该仓库做一轮「依赖与组件边界」分析，得到可复用的结论。

2. **把结论写入本应用能读到的两处之一**（二选一或同时使用）  
   - **应用设置 → 迁移助手 → 项目规范 / MCP 分析摘要**：粘贴 Markdown。  
   - **仓库内文件** `<项目根>/.coderebuilder/context.md`：可提交到 Git，团队共享；本应用会在每次迁移时自动并入 Prompt。

3. **可选：用 CLI 做体力活初稿**  
   在设置里启用 **外部工具初稿**，选择 `v2r-llm` 或 `vue-to-react (vtr)`，或填写 **自定义 shell**。主进程会在处理 `.vue` 时先跑一次工具，再把输出作为「粗稿」注入各步 Prompt，由你配置的 LLM 继续精修为 hooks + TS + CSS Modules。

## 安全与执行环境

- **自定义命令** 在用户打开的项目根目录下、以本机 shell 执行，请只使用可信脚本。  
- `v2r-llm` 默认走其文档中的在线模型，需在工具侧自行配置 API Key（`v2r-llm config set apiKey …`）。

## 与 CodeRebuilder 的边界

| 能力           | Cursor + MCP     | CodeRebuilder                          |
|----------------|------------------|----------------------------------------|
| 读全仓图/依赖  | 强项             | 当前以单文件流水线为主，可借 context 补全 |
| 批量改文件     | Agent 模式       | 按文件版本、diff、确认写入 `.react` 镜像 |
| 机械转换 CLI   | 可终端手工跑     | 设置内一键作为初稿接入                 |

将 MCP 的发现整理进 `context.md` 或设置里的摘要，是让 **桌面端产出风格接近你在 Cursor 里调出的规范** 的最小闭环。
