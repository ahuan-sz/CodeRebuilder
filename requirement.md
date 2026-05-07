# Electron AI 桌面应用开发文档：代码项目重构助手

## 1. 项目概述
**项目名称**：CodeRebuilder（代号）  
**目标用户**：前端开发者、技术负责人  
**核心价值**：借助大语言模型（LLM）和自动化工具，将 Vue 2/3 项目定向重构为 Vue 3 或 React，并提供依赖分析、分步重构、人工验收等功能，降低迁移成本与风险。

**开发执行模式**：本项目按“全栈一体化执行”设计，不预设前后端/测试等角色分工；需求文档主要面向 AI 编码代理，要求可按章节直接实现（实现 -> 自测 -> 迭代修正）。

### 1.1 主要功能矩阵
| 功能模块 | 说明 |
|---------|------|
| 项目导入 | 本地目录导入 / Git 仓库克隆 |
| 依赖环境识别与安装 | 自动检测包管理器、技术栈，执行依赖安装 |
| 模块依赖分析 | 基于 `madge`/`dependency-cruiser` 生成依赖图，输出分析报告与重构建议 |
| 分步重构计划 | 根据依赖分析生成可执行的重构步骤，允许人工调整顺序 |
| AI 辅助重构 | 集成 OpenAI / Claude / DeepSeek，按模块调用 LLM 生成目标代码 |
| Vue 文件专项重构 | 解析 SFC → LLM 转换 → 拼装 React/Vue3 文件，支持 CSS Modules |
| 重构历史与回滚 | 记录每次重构操作，支持差异对比和回退 |
| 配置管理 | AI API Key 管理、转换规则配置、项目规范学习 |

## 2. 技术栈选型
### 2.1 桌面端框架
- **Electron** 28+（主进程 + 渲染进程）
- 渲染进程：React + TypeScript + Tailwind CSS / Ant Design
- 状态管理：Zustand 或 Redux Toolkit
- 构建工具：Vite（用于渲染进程打包）

### 2.2 核心依赖库
| 功能 | 选型 | 备注 |
|------|------|------|
| 依赖分析 | `madge`，`dependency-cruiser` | 生成依赖图、循环依赖检测 |
| 代码解析 | `@vue/compiler-sfc`，`@babel/parser`，`typescript` | Vue SFC 拆解、AST 操作 |
| Git 操作 | `simple-git` | 克隆、分支管理、PR 生成 |
| 进程管理 | `execa` / `child_process` | 执行 npm/yarn/pnpm 命令 |
| AI 客户端 | `openai`，`@anthropic-ai/sdk`，`openai` (兼容 DeepSeek) | 统一适配层 |
| 文件监听 | `chokidar` | 监听项目文件变化 |
| 报告输出 | `puppeteer` (生成 HTML/PDF) | 依赖图下载 |
| Vue→React 辅助 | `v2r-llm`，`vue-to-react`，`vue-to-react-mcp` | 可选集成 |

### 2.3 开发工具
- TypeScript 全栈
- ESLint + Prettier
- Electron Builder（打包分发）
- Jest + Playwright（测试）

## 3. 系统架构
### 3.1 进程模型
```
+-------------------+       +-------------------+
|   Main Process    |<----->|  Renderer Process |
|  - 文件系统访问    |  IPC  |  - UI 界面        |
|  - Git 操作       |       |  - 状态管理       |
|  - 子进程管理     |       |  - 用户交互       |
|  - AI 服务调用    |       +-------------------+
|  - 本地数据库     |
+-------------------+
       |
  +----+----+
  | Worker  |  (Node.js worker_threads 处理耗时任务)
  +---------+
```

### 3.2 模块划分
```
src/
├── main/                 # 主进程
│   ├── index.ts          # 入口
│   ├── ipc/              # IPC 处理器
│   ├── services/         # 业务逻辑
│   │   ├── project-importer.ts
│   │   ├── dependency-installer.ts
│   │   ├── module-analyzer.ts
│   │   ├── refactor-engine.ts
│   │   ├── ai-provider.ts
│   │   └── config-manager.ts
│   ├── workers/          # 后台线程
│   └── utils/
├── renderer/             # 渲染进程 React 应用
│   ├── components/
│   ├── pages/
│   ├── stores/
│   └── hooks/
├── shared/               # 共享类型、常量
└── assets/
```

## 4. 功能详细设计

