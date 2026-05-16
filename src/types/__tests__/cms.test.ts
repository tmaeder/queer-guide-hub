import { describe, it, expect } from 'vitest';
import * as CMS from '../cms';

describe('types/cms', () => {
  it('module loads', () => {
    expect(CMS).toBeDefined();
  });
});
