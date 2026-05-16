import { describe, it, expect } from 'vitest';
import { pipelineIcons, resolvePipelineIcon } from '../icon-registry';

describe('icon-registry', () => {
  it('has icons', () => {
    expect(Object.keys(pipelineIcons).length).toBeGreaterThan(0);
  });
  it('resolves unknown to fallback', () => {
    expect(resolvePipelineIcon('does-not-exist')).toBeDefined();
    expect(resolvePipelineIcon(null)).toBeDefined();
  });
});