### 4.1 项目导入
**主进程负责：**
- 本地导入：调用系统文件选择器（`dialog.showOpenDialog`）获取目录路径；递归扫描文件结构，识别根目录配置文件（`package.json`，`vite.config.ts` 等）。
- Git 导入：用户输入仓库 URL（支持 HTTPS/SSH），使用 `simple-git` 克隆到临时目录，支持进度回调（通过 IPC 推送）。
- 验证：检查目录是否为 Vue 项目（存在 `.vue` 文件或 `vue` 依赖）。

### 4.2 依赖环境识别与安装
**识别逻辑：**
- 检测 `package.json` 中的 `dependencies` 及 `devDependencies` 判断技术栈（Vue 版本、Vite/Webpack 等）。
- 检测锁文件（`package-lock.json`，`yarn.lock`，`pnpm-lock.yaml`）确定包管理器。
- 自动运行 `[pm] install` 命令，捕获输出流并实时展示到 UI。

**安全措施：**
- 安装前询问用户确认命令。
- 在沙箱环境中执行（可利用 `child_process.exec` 设置 timeout 和 cwd）。

### 4.3 模块依赖分析
**工作流：**
1. 主进程调用 `madge` 或 `dependency-cruiser` CLI 或 API，生成 JSON 格式的依赖图。
2. 计算模块的引用次数、对外提供接口，识别核心模块与边缘模块。
3. 生成可视化依赖图（通过 `dependency-cruiser` 的 `dot` 输出，转换为 SVG/PNG）并提供下载。
4. 结合静态分析（AST）给出重构优先级建议（如循环依赖、高耦合模块）。
5. 输出 Markdown/HTML 报告，包含：
   - 模块依赖图（嵌入图片）
   - 核心模块列表与风险点
   - 重构路线建议

**实现要点：**
- 为 `madge` 传递项目入口文件列表。
- 支持排除 `node_modules`、测试文件等。
- 报告保存路径由用户选择。

### 4.4 分步重构计划
- 基于依赖分析结果，自动生成有序步骤，例如：
  1. 分离全局状态（Vuex → Pinia 或 Redux）
  2. 转换公共工具函数
  3. 页面组件自底向上迁移
  4. 根组件与路由
- 每一步可绑定到具体的文件列表。
- 用户可在 UI 中拖拽调整步骤顺序、增删步骤。
- 计划可保存为 JSON 文件，以便重复执行。

### 4.5 AI 辅助重构引擎
**AI 适配层（主进程）：**
支持多种提供商（OpenAI, Claude, DeepSeek 等），封装统一接口：
```typescript
interface AIProvider {
  complete(prompt: string, options?: { model: string; temperature?: number }): Promise<string>;
  completeWithMessages(messages: Message[]): Promise<string>;
}
```
- 每个提供商的 API Key 加密存储于本地（使用 `safeStorage`）。
- 支持多轮对话、流式输出（通过 IPC 流式推送到渲染进程展示）。
- 内置 Rate Limit 与错误重试逻辑。

**重构任务调度：**
- 按步骤获取需重构文件列表，对每个文件执行：“解析 → 生成 Prompt → 调用 AI → 后处理 → 写入新文件”。
- 支持并行处理（限制并发数），防止 API 额度耗尽过快。
- 支持中断/恢复，中间状态持久化。

### 4.6 Vue 文件专项重构
#### 4.6.1 Vue SFC 解析
使用 `@vue/compiler-sfc` 解析 `.vue` 文件，得到：
- `<template>` → HTML/AST
- `<script>` / `<script setup>` → JavaScript/TypeScript
- `<style>` (支持 `scoped`，`lang`) → CSS/SCSS 等

#### 4.6.2 LLM 转换策略
对于 Vue 2 → React：
- **模板** → JSX（通过 Prompt 要求生成 React 组件，处理条件/循环/事件绑定等）
- **逻辑** → React Hooks（转换 data、computed、methods、watch、lifecycle）
- **样式** → CSS Modules（抽取为 `.module.css`，调整类名）

可使用链式工具组合：
1. 先用 `v2r-llm` 或开源转换器生成初稿（“体力活”），定位到临时分支。
2. 再用 LLM 根据项目规范（从已有 React 组件学习）对初稿进行精调。

集成 `vue-to-react-mcp`：
- 作为内部服务运行，提供标准化接口，AI 可调用其获得依赖分析和转换建议，逐步学习项目风格。

#### 4.6.3 脚本化重构（Node.js 实现）
对于简单场景，可不调用 LLM，直接通过脚本完成：
- 预定义规则映射（如 `v-if` → `condition ? <Comp /> : null`，`v-for` → `list.map`）。
- 结合 AST 转换（`vue-template-compiler` + `@babel/generator`）。
- 生成 `.tsx` 和 `.module.css` 文件的基础骨架。

