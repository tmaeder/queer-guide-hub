import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import { useFeedbackUrlState } from '@/hooks/useFeedbackUrlState';

function wrapper(initial: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
  );
}

describe('useFeedbackUrlState', () => {
  it('parses defaults when URL is empty', () => {
    const { result } = renderHook(() => useFeedbackUrlState(), {
      wrapper: wrapper('/admin/feedback'),
    });
    expect(result.current.state.tab).toBe('stories');
    expect(result.current.state.q).toBe('');
    expect(result.current.state.priority).toBe(null);
    expect(result.current.state.hasScreenshot).toBe(false);
    expect(result.current.activeFilterCount).toBe(0);
  });

  it('parses a full URL round-trip', () => {
    const { result } = renderHook(() => useFeedbackUrlState(), {
      wrapper: wrapper(
        '/admin/feedback?tab=spam&q=crash&category=bug&status=new&priority=0&hasScreenshot=1&hasErrors=1&sel=abc123',
      ),
    });
    expect(result.current.state.tab).toBe('spam');
    expect(result.current.state.q).toBe('crash');
    expect(result.current.state.category).toBe('bug');
    expect(result.current.state.status).toBe('new');
    expect(result.current.state.priority).toBe(0);
    expect(result.current.state.hasScreenshot).toBe(true);
    expect(result.current.state.hasErrors).toBe(true);
    expect(result.current.state.sel).toBe('abc123');
    // q + category + status + priority + hasScreenshot + hasErrors = 6
    expect(result.current.activeFilterCount).toBe(6);
  });

  it('update() removes params when cleared to default', () => {
    const { result } = renderHook(() => useFeedbackUrlState(), {
      wrapper: wrapper('/admin/feedback?q=foo&priority=1'),
    });
    expect(result.current.state.q).toBe('foo');
    act(() => result.current.update({ q: '' }));
    expect(result.current.state.q).toBe('');
    expect(result.current.activeFilterCount).toBe(1);
  });

  it('clearFilters() wipes filters but keeps tab/sel', () => {
    const { result } = renderHook(() => useFeedbackUrlState(), {
      wrapper: wrapper(
        '/admin/feedback?tab=spam&q=x&category=bug&sel=abc',
      ),
    });
    act(() => result.current.clearFilters());
    expect(result.current.state.q).toBe('');
    expect(result.current.state.category).toBe(null);
    expect(result.current.state.tab).toBe('spam');
    expect(result.current.state.sel).toBe('abc');
  });

  it('ignores invalid priority values', () => {
    const { result } = renderHook(() => useFeedbackUrlState(), {
      wrapper: wrapper('/admin/feedback?priority=notanumber'),
    });
    expect(result.current.state.priority).toBe(null);
  });
});
