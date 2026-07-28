/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFeedbackSelection } from '../useFeedbackSelection';

describe('useFeedbackSelection', () => {
  it('returns shape', () => {
    const { result } = renderHook(() => useFeedbackSelection({} as never, []));
    expect(result.current).toBeDefined();
  });
});
