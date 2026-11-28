import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

import { useMeta, canonicalPathFor } from '../useMeta';

const w = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe('useMeta', () => {
  it('should set document title', () => {
    renderHook(() => useMeta({ title: 'Test Page' }), { wrapper: w });
    expect(document.title).toBe('Test Page | Queer Guide');
  });

  it('does not double the site suffix when the title already carries it', () => {
    // routeMeta-convention titles arrive with the suffix so client + edge
    // stay byte-identical.
    renderHook(() => useMeta({ title: 'Plan Trips | Queer Guide' }), { wrapper: w });
    expect(document.title).toBe('Plan Trips | Queer Guide');
  });

  it('keeps a single append when the brand merely appears inside the title', () => {
    renderHook(() => useMeta({ title: 'About Queer Guide' }), { wrapper: w });
    expect(document.title).toBe('About Queer Guide | Queer Guide');
  });

  it('canonicalises a locale-prefixed path to the English URL', () => {
    renderHook(() => useMeta({ title: 'Berlin' }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={['/de/city/berlin']}>{children}</MemoryRouter>
      ),
    });
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://queer.guide/city/berlin',
    );
  });
});

describe('canonicalPathFor', () => {
  it.each([
    ['/de', '/'],
    ['/fr/venues/x', '/venues/x'],
    ['/venues/x', '/venues/x'],
    // two-letter routes that are not locales must survive
    ['/me/settings', '/me/settings'],
    ['/', '/'],
  ])('%s -> %s', (input, want) => {
    expect(canonicalPathFor(input)).toBe(want);
  });
});

describe('useMeta edge JSON-LD', () => {
  const edge = (path: string, obj: Record<string, unknown>) => {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.dataset.qgEdge = path;
    s.textContent = JSON.stringify(obj);
    document.head.appendChild(s);
  };
  const products = () =>
    Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((s) => JSON.parse(s.textContent || '{}'))
      .filter((o) => o['@type'] === 'Product');
  const appProduct = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'App',
    sku: 'a',
  };

  afterEach(() => {
    document.head.querySelectorAll('script[type="application/ld+json"]').forEach((s) => s.remove());
    window.history.replaceState({}, '', '/');
  });

  it('skips its own Product block when the edge rendered one for this URL', () => {
    window.history.replaceState({}, '', '/marketplace/mug');
    edge('/marketplace/mug', { '@type': 'Product', name: 'Edge', sku: 'e' });
    renderHook(() => useMeta({ title: 'Mug', jsonLd: appProduct }), { wrapper: w });
    expect(products()).toEqual([{ '@type': 'Product', name: 'Edge', sku: 'e' }]);
  });

  it('replaces a stale edge block after client-side navigation', () => {
    window.history.replaceState({}, '', '/marketplace/other');
    edge('/marketplace/mug', { '@type': 'Product', name: 'Edge', sku: 'e' });
    renderHook(() => useMeta({ title: 'Other', jsonLd: appProduct }), { wrapper: w });
    expect(products()).toEqual([appProduct]);
  });

  it('drops a stale edge block on a page with no JSON-LD of its own', () => {
    window.history.replaceState({}, '', '/about');
    edge('/marketplace/mug', { '@type': 'Product', name: 'Edge' });
    renderHook(() => useMeta({ title: 'About' }), { wrapper: w });
    expect(products()).toEqual([]);
  });

  it('only defers to the edge for allowlisted types', () => {
    window.history.replaceState({}, '', '/personalities/x');
    edge('/personalities/x', { '@type': 'Person', name: 'Edge' });
    renderHook(() => useMeta({ title: 'X', jsonLd: { '@type': 'Person', name: 'App' } }), {
      wrapper: w,
    });
    expect(document.querySelectorAll('script[data-meta-jsonld]')).toHaveLength(1);
  });

  it.each([
    ['Event', '/events/x'],
    ['Event', '/history/x'],
    ['NewsArticle', '/news/x'],
    ['Article', '/guides/x'],
    ['PodcastSeries', '/podcasts/x'],
    ['DefinedTerm', '/tags/x'],
  ])('defers to the edge %s block on %s', (type, path) => {
    window.history.replaceState({}, '', path);
    edge(path, { '@type': type, name: 'Edge' });
    renderHook(() => useMeta({ title: 'X', jsonLd: { '@type': type, name: 'App' } }), {
      wrapper: w,
    });
    expect(document.querySelectorAll('script[data-meta-jsonld]')).toHaveLength(0);
  });

  it('keeps its NewsArticle block where the edge rendered none (/news/story/*)', () => {
    window.history.replaceState({}, '', '/news/story/x');
    renderHook(() => useMeta({ title: 'X', jsonLd: { '@type': 'NewsArticle', headline: 'App' } }), {
      wrapper: w,
    });
    expect(document.querySelectorAll('script[data-meta-jsonld]')).toHaveLength(1);
  });
});
