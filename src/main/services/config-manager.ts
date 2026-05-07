import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';
import type { AppConfig } from '../../shared/ipc-types.js';

export type { AppConfig } from '../../shared/ipc-types.js';

const DEFAULT_MECHANICAL = {
  enabled: false,
  preset: 'none' as const,
  timeoutSec: 120,
  customCommand: '',
};

const DEFAULT_ASSISTANT: NonNullable<AppConfig['refactorAssistant']> = {
  contextMarkdown: '',
  mechanicalDraft: { ...DEFAULT_MECHANICAL },
};

const DEFAULT_CONFIG: AppConfig = {
  ai: {
    provider: 'mock',
    model: 'gpt-4o-mini',
    targetExt: 'tsx',
    openaiBaseUrl: undefined,
  },
  refactorAssistant: { ...DEFAULT_ASSISTANT, mechanicalDraft: { ...DEFAULT_MECHANICAL } },
};

function configPath(): string {
  return join(app.getPath('userData'), 'app-config.json');
}

export function loadConfig(): AppConfig {
  const p = configPath();
  if (!existsSync(p))
    return {
      ...DEFAULT_CONFIG,
      ai: { ...DEFAULT_CONFIG.ai },
      refactorAssistant: {
        ...DEFAULT_ASSISTANT,
        mechanicalDraft: { ...DEFAULT_MECHANICAL },
      },
    };
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as AppConfig;
    const assistantIn = raw.refactorAssistant ?? {};
    const mechIn = assistantIn.mechanicalDraft ?? {};
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      ai: { ...DEFAULT_CONFIG.ai, ...raw.ai },
      refactorAssistant: {
        ...DEFAULT_ASSISTANT,
        ...assistantIn,
        mechanicalDraft: {
          ...DEFAULT_MECHANICAL,
          ...mechIn,
        },
      },
    };
  } catch {
    return {
      ...DEFAULT_CONFIG,
      ai: { ...DEFAULT_CONFIG.ai },
      refactorAssistant: {
        ...DEFAULT_ASSISTANT,
        mechanicalDraft: { ...DEFAULT_MECHANICAL },
      },
    };
  }
}

export function saveConfig(cfg: AppConfig): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf-8');
}

/** Persist API key using OS secure storage (when available). */
export function saveOpenAiKey(key: string): void {
  const userData = app.getPath('userData');
  mkdirSync(userData, { recursive: true });
  const keyFile = join(userData, 'openai.key');
  if (!safeStorage.isEncryptionAvailable()) {
    writeFileSync(keyFile, key, { mode: 0o600 });
    return;
  }
  const buf = safeStorage.encryptString(key);
  writeFileSync(keyFile, buf);
}

export function loadOpenAiKey(): string | null {
  const keyFile = join(app.getPath('userData'), 'openai.key');
  if (!existsSync(keyFile)) {
    if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
    return null;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return readFileSync(keyFile, 'utf-8');
  }
  const buf = readFileSync(keyFile);
  try {
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

/** 删除加密或明文保存在 userData 的密钥文件；不修改进程环境变量。 */
export function clearStoredOpenAiKey(): void {
  const keyFile = join(app.getPath('userData'), 'openai.key');
  try {
    if (existsSync(keyFile)) unlinkSync(keyFile);
  } catch {
    /* ignore */
  }
}
