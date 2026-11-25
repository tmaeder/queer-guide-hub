/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useUrlState } from '../useUrlState';

const MOODS = ['nightlife', 'slow', 'pride'] as const;

function setup(initial = '/travel') {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({ url: useUrlState(), location: useLocation(), nav: useNavigationType() }),
    { wrapper },
  );
}

describe('useUrlState', () => {
  it('reads an allowed choice and falls back on missing or unknown values', () => {
    expect(
      setup('/travel?mood=slow').result.current.url.choice('mood', MOODS, 'nightlife')[0],
    ).toBe('slow');
    expect(
      setup('/travel?mood=bogus').result.current.url.choice('mood', MOODS, 'nightlife')[0],
    ).toBe('nightlife');
    expect(setup('/travel').result.current.url.choice('mood', MOODS, 'nightlife')[0]).toBe(
      'nightlife',
    );
  });

  it('writing the fallback removes the key', () => {
    const { result } = setup('/travel?mood=slow');
    act(() => result.current.url.choice('mood', MOODS, 'nightlife')[1]('nightlife'));
    expect(result.current.location.search).toBe('');
  });

  it('keeps every write made in one handler', () => {
    const { result } = setup('/travel');
    act(() => {
      result.current.url.choice('mood', MOODS, 'nightlife')[1]('pride');
      result.current.url.text('pick')[1]('event-1');
    });
    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('mood')).toBe('pride');
    expect(params.get('pick')).toBe('event-1');
  });

  it('replaces by default and pushes when asked', () => {
    const { result } = setup('/travel');
    act(() => result.current.url.choice('mood', MOODS, 'nightlife')[1]('slow'));
    expect(result.current.nav).toBe('REPLACE');
    act(() => result.current.url.choice('mood', MOODS, 'nightlife')[1]('pride', { push: true }));
    expect(result.current.nav).toBe('PUSH');
  });

  it('text: absent is null, an empty value stays present', () => {
    const { result } = setup('/travel');
    expect(result.current.url.text('from')[0]).toBeNull();
    act(() => result.current.url.text('from')[1](''));
    expect(result.current.url.text('from')[0]).toBe('');
    act(() => result.current.url.text('from')[1](null));
    expect(result.current.url.text('from')[0]).toBeNull();
  });

  it('int clamps to the range and falls back on junk', () => {
    expect(setup('/travel?guests=40').result.current.url.int('guests', 2, 1, 9)[0]).toBe(9);
    expect(setup('/travel?guests=0').result.current.url.int('guests', 2, 1, 9)[0]).toBe(1);
    expect(setup('/travel?guests=two').result.current.url.int('guests', 2, 1, 9)[0]).toBe(2);
  });

  it('leaves other params alone', () => {
    const { result } = setup('/travel?section=pride');
    act(() => result.current.url.choice('mood', MOODS, 'nightlife')[1]('slow'));
    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('section')).toBe('pride');
    expect(params.get('mood')).toBe('slow');
  });
});
