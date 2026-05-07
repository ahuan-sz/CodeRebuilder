import { describe, expect, it } from 'vitest';
import { substituteMechanicalPlaceholders } from '../src/main/services/refactor/mechanical-runner.js';

describe('substituteMechanicalPlaceholders', () => {
  it('replaces all placeholders', () => {
    const cmd =
      'echo {input} > {outFile} && ls {outputDir} && cd {projectRoot} && name {stem}';
    expect(
      substituteMechanicalPlaceholders(cmd, {
        input: '/src/A.vue',
        outputDir: '/tmp/out',
        stem: 'A',
        projectRoot: '/proj',
        outFile: '/tmp/out/A.js',
      })
    ).toBe('echo /src/A.vue > /tmp/out/A.js && ls /tmp/out && cd /proj && name A');
  });
});
