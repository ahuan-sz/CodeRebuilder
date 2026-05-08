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

export {};

declare global {
  interface Window {
    crApi: {
      openProject: () => Promise<IPCResponse<ProjectImportResult>>;
      getLastProject: () => Promise<IPCResponse<ProjectImportResult | null>>;
      scanVueFiles: (req: ReqScanVueFiles) => Promise<IPCResponse<ResScanVueFiles>>;
      startFile: (req: ReqStartRefactor) => Promise<IPCResponse<ResStartRefactor>>;
      getLatestDiff: (req: ReqGetLatestDiff) => Promise<IPCResponse<ResGetLatestDiff>>;
      confirmVersion: (req: ReqConfirmVersion) => Promise<IPCResponse<ResConfirmVersion>>;
      listVersions: (req: ReqListVersions) => Promise<IPCResponse<VersionListItem[]>>;
      getConfig: () => Promise<IPCResponse<AppConfig>>;
      setConfig: (cfg: AppConfig) => Promise<IPCResponse<AppConfig>>;
      setOpenAiKey: (key: string) => Promise<IPCResponse<{ hasKey: boolean }>>;
      clearOpenAiKey: () => Promise<IPCResponse<{ hasKey: boolean }>>;
      keyStatus: () => Promise<IPCResponse<{ hasKey: boolean }>>;
      onRefactorEvent: (
        channel:
          | 'refactor:task-progress'
          | 'refactor:file-status-updated'
          | 'refactor:diff-ready'
          | 'refactor:error',
        fn: (payload: unknown) => void
      ) => () => void;
    };
  }
}
