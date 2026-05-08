import { ipcMain, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import type { IpcMainInvokeEvent } from 'electron';
import { handleScanVueFiles } from './refactor/scan-vue-files.js';
import { handleStartFile } from './refactor/start-file.js';
import { handleGetLatestDiff } from './refactor/get-latest-diff.js';
import { handleConfirmVersion } from './refactor/confirm-version.js';
import { handleListVersions } from './refactor/list-versions.js';
import { handleOpenProject } from './project/open-project.js';
import { handleAnalyzeProject } from './project/analyze-dependencies.js';
import { loadConfig, saveConfig, loadOpenAiKey, saveOpenAiKey, clearStoredOpenAiKey } from '../services/config-manager.js';
import { getProjectById } from '../services/project-store.js';
import { isVueProject } from '../services/refactor/vue-file-scanner.js';
import type { AppConfig, ProjectImportResult } from '../../shared/ipc-types.js';

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('project:open-folder', async (event: IpcMainInvokeEvent) => {
    const win =
      BrowserWindow.fromWebContents(event.sender) ??
      getWindow() ??
      BrowserWindow.getFocusedWindow() ??
      null;
    if (!win || win.isDestroyed()) {
      return { success: false, error: { code: 'INTERNAL', message: '无法关联窗口，请重试' } };
    }
    return handleOpenProject(win);
  });

  ipcMain.handle('project:analyze-dependencies', handleAnalyzeProject);
  ipcMain.handle('refactor:scan-vue-files', handleScanVueFiles);
  ipcMain.handle('refactor:start-file', handleStartFile);
  ipcMain.handle('refactor:get-latest-diff', handleGetLatestDiff);
  ipcMain.handle('refactor:confirm-version', handleConfirmVersion);
  ipcMain.handle('refactor:list-versions', handleListVersions);

  ipcMain.handle('config:get', async () => {
    return { success: true, data: loadConfig() };
  });

  ipcMain.handle('config:set', async (_e, cfg: AppConfig) => {
    const existing = loadConfig();
    saveConfig({ ...cfg, lastOpenedProject: existing.lastOpenedProject });
    return { success: true, data: loadConfig() };
  });

  ipcMain.handle('project:get-last', async () => {
    const cfg = loadConfig();
    const last = cfg.lastOpenedProject;
    if (!last) return { success: true, data: null };

    const row = getProjectById(last.projectId);
    if (!row || !existsSync(row.root_path)) {
      return { success: true, data: null };
    }

    const result: ProjectImportResult = {
      projectId: row.id,
      projectRoot: row.root_path,
      name: row.display_name ?? row.root_path.split(/[/\\]/).pop() ?? 'project',
      isVueProject: isVueProject(row.root_path),
    };
    return { success: true, data: result };
  });

  ipcMain.handle('config:set-openai-key', async (_e, key: string) => {
    if (key?.trim()) saveOpenAiKey(key.trim());
    return { success: true, data: { hasKey: Boolean(loadOpenAiKey()) } };
  });

  ipcMain.handle('config:clear-openai-key', async () => {
    clearStoredOpenAiKey();
    return { success: true, data: { hasKey: Boolean(loadOpenAiKey()) } };
  });

  ipcMain.handle('config:key-status', async () => {
    return { success: true, data: { hasKey: Boolean(loadOpenAiKey()) } };
  });
}
