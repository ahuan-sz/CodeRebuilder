import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { extname, join, relative, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { IpcMainInvokeEvent } from 'electron';
import { parse as parseSfc } from '@vue/compiler-sfc';
import { execa } from 'execa';
import type {
  DependencyAnalysisResult,
  IPCResponse,
  ModuleInfo,
  ReqAnalyzeProject,
  ResAnalyzeProject,
} from '../../../shared/ipc-types.js';

const SUPPORTED_EXTS = new Set(['.vue', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** 递归收集 src/ 下所有支持的源文件 */
function collectFiles(dir: string, root: string): string[] {
  const files: string[] = [];
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return files; }
  for (const name of entries) {
    if (name.startsWith('.') || name === 'node_modules' || name === 'dist' || name === 'out') continue;
    const abs = join(dir, name);
    let stat;
    try { stat = statSync(abs); } catch { continue; }
    if (stat.isDirectory()) {
      files.push(...collectFiles(abs, root));
    } else if (SUPPORTED_EXTS.has(extname(name).toLowerCase())) {
      files.push(relative(root, abs).replace(/\\/g, '/'));
    }
  }
  return files;
}

/** 从文件内容提取静态 import/export from 路径（仅相对路径） */
function extractImports(content: string): string[] {
  const IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"](\.[^'"]+)['"]/g;
  const REQUIRE_RE = /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  const paths: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = IMPORT_RE.exec(content)) !== null) paths.push(m[1]);
  while ((m = REQUIRE_RE.exec(content)) !== null) paths.push(m[1]);
  return paths;
}

/** 解析 Vue SFC，返回 script 内容 */
function vueScriptContent(absPath: string): string {
  try {
    const raw = readFileSync(absPath, 'utf-8');
    const { descriptor } = parseSfc(raw, { filename: absPath });
    return (descriptor.script?.content ?? '') + (descriptor.scriptSetup?.content ?? '');
  } catch {
    return '';
  }
}

/** 将 import 相对路径解析为项目内 rel 路径；找不到返回 null */
function resolveImport(
  fromRel: string,
  importPath: string,
  allFiles: Set<string>,
  projectRoot: string
): string | null {
  const fromAbs = join(projectRoot, fromRel);
  const base = resolve(dirname(fromAbs), importPath).replace(/\\/g, '/');
  const relBase = relative(projectRoot, base).replace(/\\/g, '/');

  // 精确匹配（带扩展名）
  if (allFiles.has(relBase)) return relBase;

  // 尝试补扩展名
  for (const ext of ['.ts', '.tsx', '.vue', '.js', '.jsx']) {
    const candidate = relBase + ext;
    if (allFiles.has(candidate)) return candidate;
  }
  // 尝试 index 文件
  for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.vue']) {
    const candidate = `${relBase}/index${ext}`;
    if (allFiles.has(candidate)) return candidate;
  }
  return null;
}

/** 生成 Graphviz DOT 格式 */
function buildDot(deps: Map<string, string[]>): string {
  const lines = ['digraph dependencies {', '  rankdir=LR;', '  node [shape=box fontsize=9];'];
  for (const [file, imports] of deps.entries()) {
    for (const imp of imports) {
      lines.push(`  ${JSON.stringify(file)} -> ${JSON.stringify(imp)};`);
    }
  }
  lines.push('}');
  return lines.join('\n');
}