#### 4.6.4 人工 Review 机制
- 每次重构生成结果后，在 UI 中展示差异对比（集成 `monaco-editor` 的 diff 视图）。
- 用户可单文件验收、修改、重新生成。
- 通过 Git（simple-git）创建分支，逐文件提交，最终可推送到 PR。

#### 4.6.5 Vue 文件清单、状态管理与二次重构
**文件罗列与目录树展示：**
- 系统扫描项目下全部 `.vue` 文件（含子目录），在左侧以“项目真实目录树”展示，不允许扁平化丢失层级。
- 每个文件节点展示重构状态按钮，建议状态枚举：
  - `未开始`：未执行重构；
  - `已生成待确认`：已生成 React 代码，等待人工确认；
  - `已确认`：人工确认采纳，状态打勾；
  - `已二次重构待确认`：对已重构文件追加提示词后重新生成，等待再次确认。

**重构产物目录（强约束）：**
- 在项目根目录维护独立的 `.react` 文件夹作为重构结果根目录。
- `.react` 内目录结构必须与 Vue 项目源目录完全一致（同路径映射），仅文件后缀按目标语言变化（如 `.vue` → `.tsx` / `.jsx`，样式文件按策略输出）。
- 未确认前可写入 `.react/.staging`（或内存草稿），确认后再原子化落盘到 `.react` 正式路径，避免误覆盖已确认版本。

**前后对比与人工确认：**
- 当某个 `.vue` 文件完成重构时，必须展示“源文件 vs 目标文件”差异预览（前后代码对比）。
- 用户点击“确认采纳”后：
  - 将目标文件写入 `.react` 对应路径；
  - 将该文件状态更新为 `已确认` 并显示勾选；
  - 记录确认人、确认时间、提示词版本、模型信息（用于审计与追溯）。
- 用户点击“拒绝/继续修改”时，不更新确认状态，保留 `已生成待确认`。

**已重构文件再次重构：**
- 用户可选中 `已确认` 或 `已生成待确认` 的文件，输入追加提示词进行“再次重构”。
- 再次重构必须复用历史上下文（原始 Vue、上一次 React 结果、历史提示词），并生成新版本 Diff 供再次确认。
- 再次确认通过后覆盖 `.react` 对应文件，同时保留历史版本记录（可回看、可回滚）。

### 4.7 重构目标支持
| 源 | 目标 | 转换策略 |
|----|------|----------|
| Vue 2 | Vue 3 | 升级 Composition API，替换已废弃 API，调整构建配置 |
| Vue 2 | React | 全套转换，模板→JSX，逻辑→Hooks，样式→CSS Modules |
| Vue 3 | React | 类似上述，少了版本升级步骤 |

> 目前仅对 Vue 文件进行重构识别，后续可扩展。

### 4.8 配置管理
- **AI Token 页面**：单独的安全输入区域，支持添加多个提供商及密钥。
- **转换偏好设置**：是否使用 CSS Modules、缩进风格、组件类型（函数式/类组件，但推荐函数式）、React 版本等。
- **项目规范学习**：允许用户提供示例 React 组件文件，提取代码风格（命名约定、目录结构、常用 Hooks），注入到 Prompt 中作为 few-shot 样例。

## 5. 核心工作流程
### 5.1 完整重构流程
```
[导入项目] → [安装依赖] → [模块依赖分析] → [生成重构步骤]
    → [用户确认/调整步骤]
    → [逐步执行 AI 重构]
        → 对每一步:
            → [解析源文件] → [构建 Prompt] → [调用 LLM] → [后处理] → [写入目标文件] → [UI 展示 diff]
            → [用户验收: 接受/编辑/重试]
    → [完成，生成报告与分支]
```

### 5.2 单个 Vue 文件重构流程
```
[选择 Vue 文件] → [解析 SFC] → [检测重构目标]
    → [可选：使用 v2r-llm 生成初稿]
    → [构建针对各块的 Prompt] → [并行/串行请求 AI]
    → [组合结果: 生成 .tsx + .module.css]
    → [写入临时区/版本草稿] → [Diff 对比: 源 Vue vs 新 React]
    → [用户确认]
        → [确认通过: 写入 .react 镜像路径 + 状态打勾]
        → [追加提示词再次重构: 生成新版本并再次 Diff]
```

