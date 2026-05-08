import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppConfig,
  DependencyAnalysisResult,
  IPCResponse,
  ProjectImportResult,
  ReqAnalyzeProject,
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
} from '../shared/ipc-types';

type ConfigResponse = IPCResponse<AppConfig>;
type KeyStatusResponse = IPCResponse<{ hasKey: boolean }>;

const api = {
  openProject: (): Promise<IPCResponse<ProjectImportResult>> =>
    ipcRenderer.invoke('project:open-folder'),

  getLastProject: (): Promise<IPCResponse<ProjectImportResult | null>> =>
    ipcRenderer.invoke('project:get-last'),

  analyzeProject: (req: ReqAnalyzeProject): Promise<IPCResponse<DependencyAnalysisResult>> =>
    ipcRenderer.invoke('project:analyze-dependencies', req),

  scanVueFiles: (req: ReqScanVueFiles): Promise<IPCResponse<ResScanVueFiles>> =>
    ipcRenderer.invoke('refactor:scan-vue-files', req),

  startFile: (req: ReqStartRefactor): Promise<IPCResponse<ResStartRefactor>> =>
    ipcRenderer.invoke('refactor:start-file', req),

  getLatestDiff: (req: ReqGetLatestDiff): Promise<IPCResponse<ResGetLatestDiff>> =>
    ipcRenderer.invoke('refactor:get-latest-diff', req),

  confirmVersion: (req: ReqConfirmVersion): Promise<IPCResponse<ResConfirmVersion>> =>
    ipcRenderer.invoke('refactor:confirm-version', req),

  listVersions: (req: ReqListVersions): Promise<IPCResponse<VersionListItem[]>> =>
    ipcRenderer.invoke('refactor:list-versions', req),

  getConfig: (): Promise<ConfigResponse> => ipcRenderer.invoke('config:get'),

  setConfig: (cfg: AppConfig): Promise<ConfigResponse> => ipcRenderer.invoke('config:set', cfg),

  setOpenAiKey: (key: string): Promise<KeyStatusResponse> =>
    ipcRenderer.invoke('config:set-openai-key', key),

  clearOpenAiKey: (): Promise<KeyStatusResponse> => ipcRenderer.invoke('config:clear-openai-key'),

  keyStatus: (): Promise<KeyStatusResponse> => ipcRenderer.invoke('config:key-status'),

  onRefactorEvent: (
    channel:
      | 'refactor:task-progress'
      | 'refactor:file-status-updated'
      | 'refactor:diff-ready'
      | 'refactor:error',
    fn: (payload: unknown) => void
  ): (() => void) => {
    const sub = (_e: Electron.IpcRendererEvent, payload: unknown): void => fn(payload);
    ipcRenderer.on(channel, sub);
    return () => ipcRenderer.removeListener(channel, sub);
  },
};

contextBridge.exposeInMainWorld('crApi', api);

declare global {
  interface Window {
    crApi: typeof api;
  }
}
