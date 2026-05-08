import { BrowserWindow, dialog } from 'electron';
import type { IPCResponse, ProjectImportResult } from '../../../shared/ipc-types.js';
import { createOrGetProject } from '../../services/project-store.js';
import { isVueProject } from '../../services/refactor/vue-file-scanner.js';
import { loadConfig, saveConfig } from '../../services/config-manager.js';

export async function handleOpenProject(
  win: BrowserWindow
): Promise<IPCResponse<ProjectImportResult>> {
  if (win.isMinimized()) {
    win.restore();
  }
  void win.focus();
  if (process.platform === 'darwin') {
    win.moveTop();
  }

  const r = await dialog.showOpenDialog(win, {
    title: '选择要分析的项目根目录',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) {
    return {
      success: false,
      error: { code: 'VALIDATION_FAILED', message: 'No folder selected' },
    };
  }
  const root = r.filePaths[0].replace(/[/\\]+$/, '');
  const p = createOrGetProject(root);
  const name = p.display_name ?? root.split(/[/\\]/).pop() ?? 'project';

  saveConfig({ ...loadConfig(), lastOpenedProject: { projectId: p.id, projectRoot: p.root_path, name } });

  return {
    success: true,
    data: {
      projectId: p.id,
      projectRoot: p.root_path,
      name,
      isVueProject: isVueProject(p.root_path),
    },
  };
}
