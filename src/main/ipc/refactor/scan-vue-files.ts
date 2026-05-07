import type {
  IPCResponse,
  ReqScanVueFiles,
  ResScanVueFiles,
} from '../../../shared/ipc-types.js';
import type { RefactorFileStatus } from '../../../shared/ipc-types.js';
import { getProjectById } from '../../services/project-store.js';
import { scanReactMirrorFiles, scanVueFiles } from '../../services/refactor/vue-file-scanner.js';
import {
  buildTreeFromPaths,
  treeChildrenAsRoots,
} from '../../services/refactor/file-tree-builder.js';
import {
  listFileStatusesByProject,
  upsertFileStatusIdle,
} from '../../services/storage/refactor-file-status-repo.js';
import { sourceVueToTargetReactRel } from '../../services/refactor/react-target-writer.js';

function normalizeRoot(p: string): string {
  return p.replace(/[/\\]+$/, '');
}

export async function handleScanVueFiles(
  _e: unknown,
  req: ReqScanVueFiles
): Promise<IPCResponse<ResScanVueFiles>> {
  try {
    const project = getProjectById(req.projectId);
    const root = normalizeRoot(req.projectRoot);
    if (!project || normalizeRoot(project.root_path) !== root) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Unknown project or path mismatch' },
      };
    }
    const vuePaths = scanVueFiles(root);
    const reactPaths = scanReactMirrorFiles(root);
    const treePaths = [...new Set([...vuePaths, ...reactPaths])].sort();

    for (const p of vuePaths) {
      const target = sourceVueToTargetReactRel(p);
      upsertFileStatusIdle(req.projectId, p, target);
    }
    const statuses = listFileStatusesByProject(req.projectId);
    const map = new Map<string, RefactorFileStatus>(
      statuses.map((s) => [s.source_file_path, s.current_status as RefactorFileStatus])
    );
    const tree = buildTreeFromPaths(treePaths, map);
    return {
      success: true,
      data: { tree: treeChildrenAsRoots(tree), totalVueFiles: vuePaths.length },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: { code: 'INTERNAL', message: msg } };
  }
}
