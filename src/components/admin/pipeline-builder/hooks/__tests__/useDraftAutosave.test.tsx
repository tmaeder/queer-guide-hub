/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDraftAutosave } from '../useDraftAutosave';

describe('useDraftAutosave', () => {
  it('returns shape', () => {
    const { result } = renderHook(() => useDraftAutosave(undefined, 'p', [], [], false));
    expect(result.current).toBeDefined();
  });
});
