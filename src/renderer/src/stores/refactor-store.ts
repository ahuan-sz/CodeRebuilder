import { create } from 'zustand';
import { message } from 'antd';
import { pushDebugLog } from '../components/debug/debug-panel';
import type {
  FileStatusUpdatedPayload,
  ProjectImportResult,
  RefactorPlan,
  ResScanVueFiles,
  TaskProgressPayload,
  TreeNode,
} from '../../../shared/ipc-types';
import type { RefactorFileStatus } from '../../../shared/ipc-types';

export type ProjectState = ProjectImportResult | null;

type TaskProgressEntry = { phase: string; message?: string };

type RefactorStore = {
  project: ProjectState;
  plan: RefactorPlan | null;
  tree: TreeNode[];
  totalVueFiles: number;
  selectedPath: string | null;
  scanLoading: boolean;
  taskLog: string[];
  /** 当前各文件对应重构流水线阶段（用于工作台实时提示） */
  taskProgressByPath: Record<string, TaskProgressEntry>;
  /** 工作台收到选中文件的刷新信号（状态/Diff） */
  workbenchRefreshSeq: number;
  openProject: () => Promise<void>;
  restoreLastProject: () => Promise<void>;
  setPlan: (plan: RefactorPlan) => Promise<void>;
  scan: () => Promise<void>;
  selectFile: (path: string | null) => void;
  patchTreeStatus: (path: string, status: RefactorFileStatus, checked?: boolean) => void;
  pushTaskLog: (line: string) => void;
  setTaskProgress: (sourcePath: string, entry: TaskProgressEntry) => void;
  clearTaskProgress: (sourcePath: string) => void;
  bumpWorkbenchRefresh: () => void;
};

function patchNode(
  nodes: TreeNode[],
  targetPath: string,
  status: RefactorFileStatus,
  checked?: boolean
): TreeNode[] {
  return nodes.map((n) => {
    if (n.type === 'file' && n.path === targetPath) {
      return {
        ...n,
        status,
        checked: checked ?? (status === 'confirmed'),
      };
    }
    if (n.children?.length) {
      return { ...n, children: patchNode(n.children, targetPath, status, checked) };
    }
    return n;
  });
}

export const useRefactorStore = create<RefactorStore>((set, get) => ({
  project: null,
  plan: null,
  tree: [],
  totalVueFiles: 0,
  selectedPath: null,
  scanLoading: false,
  taskLog: [],
  taskProgressByPath: {},
  workbenchRefreshSeq: 0,

  setPlan: async (plan: RefactorPlan) => {
    if (typeof window.crApi === 'undefined') return;
    try {
      const cfgRes = await window.crApi.getConfig();
      if (!cfgRes.success) return;
      await window.crApi.setConfig({ ...cfgRes.data, refactorPlan: plan });
      set({ plan });
    } catch {
      /* ignore */
    }
  },

  restoreLastProject: async () => {
    if (typeof window.crApi === 'undefined') return;
    try {
      const res = await window.crApi.getLastProject();
      if (!res.success || !res.data) return;
      set({ project: res.data, tree: [], selectedPath: null });
      await get().scan();
    } catch {
      /* 静默：恢复失败不影响正常使用 */
    }
  },

  openProject: async () => {
    if (typeof window.crApi === 'undefined') {
      message.error('无法连接主进程（preload 未加载）。请使用 npm run dev 打开的 Electron 窗口，勿在浏览器中使用。');
      set({ taskLog: [...get().taskLog, '错误: preload(crApi) 未注入'] });
      return;
    }
    try {
      const res = await window.crApi.openProject();
      if (!res.success) {
        const errMsg = res.error.message;
        set({ taskLog: [...get().taskLog, `Open project failed: ${errMsg}`] });
        if (errMsg.includes('No folder') || errMsg.includes('未选择')) {
          message.info('已取消选择文件夹');
        } else if (
          errMsg.includes('浏览器预览') ||
          errMsg.includes('Electron 窗口')
        ) {
          message.warning(errMsg);
        } else {
          message.error(errMsg);
        }
        return;
      }
      message.success(`已打开项目：${res.data.name}`);
      set({ project: res.data, tree: [], selectedPath: null });
      await get().scan();
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      message.error(text);
      set({ taskLog: [...get().taskLog, `Open project exception: ${text}`] });
    }
  },

  scan: async () => {
    const { project } = get();
    if (!project) return;
    if (typeof window.crApi === 'undefined') return;
    set({ scanLoading: true });
    const body: Parameters<typeof window.crApi.scanVueFiles>[0] = {
      projectId: project.projectId,
      projectRoot: project.projectRoot,
    };
    const res = await window.crApi.scanVueFiles(body);
    set({ scanLoading: false });
    if (!res.success) {
      set({ taskLog: [...get().taskLog, `Scan failed: ${res.error.message}`] });
      return;
    }
    const data = res.data as ResScanVueFiles;
    set({ tree: data.tree, totalVueFiles: data.totalVueFiles });
  },

  selectFile: (path: string | null) => set({ selectedPath: path }),

  patchTreeStatus: (path, status, checked) =>
    set((s) => ({
      tree: patchNode(s.tree, path, status, checked),
    })),

  setTaskProgress: (sourcePath, entry) =>
    set((s) => ({
      taskProgressByPath: { ...s.taskProgressByPath, [sourcePath]: entry },
    })),

  clearTaskProgress: (sourcePath) =>
    set((s) => {
      if (!(sourcePath in s.taskProgressByPath)) return s;
      const next = { ...s.taskProgressByPath };
      delete next[sourcePath];
      return { taskProgressByPath: next };
    }),

  bumpWorkbenchRefresh: () =>
    set((s) => ({ workbenchRefreshSeq: s.workbenchRefreshSeq + 1 })),

  pushTaskLog: (line) => set((s) => ({ taskLog: [...s.taskLog, line] })),
}));