## 6. UI/UX 设计
- **仪表盘**：展示当前项目状态、重构进度。
- **项目面板**：左侧文件树按真实目录展示全部 `.vue` 文件；每个节点展示状态按钮（未开始/待确认/已确认/二次待确认）与勾选标识。
- **分析报告区**：依赖图交互、建议步骤列表（可拖拽）。
- **重构控制台**：步骤执行日志、AI 流式输出、Token 消耗统计。
- **Diff 视图**：左右分栏展示 Vue 源码与 React 结果，支持内联编辑、确认采纳、拒绝、再次重构。
- **重构操作区**：支持为“已重构文件”输入增量提示词并触发二次重构，展示版本列表与确认记录。

技术选型：

- Monaco Editor 作为代码编辑/差异查看器。
- 全部主题使用暗色/亮色切换。
- 使用 Ant Design 组件库快速构建布局、表格、表单等。

## 7. 可直接开发规格（状态机 + 数据表 + IPC）
### 7.1 文件重构状态机定义
以“单个 Vue 文件”为聚合根，状态机如下：

- `未开始`（`idle`）
  - 触发事件：`START_REFACTOR`
  - 转移到：`重构中`（`refactoring`）
- `重构中`（`refactoring`）
  - 触发事件：`REFACTOR_SUCCEEDED`
  - 转移到：`已生成待确认`（`generated_pending`）
  - 触发事件：`REFACTOR_FAILED`
  - 转移到：`重构失败`（`failed`）
- `已生成待确认`（`generated_pending`）
  - 触发事件：`CONFIRM_ACCEPT`
  - 转移到：`已确认`（`confirmed`）
  - 触发事件：`CONFIRM_REJECT`
  - 转移到：`已生成待确认`（保持原状态）
  - 触发事件：`RETRY_WITH_PROMPT`
  - 转移到：`二次重构中`（`re_refactoring`）
- `已确认`（`confirmed`）
  - 触发事件：`RETRY_WITH_PROMPT`
  - 转移到：`二次重构中`（`re_refactoring`）
- `二次重构中`（`re_refactoring`）
  - 触发事件：`REFACTOR_SUCCEEDED`
  - 转移到：`已二次重构待确认`（`regenerated_pending`）
  - 触发事件：`REFACTOR_FAILED`
  - 转移到：`重构失败`（`failed`）
- `已二次重构待确认`（`regenerated_pending`）
  - 触发事件：`CONFIRM_ACCEPT`
  - 转移到：`已确认`（`confirmed`）
  - 触发事件：`CONFIRM_REJECT`
  - 转移到：`已二次重构待确认`（保持原状态）
- `重构失败`（`failed`）
  - 触发事件：`RETRY_WITH_PROMPT`
  - 转移到：`重构中`（`refactoring`）或 `二次重构中`（`re_refactoring`，取决于是否已有确认版本）

状态机约束（必须实现）：
- 同一文件任一时刻只允许存在 1 个“进行中任务”（`refactoring` / `re_refactoring` 互斥）。
- `CONFIRM_ACCEPT` 必须先通过 Diff 数据完整性校验（存在源版本 + 候选版本）。
- 仅 `confirmed` 状态允许在 UI 打勾；打勾动作必须与落盘 `.react` 文件同事务提交。
- 文件状态变化必须写入审计日志（操作人、时间、事件、版本号）。

### 7.2 数据表结构（SQLite 建议实现）
推荐数据库：`sqlite3`，并开启 WAL 模式以提升并发读写稳定性。

