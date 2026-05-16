import { describe, it, expect } from 'vitest';
import * as T from '../types';

describe('intimate/types', () => {
  it('module loads', () => {
    expect(T).toBeDefined();
  });
});