/** 用 DFS 检测循环依赖 */
function findCircular(deps: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const stackArr: string[] = [];

  function dfs(node: string): void {
    if (stack.has(node)) {
      const idx = stackArr.indexOf(node);
      cycles.push([...stackArr.slice(idx), node]);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    stackArr.push(node);
    for (const dep of deps.get(node) ?? []) dfs(dep);
    stackArr.pop();
    stack.delete(node);
  }

  for (const node of deps.keys()) dfs(node);
  return cycles;
}

// ─── external tool runners ──────────────────────────────────────────────────

type CruiserResult = {
  dot?: string;
  svg?: string;
  violations?: { rule: string; severity: string; from: string; to: string }[];
  error?: string;
};

/**
 * 运行 dependency-cruiser（通过 npx，自动下载）。
 * 1. JSON 报告获取 violations
 * 2. DOT 格式依赖图
 * 3. 尝试用系统 `dot -Tsvg` 转换为 SVG（需要 brew install graphviz）
 */
async function runDependencyCruiser(projectRoot: string): Promise<CruiserResult> {
  const srcDir = join(projectRoot, 'src');
  if (!existsSync(srcDir)) return { error: '项目 src/ 目录不存在' };

  let violations: CruiserResult['violations'] = [];
  let dotContent: string | undefined;
  let svgBase64: string | undefined;
  const errors: string[] = [];

  // Step 1: JSON 报告（violations，不需要 graphviz）
  try {
    const jsonRun = await execa(
      'npx',
      ['--yes', 'dependency-cruiser', '--include-only', '^src', '--output-type', 'json', 'src'],
      { cwd: projectRoot, timeout: 120_000 }
    );
    const parsed = JSON.parse(jsonRun.stdout) as {
      summary?: { violations?: Array<{ rule: { name: string; severity: string }; from: string; to: string }> };
    };
    violations = (parsed.summary?.violations ?? []).map((v) => ({
      rule: v.rule?.name ?? '',
      severity: v.rule?.severity ?? '',
      from: v.from,
      to: v.to,
    }));
  } catch (e) {
    errors.push(`violations: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Step 2: DOT 格式（dependency-cruiser 支持的合法输出类型）
  try {
    const dotRun = await execa(
      'npx',
      ['--yes', 'dependency-cruiser', '--include-only', '^src', '--output-type', 'dot', 'src'],
      { cwd: projectRoot, timeout: 120_000 }
    );
    dotContent = dotRun.stdout;
  } catch (e) {
    errors.push(`dot: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Step 3: 用系统 graphviz 把 DOT 转 SVG（可选，失败不阻塞）
  if (dotContent) {
    try {
      const svgRun = await execa('dot', ['-Tsvg'], {
        input: dotContent,
        timeout: 30_000,
      });
      svgBase64 = Buffer.from(svgRun.stdout, 'utf-8').toString('base64');
    } catch {
      errors.push('SVG 转换失败（需要系统安装 Graphviz：brew install graphviz）');
    }
  }

  if (!dotContent && !violations?.length) {
    return { error: errors.join(' | ') };
  }
  return {
    dot: dotContent,
    svg: svgBase64,
    violations,
    error: errors.length ? errors.join(' | ') : undefined,
  };
}

type MadgeResult = {
  svg?: string;
  json?: Record<string, string[]>;
  error?: string;
};

/**
 * 运行 madge（通过 npx，自动下载），输出 JS/TS 模块依赖图。
 * --image 输出需要系统安装 graphviz；若失败则仅返回 JSON。
 */
async function runMadge(projectRoot: string): Promise<MadgeResult> {
  const srcDir = join(projectRoot, 'src');
  if (!existsSync(srcDir)) return { error: '项目 src/ 目录不存在' };

  let madgeJson: Record<string, string[]> | undefined;
  let madgeSvg: string | undefined;
  let errors: string[] = [];

  // JSON 依赖图（无额外依赖）
  try {
    const jsonRun = await execa(
      'npx',
      ['--yes', 'madge', '--json', 'src/'],
      { cwd: projectRoot, timeout: 120_000 }
    );
    madgeJson = JSON.parse(jsonRun.stdout) as Record<string, string[]>;
  } catch (e) {
    errors.push(`madge JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  // SVG 图（需要 graphviz dot 命令）
  const tmpSvg = join(tmpdir(), `madge-${Date.now()}.svg`);
  try {
    await execa(
      'npx',
      ['--yes', 'madge', '--image', tmpSvg, 'src/'],
      { cwd: projectRoot, timeout: 120_000 }
    );
    if (existsSync(tmpSvg)) {
      madgeSvg = Buffer.from(readFileSync(tmpSvg)).toString('base64');
      try { unlinkSync(tmpSvg); } catch { /* ignore */ }
    }
  } catch (e) {
    errors.push(`madge SVG: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!madgeJson && !madgeSvg) {
    return { error: errors.join(' | ') };
  }
  return { json: madgeJson, svg: madgeSvg, error: errors.length ? errors.join(' | ') : undefined };
}

// ─── main handler ────────────────────────────────────────────────────────────

export async function handleAnalyzeProject(
  _event: IpcMainInvokeEvent,
  req: ReqAnalyzeProject
): Promise<IPCResponse<ResAnalyzeProject>> {
  try {
    const projectRoot = req.projectRoot;
    const srcDir = join(projectRoot, 'src');

    const relFiles = collectFiles(srcDir, projectRoot);
    const allFilesSet = new Set(relFiles);

    // 构建依赖图
    const depsMap = new Map<string, string[]>();

    for (const relFile of relFiles) {
      const abs = join(projectRoot, relFile);
      let content: string;
      if (relFile.endsWith('.vue')) {
        content = vueScriptContent(abs);
      } else {
        try { content = readFileSync(abs, 'utf-8'); } catch { content = ''; }
      }
      const rawImports = extractImports(content);
      const resolved: string[] = [];
      for (const imp of rawImports) {
        const r = resolveImport(relFile, imp, allFilesSet, projectRoot);
        if (r && r !== relFile) resolved.push(r);
      }
      depsMap.set(relFile, [...new Set(resolved)]);
    }

    // 构建 importedBy 映射
    const importedByMap = new Map<string, string[]>();
    for (const file of relFiles) importedByMap.set(file, []);
    for (const [file, imports] of depsMap.entries()) {
      for (const dep of imports) {
        if (importedByMap.has(dep)) importedByMap.get(dep)!.push(file);
      }
    }

    const circularDependencies = findCircular(depsMap);
    const circularFileSet = new Set(circularDependencies.flat());

    const totalFiles = relFiles.length;
    const coreThreshold = Math.max(3, Math.ceil(totalFiles * 0.1));

    const modules: ModuleInfo[] = relFiles.map((file) => {
      const imports = depsMap.get(file) ?? [];
      const importedBy = importedByMap.get(file) ?? [];
      const isInCircular = circularFileSet.has(file);
      let role: ModuleInfo['role'] = 'normal';
      if (importedBy.length >= coreThreshold) role = 'core';
      else if (importedBy.length === 0) role = 'leaf';
      return { file, imports, importedBy, isInCircular, role };
    });

    modules.sort((a, b) => {
      const order = { core: 0, normal: 1, leaf: 2 } as const;
      const diff = order[a.role] - order[b.role];
      return diff !== 0 ? diff : b.importedBy.length - a.importedBy.length;
    });

    // 并行运行外部工具（耗时较长，但不阻塞基础分析结果）
    const [cruiser, madge] = await Promise.all([
      runDependencyCruiser(projectRoot),
      runMadge(projectRoot),
    ]);

    const externalErrors = [
      cruiser.error ? `dependency-cruiser: ${cruiser.error}` : '',
      madge.error   ? `madge: ${madge.error}` : '',
    ].filter(Boolean).join(' | ');

    const result: DependencyAnalysisResult = {
      modules,
      circularDependencies,
      totalFiles,
      coreThreshold,
      analyzedAt: new Date().toISOString(),
      dotFormat: buildDot(depsMap),
      cruiserDot: cruiser.dot,
      cruiserSvg: cruiser.svg,
      cruiserViolations: cruiser.violations,
      madgeSvg: madge.svg,
      madgeJson: madge.json,
      externalToolsError: externalErrors || undefined,
    };

    return { success: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: { code: 'INTERNAL', message: `依赖分析失败: ${msg}` } };
  }
}
