import { describe, it, expect } from 'vitest';
import { isRealTagImage, hoverCardCls } from '../resourceHelpers';

describe('resourceHelpers', () => {
  it('isRealTagImage false for null', () => {
    expect(isRealTagImage(null)).toBe(false);
    expect(isRealTagImage('')).toBe(false);
  });
  it('isRealTagImage true for typical URL', () => {
    expect(isRealTagImage('https://example.com/img.jpg')).toBe(true);
  });
  it('hoverCardCls is a string', () => {
    expect(typeof hoverCardCls).toBe('string');
  });
});