```sql
-- 文件状态表：每个 Vue 源文件一行（当前视图）
CREATE TABLE IF NOT EXISTS refactor_file_status (
  id TEXT PRIMARY KEY,                          -- UUID
  project_id TEXT NOT NULL,                     -- 项目标识
  source_file_path TEXT NOT NULL,               -- 相对路径，如 src/views/Home.vue
  target_file_path TEXT NOT NULL,               -- 相对路径，如 .react/src/views/Home.tsx
  current_status TEXT NOT NULL,                 -- idle/refactoring/generated_pending/confirmed/re_refactoring/regenerated_pending/failed
  latest_version_no INTEGER NOT NULL DEFAULT 0, -- 最新版本号（从 1 开始）
  confirmed_version_no INTEGER,                 -- 当前已确认版本号
  last_error TEXT,                              -- 最近一次失败原因
  updated_at TEXT NOT NULL,                     -- ISO 时间
  created_at TEXT NOT NULL,                     -- ISO 时间
  UNIQUE(project_id, source_file_path)
);

CREATE INDEX IF NOT EXISTS idx_rfs_project_status
  ON refactor_file_status(project_id, current_status);

-- 重构版本表：记录每次生成候选结果（包含首次和二次）
CREATE TABLE IF NOT EXISTS refactor_versions (
  id TEXT PRIMARY KEY,                          -- UUID
  project_id TEXT NOT NULL,
  file_status_id TEXT NOT NULL,                 -- FK -> refactor_file_status.id
  version_no INTEGER NOT NULL,                  -- 版本号（同一文件递增）
  round_type TEXT NOT NULL,                     -- initial/re_refactor
  source_snapshot_path TEXT NOT NULL,           -- 快照路径（可落地到 .history）
  generated_snapshot_path TEXT NOT NULL,        -- 生成结果快照路径
  prompt_full_text TEXT NOT NULL,               -- 最终发送给模型的完整 prompt
  prompt_append_text TEXT,                      -- 用户追加提示词
  model_provider TEXT NOT NULL,                 -- openai/anthropic/deepseek...
  model_name TEXT NOT NULL,                     -- 具体模型名
  token_input INTEGER,
  token_output INTEGER,
  generation_status TEXT NOT NULL,              -- succeeded/failed
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(file_status_id) REFERENCES refactor_file_status(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rv_file_version
  ON refactor_versions(file_status_id, version_no);

-- 确认记录表：记录每一次人工确认动作（接受/拒绝）
CREATE TABLE IF NOT EXISTS refactor_confirmations (
  id TEXT PRIMARY KEY,                          -- UUID
  project_id TEXT NOT NULL,
  file_status_id TEXT NOT NULL,                 -- FK -> refactor_file_status.id
  version_id TEXT NOT NULL,                     -- FK -> refactor_versions.id
  action TEXT NOT NULL,                         -- accept/reject
  reviewer TEXT NOT NULL,                       -- 本机用户名或系统用户
  comment TEXT,                                 -- 备注
  confirmed_at TEXT NOT NULL,                   -- ISO 时间
  FOREIGN KEY(file_status_id) REFERENCES refactor_file_status(id),
  FOREIGN KEY(version_id) REFERENCES refactor_versions(id)
);

CREATE INDEX IF NOT EXISTS idx_rc_file_time
  ON refactor_confirmations(file_status_id, confirmed_at DESC);
```

落盘与目录规则（必须实现）：
- 源文件路径到目标路径映射：
  - `src/a/b/Foo.vue` -> `.react/src/a/b/Foo.tsx`（或 `.jsx`，由项目配置决定）。
- 每次生成先写快照（如 `.react/.history/<source_rel_path>/<version_no>/`），确认后再覆盖 `.react` 正式文件。
- `confirmed_version_no` 对应的版本，必须与 `.react` 正式文件内容一致。

### 7.3 IPC 接口草案（Main <-> Renderer）
约定：命名空间使用 `refactor:*`，请求响应统一返回：

```typescript
type IPCResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; detail?: string };
};
```

核心请求接口（`ipcRenderer.invoke`）：

```typescript
// 1) 扫描项目并构建 Vue 目录树
'refactor:scan-vue-files'
type ReqScanVueFiles = { projectId: string; projectRoot: string };
type ResScanVueFiles = IPCResponse<{
  tree: Array<{
    name: string;
    path: string;
    type: 'dir' | 'file';
    status?: string;
    checked?: boolean;
    children?: any[];
  }>;
  totalVueFiles: number;
}>;

// 2) 启动重构（首次或二次）
'refactor:start-file'
type ReqStartRefactor = {
  projectId: string;
  sourceFilePath: string;
  appendPrompt?: string;     // 二次重构时可选
  baseVersionNo?: number;    // 二次重构建议传入，锁定基线
};
type ResStartRefactor = IPCResponse<{
  taskId: string;
  fileStatusId: string;
  nextStatus: string;
}>;

// 3) 获取某文件最新 Diff 预览数据
'refactor:get-latest-diff'
type ReqGetLatestDiff = { projectId: string; sourceFilePath: string };
type ResGetLatestDiff = IPCResponse<{
  sourceCode: string;
  generatedCode: string;
  versionNo: number;
  status: string;
}>;

// 4) 确认采纳/拒绝某版本
'refactor:confirm-version'
type ReqConfirmVersion = {
  projectId: string;
  sourceFilePath: string;
  versionNo: number;
  action: 'accept' | 'reject';
  reviewer: string;
  comment?: string;
};
type ResConfirmVersion = IPCResponse<{
  status: string;
  checked: boolean;
  confirmedVersionNo?: number;
}>;

// 5) 获取文件历史版本列表
'refactor:list-versions'
type ReqListVersions = { projectId: string; sourceFilePath: string };
type ResListVersions = IPCResponse<Array<{
  versionNo: number;
  roundType: 'initial' | 're_refactor';
  generationStatus: 'succeeded' | 'failed';
  createdAt: string;
  modelName: string;
}>>;
```

