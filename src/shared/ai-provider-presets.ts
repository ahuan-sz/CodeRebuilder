import type { AppConfig } from './ipc-types';

export type AiProviderId = AppConfig['ai']['provider'];

export type AiModelOption = {
  value: string;
  label: string;
};

export type AiProviderPreset = {
  /** 公开的 OpenAI 兼容网关根路径；不配则清空（交由 SDK 或未接入场景） */
  defaultBaseUrl: string | undefined;
  /** 切换提供商时填入的默认模型 */
  defaultModel: string;
  /** 下拉候选项（宜选其一；仍可在保存前改 Base URL） */
  modelOptions: AiModelOption[];
};

/** 与各厂商公开文档的常见默认网关、推荐模型对齐；切换「提供商」时在 UI 自动套用。 */
export const AI_PROVIDER_PRESETS: Record<AiProviderId, AiProviderPreset> = {
  mock: {
    defaultBaseUrl: undefined,
    defaultModel: 'gpt-4o-mini',
    modelOptions: [
      {
        value: 'gpt-4o-mini',
        label: 'gpt-4o-mini（占位，不向真实网关发请求）',
      },
    ],
  },
  openai: {
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    modelOptions: [
      { value: 'gpt-4o-mini', label: 'gpt-4o-mini（代码迁移性价比高）' },
      { value: 'gpt-4o', label: 'gpt-4o' },
      { value: 'gpt-4-turbo', label: 'gpt-4-turbo' },
      { value: 'o3-mini', label: 'o3-mini（若控制台已开通）' },
    ],
  },
  deepseek: {
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    modelOptions: [
      { value: 'deepseek-chat', label: 'deepseek-chat（通用）' },
      { value: 'deepseek-reasoner', label: 'deepseek-reasoner（推理任务）' },
      { value: 'deepseek-coder', label: 'deepseek-coder' },
    ],
  },
  anthropic: {
    /** 主进程暂未走 Anthropic Messages API；留空避免误写入无效 OpenAI 兼容网关 */
    defaultBaseUrl: undefined,
    defaultModel: 'claude-3-5-sonnet-20241022',
    modelOptions: [
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
      { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
    ],
  },
};

/** 回填配置文件中「不在当前列表」的模型时仍可展示该项 */
export function mergeModelOptionForSelect(
  modelOptions: AiModelOption[],
  currentModel?: string | null
): AiModelOption[] {
  const m = (currentModel ?? '').trim();
  if (!m) return modelOptions;
  if (modelOptions.some((o) => o.value === m)) return modelOptions;
  return [{ value: m, label: `${m}（当前已保存）` }, ...modelOptions];
}

/** 从历史配置合并：缺模型或缺网关时套上公开默认（不覆盖用户已填写内容） */
export function normalizeImportedAi(ai: AppConfig['ai']): AppConfig['ai'] {
  const id = ai.provider as AiProviderId;
  const preset = AI_PROVIDER_PRESETS[id];
  const urlTrim = ai.openaiBaseUrl?.trim() ?? '';
  const modelTrim = ai.model?.trim() ?? '';
  return {
    ...ai,
    model: modelTrim || preset.defaultModel,
    openaiBaseUrl: urlTrim || preset.defaultBaseUrl || undefined,
  };
}
