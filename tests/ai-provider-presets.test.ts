import { describe, expect, it } from 'vitest';
import { AI_PROVIDER_PRESETS, mergeModelOptionForSelect, normalizeImportedAi } from '../src/shared/ai-provider-presets';

describe('normalizeImportedAi', () => {
  it('fills OpenAI defaults when blank', () => {
    const r = normalizeImportedAi({
      provider: 'openai',
      model: '',
      targetExt: 'tsx',
      openaiBaseUrl: '',
    });
    expect(r.openaiBaseUrl).toBe(AI_PROVIDER_PRESETS.openai.defaultBaseUrl);
    expect(r.model).toBe(AI_PROVIDER_PRESETS.openai.defaultModel);
  });

  it('preserves custom base url', () => {
    const custom = 'https://example.com/proxy/v1';
    const r = normalizeImportedAi({
      provider: 'openai',
      model: 'gpt-4o-mini',
      targetExt: 'tsx',
      openaiBaseUrl: custom,
    });
    expect(r.openaiBaseUrl).toBe(custom);
  });

  it('prepends orphan model to dropdown merge', () => {
    const o = mergeModelOptionForSelect(
      [{ value: 'a', label: 'A' }],
      'zzz-custom'
    );
    expect(o[0]?.value).toBe('zzz-custom');
  });
});
