import { expect, test, describe } from 'vitest';
import { transition, resolveRoundType, validateCanStartRefactor } from '../../../../src/main/services/refactor/state-machine.js';

describe('state-machine', () => {
  test('idle + START -> refactoring', () => {
    expect(transition('idle', 'START_REFACTOR')).toBe('refactoring');
  });

  test('resolveRoundType initial vs re_refactor', () => {
    expect(resolveRoundType('idle', undefined, false)).toBe('initial');
    expect(resolveRoundType('confirmed', undefined, true)).toBe('re_refactor');
    expect(resolveRoundType('confirmed', 'more', true)).toBe('re_refactor');
    expect(resolveRoundType('generated_pending', undefined, false)).toBe('re_refactor');
    expect(resolveRoundType('failed', undefined, true)).toBe('re_refactor');
    expect(resolveRoundType('failed', undefined, false)).toBe('initial');
  });

  test('validate start rules', () => {
    expect(validateCanStartRefactor('refactoring', undefined)).toBe('TASK_ALREADY_RUNNING');
    expect(validateCanStartRefactor('confirmed', undefined)).toBe(null);
    expect(validateCanStartRefactor('generated_pending', undefined)).toBe(null);
    expect(validateCanStartRefactor('confirmed', 'ok')).toBe(null);
  });
});
