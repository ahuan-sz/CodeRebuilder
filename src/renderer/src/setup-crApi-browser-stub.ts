import type {
  AppConfig,
  IPCResponse,
  ProjectImportResult,
  ReqConfirmVersion,
  ReqGetLatestDiff,
  ReqListVersions,
  ReqScanVueFiles,
  ReqStartRefactor,
  ResConfirmVersion,
  ResGetLatestDiff,
  ResScanVueFiles,
  ResStartRefactor,
  VersionListItem,
} from '../../shared/ipc-types';

declare global {
  interface Window {
    /** 浏览器直连 Vite 时使用桩，避免白屏 */
    __CR_BROWSER_STUB__?: boolean;
  }
}

const defaultCfg: AppConfig = {
  ai: {
    provider: 'mock',
    model: 'gpt-4o-mini',
    targetExt: 'tsx',
  },
  refactorAssistant: {
    contextMarkdown: '',
    mechanicalDraft: {
      enabled: false,
      preset: 'none',
      timeoutSec: 120,
      customCommand: '',
    },
  },
};

function failBrowserPreview(msg: string): IPCResponse<never> {
  return {
    success: false,
    error: {
      code: 'VALIDATION_FAILED',
      message: msg,
    },
  };
}

/** 与 preload 暴露的 API 形状一致 */
function browserStub(): NonNullable<Window['crApi']> {
  return {
    openProject: async (): Promise<IPCResponse<ProjectImportResult>> =>
      failBrowserPreview(
        '当前为浏览器预览：请关闭此标签，使用终端执行 npm run dev 后出现的 Electron 窗口操作完整功能。'
      ),

    getLastProject: async (): Promise<IPCResponse<ProjectImportResult | null>> => ({
      success: true,
      data: null,
    }),

    scanVueFiles: async (_req: ReqScanVueFiles): Promise<IPCResponse<ResScanVueFiles>> =>
      failBrowserPreview('浏览器预览模式不支持扫描项目。'),

    startFile: async (_req: ReqStartRefactor): Promise<IPCResponse<ResStartRefactor>> =>
      failBrowserPreview('请在 Electron 窗口内执行重构。'),

    getLatestDiff: async (_req: ReqGetLatestDiff): Promise<IPCResponse<ResGetLatestDiff>> => ({
      success: true,
      data: {
        sourceCode:
          '// 浏览器预览：请在 Electron 窗口中打开项目后选择 .vue 文件，即可读取真实源码与生成结果。\n',
        generatedCode: '',
        versionNo: null,
        status: 'idle',
        hasGeneratedSnapshot: false,
      },
    }),

    confirmVersion: async (_req: ReqConfirmVersion): Promise<IPCResponse<ResConfirmVersion>> =>
      failBrowserPreview('请在 Electron 窗口内确认版本。'),

    listVersions: async (_req: ReqListVersions): Promise<IPCResponse<VersionListItem[]>> =>
      ({ success: true, data: [] }),

    getConfig: async (): Promise<IPCResponse<AppConfig>> => ({
      success: true,
      data: defaultCfg,
    }),

    setConfig: async (cfg: AppConfig): Promise<IPCResponse<AppConfig>> => ({
      success: true,
      data: cfg,
    }),

    setOpenAiKey: async (): Promise<IPCResponse<{ hasKey: boolean }>> => ({
      success: true,
      data: { hasKey: false },
    }),

    clearOpenAiKey: async (): Promise<IPCResponse<{ hasKey: boolean }>> => ({
      success: true,
      data: { hasKey: false },
    }),

    keyStatus: async (): Promise<IPCResponse<{ hasKey: boolean }>> => ({
      success: true,
      data: { hasKey: false },
    }),

    onRefactorEvent: (): (() => void) => () => {
      /* no-op */
    },
  };
}

/**
 * 在浏览器中直接打开 `http://localhost:5173/` 时没有 Electron preload，`crApi` 不存在。
 * 开发模式下为非 Electron UA 注入桩，避免白屏；真实功能需在 Electron 窗口中使用。
 */
function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '[::1]' ||
    h.endsWith('.localhost')
  );
}

export function ensureCrApiBrowserStub(): void {
  if (typeof window === 'undefined') return;
  if (window.crApi) return;

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isElectron = ua.includes('Electron');

  if (isElectron) {
    console.error(
      '[CodeRebuilder] Electron 窗口中未注入 window.crApi，请检查主进程 preload 路径（应与 electron-vite dev 输出的 preload 一致）。'
    );
    return;
  }

  /** 不只依赖 import.meta.env.DEV：少数环境下浏览器访问 dev server 时 DEV 可能为 false，导致桩未注入而白屏 */
  const allowBrowserStub = import.meta.env.DEV || import.meta.env.MODE === 'development' || isLocalDevHost();

  if (!allowBrowserStub) {
    console.error(
      '[CodeRebuilder] 非 Electron 且非本地开发页，无法注入 crApi 预览桩。请使用 npm run dev 打开的 Electron 窗口。'
    );
    return;
  }

  console.warn(
    '[CodeRebuilder] 检测到在无 preload 环境（多为浏览器打开 localhost）；已注入 crApi 预览桩。完整 IPC 请使用 npm run dev 弹出的 Electron 窗口。'
  );
  window.__CR_BROWSER_STUB__ = true;
  window.crApi = browserStub();
}
