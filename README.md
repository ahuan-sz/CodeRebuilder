# CodeRebuilder

> AI 驱动的 Vue → React / Vue 3 代码重构桌面助手（Electron + React + TypeScript）

借助大语言模型（LLM），将 Vue 2/3 项目逐文件迁移为 React（TSX）或 Vue 3，提供分步流水线、差异对比、版本历史与人工验收等功能，大幅降低迁移成本与风险。

---

## 功能亮点

| 功能 | 说明 |
|------|------|
| 项目导入 | 本地目录一键打开，重启自动恢复上次项目 |
| Vue SFC 解析 | `@vue/compiler-sfc` 解析 template / script / style |
| AI 四步流水线 | template → JSX → script/hooks → style → 拼装成品 |
| 差异对比 | Monaco Editor 并排展示原始 Vue 与生成 TSX |
| 版本历史 | 每次重构留存快照，可随时回溯对比 |
| 人工验收 | 接受/拒绝每个文件的重构结果 |
| 外部初稿工具 | 可选 v2r-llm / vue-to-react 先生成粗稿，再由 LLM 精炼 |
| 免费 AI 优先 | 内置智谱AI / GitHub Models / 腾讯混元免费通道 |

---

## 快速开始

### 环境要求

- Node.js ≥ 22（推荐使用 `.nvmrc` 中指定的版本）
- npm ≥ 10

```bash
nvm use          # 切换到项目指定 Node 版本
npm install
npm run dev      # 启动 Electron 开发环境
```

> **注意**：应用功能（IPC / 文件系统 / AI 调用）只在 Electron 窗口中可用，请勿直接在浏览器访问 `localhost:5173`。

### 构建

```bash
npm run build    # 构建生产包（Electron + Vite）
```

---

## AI 供应商配置

在应用右上角点击「**设置**」，选择 AI 提供商并填入 API Key 后保存即可。

### 免费平台（推荐）

以下三个平台均提供 **OpenAI 兼容接口**，注册后即可免费使用，无需付费。

---

#### 🆓 智谱AI · GLM-4-Flash（**首选推荐**）

- **推荐理由**：30B 参数专为编码优化，200K 超长上下文，完全免费
- **注册地址**：[open.bigmodel.cn](https://open.bigmodel.cn)
- **获取 Key**：注册登录 → 右上角头像 → **API Keys** → 新建 API Key
- **应用设置**：
  - 提供商：`智谱AI · GLM-4-Flash`
  - 模型：`glm-4-flash`（自动填入）
  - Base URL：`https://open.bigmodel.cn/api/paas/v4`（自动填入）
  - API Key：粘贴刚才获取的 Key

---

#### 🆓 GitHub Models · GPT-4o / DeepSeek-R1

- **推荐理由**：GitHub 用户直接可用，支持 GPT-4o、DeepSeek-R1 等顶级模型，免费有速率限制
- **注册地址**：[github.com/marketplace/models](https://github.com/marketplace/models)
- **获取 Key**：登录 GitHub → 右上角头像 → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → Generate new token（无需勾选任何权限）
- **应用设置**：
  - 提供商：`GitHub Models · GPT-4o / DeepSeek-R1`
  - 模型：`gpt-4o-mini`（可换 `DeepSeek-R1` 等）
  - Base URL：`https://models.inference.ai.azure.com`（自动填入）
  - API Key：粘贴 GitHub Personal Access Token

---

#### 🆓 腾讯混元 · hunyuan-lite

- **推荐理由**：1M 超长上下文，适合项目级全量分析，Lite 版免费
- **注册地址**：[hunyuan.tencent.com](https://hunyuan.tencent.com)
- **获取 Key**：登录腾讯云 → 搜索「混元大模型」→ **API 密钥管理** → 新建密钥
- **应用设置**：
  - 提供商：`腾讯混元 · hunyuan-lite`
  - 模型：`hunyuan-lite`（自动填入）
  - Base URL：`https://api.hunyuan.cloud.tencent.com/v1`（自动填入）
  - API Key：粘贴腾讯云密钥

---

### 付费平台

| 提供商 | Base URL | 推荐模型 | 文档 |
|--------|----------|----------|------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | [platform.openai.com](https://platform.openai.com) |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | [platform.deepseek.com](https://platform.deepseek.com) |

---

## 项目结构

```
src/
├── main/                    # Electron 主进程
│   ├── index.ts             # 入口，创建窗口
│   ├── ipc/                 # IPC 处理器
│   │   ├── project/         # 项目打开
│   │   └── refactor/        # 重构相关（扫描/启动/差异/版本）
│   └── services/
│       ├── config-manager.ts      # 配置读写 + API Key 安全存储
│       ├── project-store.ts       # 项目 SQLite 存储
│       └── refactor/
│           ├── refactor-orchestrator.ts  # 重构主流程
│           ├── ai-provider.ts            # AI 调用（OpenAI 兼容）
│           ├── prompt-builder.ts         # Prompt 构建
│           ├── mechanical-runner.ts      # 外部初稿工具
│           └── state-machine.ts         # 文件状态机
├── preload/                 # contextBridge 暴露 crApi
├── renderer/src/            # React 渲染进程
│   ├── App.tsx              # 布局 + 设置抽屉
│   ├── pages/               # 重构工作台
│   ├── components/          # 文件树 / Diff 面板 / 操作按钮
│   └── stores/              # Zustand 状态管理
└── shared/                  # 主进程与渲染共用类型
    ├── ipc-types.ts
    ├── ai-provider-presets.ts
    └── migration-skills.ts
```

---

## 开发说明

### 环境变量

| 变量 | 说明 |
|------|------|
| `CODE_REBUILDER_OPEN_DEVTOOLS=1` | 开发模式自动打开 DevTools |
| `OPENAI_API_KEY` | 可通过环境变量注入 API Key（优先级低于应用内保存的 Key） |

### 常用命令

```bash
npm run dev          # 开发模式（热重载）
npm run build        # 生产构建
npm run build:vite   # 仅 Vite 构建（不打包 Electron）
npm run test         # 运行单元测试
npm run lint         # ESLint 检查
```

### API Key 存储机制

API Key 通过 Electron `safeStorage` 加密后存储在系统用户目录（`~/Library/Application Support/code-rebuilder/openai.key`），不会写入代码仓库。

---

## License

MIT
