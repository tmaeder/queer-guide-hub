import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

describe('cn', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should handle conditional classes', () => {
    const isHidden = false;
    expect(cn('base', isHidden && 'hidden', 'visible')).toBe('base visible');
  });

  it('should merge Tailwind conflicts', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
  });

  it('should handle undefined and null', () => {
    expect(cn('a', undefined, null, 'b')).toBe('a b');
  });

  it('should handle empty input', () => {
    expect(cn()).toBe('');
  });
});