export function subscribeRefactorIpc(): () => void {
  if (typeof window.crApi === 'undefined') {
    pushDebugLog({
      kind: 'error',
      message: 'window.crApi 未定义',
      detail: 'preload 未加载或路径错误',
    });
    return () => {};
  }

  const unsubs: Array<() => void> = [];

  unsubs.push(
    window.crApi.onRefactorEvent('refactor:task-progress', (raw) => {
      const p = raw as TaskProgressPayload;
      useRefactorStore.getState().setTaskProgress(p.sourceFilePath, {
        phase: p.phase,
        message: p.message,
      });
      useRefactorStore.getState().pushTaskLog(
        `[${p.phase}] ${p.sourceFilePath}${p.message ? ` — ${p.message}` : ''}`
      );
    })
  );

  unsubs.push(
    window.crApi.onRefactorEvent('refactor:file-status-updated', (raw) => {
      const p = raw as FileStatusUpdatedPayload;
      useRefactorStore.getState().patchTreeStatus(p.sourceFilePath, p.status as RefactorFileStatus);
      if (useRefactorStore.getState().selectedPath === p.sourceFilePath) {
        useRefactorStore.getState().bumpWorkbenchRefresh();
      }
    })
  );

  unsubs.push(
    window.crApi.onRefactorEvent('refactor:diff-ready', (raw) => {
      const p = raw as { sourceFilePath: string; versionNo: number };
      useRefactorStore.getState().clearTaskProgress(p.sourceFilePath);
      useRefactorStore.getState().pushTaskLog(`Diff ready: ${p.sourceFilePath} v${p.versionNo}`);
      void useRefactorStore.getState().scan();
      if (useRefactorStore.getState().selectedPath === p.sourceFilePath) {
        useRefactorStore.getState().bumpWorkbenchRefresh();
      }
    })
  );

  unsubs.push(
    window.crApi.onRefactorEvent('refactor:error', (raw) => {
      const p = raw as { sourceFilePath?: string; message?: string };
      if (p.sourceFilePath) {
        useRefactorStore.getState().clearTaskProgress(p.sourceFilePath);
      }
      useRefactorStore.getState().pushTaskLog(`Error: ${p.message ?? 'unknown'}`);
      if (
        p.sourceFilePath &&
        useRefactorStore.getState().selectedPath === p.sourceFilePath
      ) {
        useRefactorStore.getState().bumpWorkbenchRefresh();
      }
    })
  );

  return () => unsubs.forEach((u) => u());
}
