import OpenAI from 'openai';
import { loadConfig, loadOpenAiKey } from '../config-manager.js';

export type LlmPipelineStep =
  | 'pipeline_template'
  | 'pipeline_script'
  | 'pipeline_style'
  | 'pipeline_assemble'
  | 'vuex_whole'
  | 'single_shot_fallback';

export type CompleteResult = {
  text: string;
  model: string;
  provider: string;
  inputTokens?: number;
  outputTokens?: number;
};

export async function completePrompt(
  prompt: string,
  meta?: { step?: LlmPipelineStep }
): Promise<CompleteResult> {
  const cfg = loadConfig().ai;
  void meta;

  if (cfg.provider === 'mock') {
    return mockComplete(prompt, cfg.model, meta?.step);
  }

  if (cfg.provider === 'anthropic') {
    throw new Error(
      '当前版本尚未接入 Anthropic SDK。请在设置中将「AI 提供商」改为 OpenAI 兼容或 DeepSeek，保存 API Base URL 与 Key 后再重构。'
    );
  }

  const key = loadOpenAiKey();
  if (!key) {
    throw new Error(
      '未检测到 API Key：请在「设置」中填写 OpenAI 兼容密钥并保存；或改用「Mock」离线体验占位流程。「DeepSeek」同样走 OpenAI 兼容接口，请将 Base URL 设为官方文档地址（如 https://api.deepseek.com/v1）。'
    );
  }

  const client = new OpenAI({
    apiKey: key,
    baseURL: cfg.openaiBaseUrl || undefined,
  });

  const res = await client.chat.completions.create({
    model: cfg.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  });

  const text = res.choices[0]?.message?.content ?? '';
  return {
    text,
    model: cfg.model,
    provider: cfg.provider === 'deepseek' ? 'deepseek' : 'openai',
    inputTokens: res.usage?.prompt_tokens,
    outputTokens: res.usage?.completion_tokens,
  };
}

function mockComplete(
  prompt: string,
  model: string,
  step?: LlmPipelineStep
): CompleteResult {
  const usageIn = Math.min(32000, Math.ceil(prompt.length / 4));
  switch (step) {
    case 'pipeline_template':
      return {
        text: `\`\`\`jsx\n<div className={styles.root}><p className={styles.mock}>mock template jsx</p></div>\n\`\`\``,
        model,
        provider: 'mock',
        inputTokens: usageIn,
        outputTokens: 42,
      };
    case 'pipeline_script':
      return {
        text: `\`\`\`tsx\nconst [n, setN] = React.useState(0);\n\`\`\``,
        model,
        provider: 'mock',
        inputTokens: usageIn,
        outputTokens: 36,
      };
    case 'pipeline_style':
      return {
        text: `\`\`\`css\n.root { padding: 8px; }\n.mock { opacity: 0.9; }\n\`\`\``,
        model,
        provider: 'mock',
        inputTokens: usageIn,
        outputTokens: 28,
      };
    default:
      return {
        text: `\`\`\`tsx
import React from 'react';
import styles from './Migrated.module.css';

export default function MockMigratedComponent() {
  const [count, setCount] = React.useState(0);
  return (
    <div className={styles.root}>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        mock · you are in Mock mode — switch AI provider & save API key in Settings ({count})
      </button>
    </div>
  );
}
\`\`\`

\`\`\`css
.root {
  padding: 8px;
}
\`\`\`
`,
        model,
        provider: 'mock',
        inputTokens: usageIn,
        outputTokens: 180,
      };
  }
}