事件推送接口（`webContents.send` / `ipcRenderer.on`）：

```typescript
'refactor:task-progress'   // 任务进度（解析中/生成中/后处理）
'refactor:file-status-updated' // 单文件状态更新（刷新目录树节点）
'refactor:diff-ready'      // 某版本 Diff 已可查看
'refactor:error'           // 异常通知
```

接口行为约束（必须实现）：
- `refactor:start-file` 在文件存在进行中任务时返回 `409` 语义错误（`TASK_ALREADY_RUNNING`）。
- `refactor:confirm-version` 的 `accept` 必须执行：
  1. 写入 `refactor_confirmations`；
  2. 更新 `refactor_file_status.confirmed_version_no/current_status`；
  3. 覆盖 `.react` 正式文件；
  4. 推送 `refactor:file-status-updated` 事件。
- `refactor:get-latest-diff` 若无候选版本返回 `404` 语义错误（`DIFF_NOT_READY`）。

## 8. 数据安全与隐私
- 代码文件和对 AI 的请求均在本地发起（除 API 调用外），不上传代码到第三方服务器（除非使用云 AI 服务）。
- 用户 API Key 存储使用 Electron 的 `safeStorage` 加密，或用户自行输入每次会话密钥（不落盘）。
- 提供网络代理设置以适配企业内部网络。
- 明确告知用户数据流向（仅发送重构所需的代码片段到 AI 提供商）。

## 9. 性能与稳定性
- 依赖分析、大量文件 AI 转换等任务放入 `Worker Threads` 或分离子进程，避免阻塞主进程。
- 并发控制：限制同时 AI 请求数量（如 3 个），可配置。
- 支持单文件重构失败不影响其余步骤。
- 断点续传：将重构进度与生成结果持久化到本地数据库（如 `lowdb` 或 `sqlite3`）。

## 10. 开发里程碑规划
1. **M1 基础框架**：Electron 壳 + 渲染进程 React UI + 主进程 IPC 通信。
2. **M2 项目导入与依赖安装**：本地导入、Git 克隆、包管理器检测与安装。
3. **M3 模块分析**：集成 madge/dependency-cruiser，生成依赖图与报告。
4. **M4 AI 集成与单文件重构**：接入 OpenAI，实现 Vue SFC 解析与基本 LLM 转换，Diff 查看。
5. **M5 批量重构与步骤控制**：基于分析结果自动分步，批量执行，验收流程。
6. **M6 高级集成**：vue-to-react-mcp，规范学习，多 AI 提供商切换。
7. **M7 测试与优化**：单元测试、集成测试，性能调优，发布第一版。

## 11. 开发任务拆解清单（Sprint 级）
### 11.1 Sprint 规划与范围
- **执行主体约束**：默认由单一执行体（AI 或个人开发者）端到端完成主进程、渲染进程、存储与测试，不依赖角色切分。
- **任务编排规则**：按 Sprint 顺序串行推进；若并行，仅允许“无依赖项”并行，最终以集成测试通过为完成标志。
- **交付定义（DoD）**：每个 Sprint 必须同时满足“功能可用 + 数据可追溯 + 最小自动化测试通过”。
- **Sprint 1（基础能力）**：Vue 文件扫描、目录树展示、文件状态初始化。
- **Sprint 2（重构主链路）**：单文件重构、版本写入、Diff 展示、事件推送。
- **Sprint 3（确认与落盘）**：确认采纳/拒绝、`.react` 正式落盘、勾选状态同步。
- **Sprint 4（二次重构与历史）**：追加提示词再生成、版本列表、历史确认记录。
- **Sprint 5（稳定性与测试）**：冲突控制、失败恢复、全链路自动化测试。

### 11.2 Sprint 1：扫描与目录树
**目标：**
- 打通 `refactor:scan-vue-files`，在 UI 左侧展示完整 `.vue` 目录树与初始状态。

**接口与文件落点：**
- IPC：`refactor:scan-vue-files`
  - `src/main/ipc/refactor/scan-vue-files.ts`
- 服务：
  - `src/main/services/refactor/vue-file-scanner.ts`
  - `src/main/services/refactor/file-tree-builder.ts`
- 存储：
  - `src/main/services/storage/refactor-file-status-repo.ts`
  - `src/main/services/storage/migrations/001_init_refactor_tables.sql`
