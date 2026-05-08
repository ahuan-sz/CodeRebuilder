/** Shared IPC contracts (Main ↔ Renderer). */

import type { MigrationSkillId } from './migration-skills';
export type { MigrationSkillId } from './migration-skills';

export type IPCErrorCode =
  | 'TASK_ALREADY_RUNNING'
  | 'DIFF_NOT_READY'
  | 'VERSION_NOT_FOUND'
  | 'INVALID_STATE'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'INTERNAL';

export type IPCResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: IPCErrorCode; message: string; detail?: string } };

/**
 * Vue→React 「体力活」初稿预设：在调用本应用 LLM 分步流水线之前，可选先用外部 CLI 生成一版代码骨架。
 */
export type MechanicalDraftPreset =
  /** 仅用应用内 LLM 流水线 */
  | 'none'
  /** npm: npx -y v2r-llm transform …（自备 API key / 可先 v2r-llm config set） */
  | 'v2r_llm'
  /** npm: npx vue-to-react 的 vtr（偏规则转换/React class 年代风格，适合粗稿） */
  | 'vue_to_react_vtr'
  /** 自建 shell，占位符见 MechanicalDraftConfig.customCommand */
  | 'custom';

export type MechanicalDraftConfig = {
  enabled: boolean;
  preset: MechanicalDraftPreset;
  /** 秒，默认 120 */
  timeoutSec?: number;
  /**
   * preset=custom 时在项目根目录执行（shell）。
   * 占位：`{input}` `{outputDir}` `{stem}` `{projectRoot}` `{outFile}`（建议把产物写入 outputDir）
   */
  customCommand?: string;
};

/**
 * 与 Cursor / vue-to-react-mcp 等配合：把项目规范、依赖约定写进此处或仓库内 `.coderebuilder/context.md`，会注入每条迁移 Prompt。
 */
export type RefactorAssistantConfig = {
  contextMarkdown?: string;
  mechanicalDraft?: MechanicalDraftConfig;
};

export type MigrationPath = 'vue2_to_vue3' | 'vue2_to_react' | 'vue3_to_react';

export type RefactorPlan = {
  migrationPath: MigrationPath;
  useTypeScript: boolean;
  /** vue→vue3: 'pinia'|'vuex'；vue→react / vue3→react: 'zustand'|'redux-toolkit' */
  stateManagement: string;
  /** vue→vue3: 'less'|'sass'|'css'；vue→react: 'css-modules'|'tailwind'|'unocss' */
  styleSolution: string;
};

/** Persisted app settings (shared with renderer). */
export type AppConfig = {
  ai: {
    provider: 'openai' | 'anthropic' | 'deepseek' | 'mock' | 'zhipuai' | 'github_models' | 'hunyuan';
    model: string;
    targetExt: 'tsx' | 'jsx';
    openaiBaseUrl?: string;
  };
  refactorAssistant?: RefactorAssistantConfig;
  /** 当前重构方案，选择方案界面设置后持久化 */
  refactorPlan?: RefactorPlan;
  /** 上次打开的项目，供重启后自动恢复 */
  lastOpenedProject?: {
    projectId: string;
    projectRoot: string;
    name: string;
  };
};

export type RefactorFileStatus =
  | 'idle'
  | 'refactoring'
  | 'generated_pending'
  | 'confirmed'
  | 're_refactoring'
  | 'regenerated_pending'
  | 'failed';

export type TreeNode = {
  name: string;
  path: string;
  type: 'dir' | 'file';
  status?: RefactorFileStatus | string;
  checked?: boolean;
  children?: TreeNode[];
};

export type ModuleInfo = {
  file: string;
  imports: string[];
  importedBy: string[];
  isInCircular: boolean;
  /** 'core'：被大量文件引用；'leaf'：无人引用；'normal'：其他 */
  role: 'core' | 'leaf' | 'normal';
};

export type DependencyAnalysisResult = {
  modules: ModuleInfo[];
  circularDependencies: string[][];
  totalFiles: number;
  coreThreshold: number;
  analyzedAt: string;
  /** 内置轻量扫描器生成的 DOT 格式 */
  dotFormat: string;
  /** dependency-cruiser 输出的 DOT 字符串（系统有 graphviz 时转 SVG）*/
  cruiserDot?: string;
  /** dependency-cruiser SVG（需要系统 graphviz dot 命令，base64）*/
  cruiserSvg?: string;
  /** dependency-cruiser 原始 JSON violations */
  cruiserViolations?: { rule: string; severity: string; from: string; to: string }[];
  /** madge 输出的 SVG 字符串（base64）*/
  madgeSvg?: string;
  /** madge JS/TS 模块依赖 JSON */
  madgeJson?: Record<string, string[]>;
  /** 外部工具运行失败时的错误摘要 */
  externalToolsError?: string;
};

export type ReqAnalyzeProject = { projectId: string; projectRoot: string };
export type ResAnalyzeProject = DependencyAnalysisResult;

export type ReqScanVueFiles = { projectId: string; projectRoot: string };
export type ResScanVueFiles = {
  tree: TreeNode[];
  totalVueFiles: number;
};

export type ReqStartRefactor = {
  projectId: string;
  sourceFilePath: string;
  appendPrompt?: string;
  baseVersionNo?: number;
  /** Prompt 脚本 / 技能：Vue2、Vuex 等内置模板（见 migration-skills） */
  migrationSkill?: MigrationSkillId;
};

export type ResStartRefactor = {
  taskId: string;
  fileStatusId: string;
  nextStatus: string;
};

export type ReqGetLatestDiff = { projectId: string; sourceFilePath: string };
export type ResGetLatestDiff = {
  sourceCode: string;
  generatedCode: string;
  versionNo: number | null;
  status: RefactorFileStatus;
  /** 是否存在可读的最新「成功」生成快照（右侧为真实 TSX，而非占位） */
  hasGeneratedSnapshot: boolean;
};

export type ReqConfirmVersion = {
  projectId: string;
  sourceFilePath: string;
  versionNo: number;
  action: 'accept' | 'reject';
  reviewer: string;
  comment?: string;
};

export type ResConfirmVersion = {
  status: RefactorFileStatus;
  checked: boolean;
  confirmedVersionNo?: number;
};

export type ReqListVersions = { projectId: string; sourceFilePath: string };
export type VersionListItem = {
  versionNo: number;
  roundType: 'initial' | 're_refactor';
  generationStatus: 'succeeded' | 'failed';
  createdAt: string;
  modelName: string;
};

export type ProjectImportResult = {
  projectId: string;
  projectRoot: string;
  name: string;
  isVueProject: boolean;
};

export type TaskProgressPayload = {
  taskId: string;
  projectId: string;
  sourceFilePath: string;
  phase: string;
  message?: string;
};

export type FileStatusUpdatedPayload = {
  projectId: string;
  sourceFilePath: string;
  status: RefactorFileStatus;
  confirmedVersionNo?: number | null;
};

export type DiffReadyPayload = {
  projectId: string;
  sourceFilePath: string;
  versionNo: number;
};
