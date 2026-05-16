import { describe, it, expect } from 'vitest';
import { EnhancedContentValidator } from '../EnhancedContentValidator';

describe('EnhancedContentValidator', () => {
  it('exposes validateContent', () => {
    expect(typeof EnhancedContentValidator.validateContent).toBe('function');
  });
});