- 渲染层/UI：
  - `src/renderer/stores/refactor-store.ts`
  - `src/renderer/components/project-tree/refactor-tree.tsx`

**验收标准：**
- 导入任意 Vue 项目后，目录树节点数与磁盘 `.vue` 文件数一致。
- 节点路径与项目真实层级一致，不出现扁平化丢层。
- 新扫描文件默认状态为 `idle`，UI 不打勾。
- 重复扫描不会产生重复记录（`project_id + source_file_path` 唯一）。

### 11.3 Sprint 2：单文件重构与 Diff
**目标：**
- 打通 `refactor:start-file`、`refactor:get-latest-diff`，实现“生成候选版本 + Diff 预览”。

**接口与文件落点：**
- IPC：
  - `refactor:start-file` -> `src/main/ipc/refactor/start-file.ts`
  - `refactor:get-latest-diff` -> `src/main/ipc/refactor/get-latest-diff.ts`
- 服务：
  - `src/main/services/refactor/refactor-orchestrator.ts`
  - `src/main/services/refactor/prompt-builder.ts`
  - `src/main/services/refactor/version-writer.ts`
- 存储：
  - `src/main/services/storage/refactor-versions-repo.ts`
- 事件：
  - `src/main/ipc/refactor/events.ts`（`refactor:task-progress`、`refactor:diff-ready`）
- 渲染层/UI：
  - `src/renderer/pages/refactor-workbench.tsx`
  - `src/renderer/components/diff/refactor-diff-panel.tsx`

**验收标准：**
- 点击“开始重构”后状态从 `idle` 变为 `refactoring`，完成后为 `generated_pending`。
- 成功生成后可拿到 `sourceCode` 与 `generatedCode`，Diff 面板可渲染。
- 生成版本写入 `refactor_versions`，`version_no` 按文件递增。
- 同一文件重复点击启动，返回 `TASK_ALREADY_RUNNING` 错误。

### 11.4 Sprint 3：确认采纳与 .react 落盘
**目标：**
- 打通 `refactor:confirm-version`，支持采纳/拒绝，采纳后写入 `.react` 并打勾。

**接口与文件落点：**
- IPC：
  - `refactor:confirm-version` -> `src/main/ipc/refactor/confirm-version.ts`
- 服务：
  - `src/main/services/refactor/confirm-service.ts`
  - `src/main/services/refactor/react-target-writer.ts`
  - `src/main/services/refactor/state-machine.ts`
- 存储：
  - `src/main/services/storage/refactor-confirmations-repo.ts`
  - `src/main/services/storage/refactor-file-status-repo.ts`
- 渲染层/UI：
  - `src/renderer/components/diff/review-actions.tsx`
  - `src/renderer/stores/refactor-store.ts`

**验收标准：**
- `accept` 后：
  - `.react/<mirror_path>` 存在且内容与确认版本一致；
  - `current_status=confirmed`、`confirmed_version_no` 更新；
  - UI 节点勾选显示。
- `reject` 后：
  - 不覆盖 `.react` 正式文件；
  - 状态保持待确认（`generated_pending` 或 `regenerated_pending`）。
- 每次确认动作均写入 `refactor_confirmations`。

### 11.5 Sprint 4：二次重构与版本历史
**目标：**
- 支持已确认文件追加提示词再次重构，并可查看历史版本列表。

**接口与文件落点：**
- IPC：
  - `refactor:start-file`（复用，带 `appendPrompt`、`baseVersionNo`）
  - `refactor:list-versions` -> `src/main/ipc/refactor/list-versions.ts`
- 服务：
  - `src/main/services/refactor/re-refactor-service.ts`
  - `src/main/services/refactor/version-history-service.ts`
- 渲染层/UI：
  - `src/renderer/components/refactor/retry-with-prompt.tsx`
  - `src/renderer/components/refactor/version-history-drawer.tsx`

**验收标准：**
- 对 `confirmed` 文件可发起二次重构，状态流转 `confirmed -> re_refactoring -> regenerated_pending`。
- 历史列表按时间倒序展示，包含 `versionNo`、`roundType`、`modelName`、`generationStatus`。
- 二次重构 `accept` 后覆盖 `.react` 正式文件，同时保留旧版本快照。
- 可基于历史版本重新拉起 Diff 预览。

### 11.6 Sprint 5：稳定性、回归与发布门禁
**目标：**
- 提升鲁棒性并建立“可发布”质量门禁。

**接口与文件落点：**
- 并发与错误控制：
  - `src/main/services/refactor/task-lock-manager.ts`
  - `src/main/ipc/refactor/error-mapper.ts`
