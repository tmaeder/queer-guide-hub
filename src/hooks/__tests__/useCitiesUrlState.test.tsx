import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { useCitiesUrlState } from '@/hooks/useCitiesUrlState';

function wrapper(initial: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>;
  };
}

/** Render the hook and also surface the current location for assertions. */
function renderWithLocation(initial: string) {
  let location: { pathname: string; search: string } = { pathname: '/', search: '' };
  function Probe() {
    const loc = useLocation();
    location = { pathname: loc.pathname, search: loc.search };
    return useCitiesUrlState();
  }
  const view = renderHook(Probe, { wrapper: wrapper(initial) });
  return {
    ...view,
    getLocation: () => location,
  };
}

describe('useCitiesUrlState — parsing', () => {
  it('returns defaults for an empty URL', () => {
    const { result } = renderHook(useCitiesUrlState, { wrapper: wrapper('/cities') });
    expect(result.current.q).toBe('');
    expect(result.current.continents.size).toBe(0);
    expect(result.current.tiers.size).toBe(0);
    expect(result.current.sort).toBe('population');
    expect(result.current.view).toBe('list');
    expect(result.current.city).toBe('');
  });

  it('parses q, continent, equality, sort, view, city', () => {
    const { result } = renderHook(useCitiesUrlState, {
      wrapper: wrapper(
        '/cities?q=ber&continent=eu,as&equality=very-high,high&sort=equality&view=map&city=berlin',
      ),
    });
    expect(result.current.q).toBe('ber');
    expect(Array.from(result.current.continents).sort()).toEqual(['as', 'eu']);
    expect(Array.from(result.current.tiers).sort()).toEqual(['high', 'very-high']);
    expect(result.current.sort).toBe('equality');
    expect(result.current.view).toBe('map');
    expect(result.current.city).toBe('berlin');
  });

  it('falls back to defaults for invalid sort / view / equality values', () => {
    const { result } = renderHook(useCitiesUrlState, {
      wrapper: wrapper('/cities?sort=garbage&view=elsewhere&equality=nope,very-high'),
    });
    expect(result.current.sort).toBe('population');
    expect(result.current.view).toBe('list');
    expect(Array.from(result.current.tiers)).toEqual(['very-high']);
  });
});

describe('useCitiesUrlState — writes', () => {
  it('setQ writes ?q= and clears when empty', () => {
    const { result, getLocation } = renderWithLocation('/cities');
    act(() => result.current.setQ('berlin'));
    expect(getLocation().search).toContain('q=berlin');
    act(() => result.current.setQ(''));
    expect(getLocation().search).not.toContain('q=');
  });

  it('toggleContinent adds then removes', () => {
    const { result, getLocation } = renderWithLocation('/cities');
    act(() => result.current.toggleContinent('EU'));
    expect(getLocation().search).toContain('continent=eu');
    act(() => result.current.toggleContinent('as'));
    expect(getLocation().search).toMatch(/continent=as%2Ceu|continent=as,eu/);
    act(() => result.current.toggleContinent('eu'));
    expect(getLocation().search).toContain('continent=as');
    act(() => result.current.toggleContinent('as'));
    expect(getLocation().search).not.toContain('continent=');
  });

  it('toggleTier behaves like continents', () => {
    const { result, getLocation } = renderWithLocation('/cities');
    act(() => result.current.toggleTier('very-high'));
    expect(getLocation().search).toContain('equality=very-high');
    act(() => result.current.toggleTier('very-high'));
    expect(getLocation().search).not.toContain('equality=');
  });

  it('setSort omits param when default, sets when not', () => {
    const { result, getLocation } = renderWithLocation('/cities');
    act(() => result.current.setSort('equality'));
    expect(getLocation().search).toContain('sort=equality');
    act(() => result.current.setSort('population'));
    expect(getLocation().search).not.toContain('sort=');
  });

  it('setView omits param when default (list), sets when map', () => {
    const { result, getLocation } = renderWithLocation('/cities');
    act(() => result.current.setView('map'));
    expect(getLocation().search).toContain('view=map');
    act(() => result.current.setView('list'));
    expect(getLocation().search).not.toContain('view=');
  });

  it('setCity round-trips slug', () => {
    const { result, getLocation } = renderWithLocation('/cities');
    act(() => result.current.setCity('berlin'));
    expect(getLocation().search).toContain('city=berlin');
    act(() => result.current.setCity(''));
    expect(getLocation().search).not.toContain('city=');
  });

  it('reset clears filters but preserves view', () => {
    const { result, getLocation } = renderWithLocation(
      '/cities?q=ber&continent=eu&equality=high&sort=name&view=map&city=berlin',
    );
    act(() => result.current.reset());
    const s = getLocation().search;
    expect(s).not.toContain('q=');
    expect(s).not.toContain('continent=');
    expect(s).not.toContain('equality=');
    expect(s).not.toContain('sort=');
    expect(s).not.toContain('city=');
    expect(s).toContain('view=map');
  });
});
