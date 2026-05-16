import { describe, it, expect } from 'vitest';
import { useToast, toast } from '../use-toast';

describe('ui/use-toast re-export', () => {
  it('exports useToast and toast', () => {
    expect(typeof useToast).toBe('function');
    expect(typeof toast).toBe('function');
  });
});