- 自动化测试：
  - `tests/unit/main/refactor/state-machine.test.ts`
  - `tests/unit/main/storage/refactor-repos.test.ts`
  - `tests/integration/ipc/refactor-flow.test.ts`
  - `tests/e2e/refactor-review-flow.spec.ts`
- 质量门禁脚本：
  - `scripts/ci/check-refactor-flow.ts`

**验收标准：**
- 全量测试通过：单测、集成、E2E 全绿。
- 关键错误码覆盖并可复现：`TASK_ALREADY_RUNNING`、`DIFF_NOT_READY`、`VERSION_NOT_FOUND`。
- 异常中断后重启应用可恢复状态（DB 与 `.react/.history` 一致）。
- CI 门禁要求：重构主链路覆盖率 >= 80%（按语句覆盖率）。

### 11.7 IPC 接口到实现文件映射总表
| IPC 接口 | Main Handler 文件 | 主要 Service 文件 | Renderer 调用落点 | 主要验收点 |
|---|---|---|---|---|
| `refactor:scan-vue-files` | `src/main/ipc/refactor/scan-vue-files.ts` | `vue-file-scanner.ts`、`file-tree-builder.ts` | `refactor-store.ts`、`refactor-tree.tsx` | 目录树完整、状态初始化 |
| `refactor:start-file` | `src/main/ipc/refactor/start-file.ts` | `refactor-orchestrator.ts`、`prompt-builder.ts` | `refactor-workbench.tsx` | 启动任务、生成候选版本 |
| `refactor:get-latest-diff` | `src/main/ipc/refactor/get-latest-diff.ts` | `version-history-service.ts` | `refactor-diff-panel.tsx` | 返回可渲染 Diff 数据 |
| `refactor:confirm-version` | `src/main/ipc/refactor/confirm-version.ts` | `confirm-service.ts`、`react-target-writer.ts` | `review-actions.tsx` | 采纳落盘、拒绝不落盘 |
| `refactor:list-versions` | `src/main/ipc/refactor/list-versions.ts` | `version-history-service.ts` | `version-history-drawer.tsx` | 历史版本正确展示 |

### 11.8 AI 执行输入/输出约定（用于自动开发）
为便于 AI 直接执行，每个 Sprint 建议遵循以下固定输入/输出格式：

- **输入（AI Prompt 必含）**
  - Sprint 编号与目标（如 `Sprint 2: 单文件重构与 Diff`）。
  - 本 Sprint 允许修改的文件列表（白名单）。
  - 必须实现的 IPC 接口与错误码。
  - 验收标准（来自本章“验收标准”原文）。
- **输出（AI 回传必含）**
  - 实际修改文件清单。
  - 每个接口的实现状态（已完成/未完成/阻塞原因）。
  - 本地验证结果（单测/集成/E2E 或无法执行原因）。
  - 与验收标准的逐条对照结果。

建议执行循环：
1. 读取本 Sprint 目标与接口清单；
2. 完成实现并自测；
3. 若未满足验收标准，继续迭代直至通过；
4. 输出变更与验证结论后进入下一 Sprint。

## 12. 测试策略
- **单元测试**：对解析器、适配器、Prompt 模板进行覆盖。
- **集成测试**：模拟完整项目导入→重构流程，使用 fixture 小型 Vue 项目。
- **E2E 测试**：用 Playwright 测试渲染进程界面操作。
- **AI 模拟**：测试时使用 Mock AI 服务返回固定 JSON，确保流程正确。

## 13. 打包与分发
- 使用 `electron-builder` 构建 Windows (.exe/.msi)、macOS (.dmg)、Linux (.AppImage) 安装包。
- 配置自动更新服务（可选）。
- 签名与公证。

## 附录：关键 Prompt 设计示例
### Vue Template → JSX Prompt
```
你是一个专业的前端开发者。将以下 Vue 模板转换为 React JSX，遵循规范：
- 使用函数式组件
- 事件绑定使用驼峰命名
- 样式使用 className 引用 CSS Modules
- v-if 转为三元表达式，v-for 转为 array.map
Vue 模板：
<template>...</template>
请只输出 JSX 代码，不包含组件声明。
```

### Script 转换 Prompt
```
将以下 Vue Options API/Composition API 代码转换为 React Hooks（使用 TypeScript）：
- data → useState
- computed → useMemo / useCallback
- watch → useEffect
- methods → 普通函数
保持原有逻辑和类型注解。
Vue 代码：...
请输出完整的 React 组件逻辑部分。
```
