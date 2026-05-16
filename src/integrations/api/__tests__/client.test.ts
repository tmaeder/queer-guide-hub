import { describe, it, expect } from 'vitest';
import { api } from '../client';

describe('api client', () => {
  it('is exported as an object', () => {
    expect(api).toBeDefined();
    expect(typeof api).toBe('object');
  });
});
