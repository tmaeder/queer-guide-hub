// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { EntityDetailScroll } from '../EntityDetailScroll';
import type { EntityDescriptor } from '../entityDescriptor';

vi.mock('@/contexts/BreadcrumbContext', () => ({ useBreadcrumbs: vi.fn() }));
vi.mock('@/components/discovery/SimilarItems', () => ({ SimilarItems: () => <div /> }));
vi.mock('@/components/tags/MoreLikeThisByTag', () => ({ MoreLikeThisByTag: () => <div /> }));
vi.mock('@/components/entity/EntityPersonalizationBand', () => ({
  EntityPersonalizationBand: () => <div />,
}));
vi.mock('motion/react', () => ({
  motion: { div: (p: Record<string, unknown>) => <div {...p} /> },
  useScroll: () => ({ scrollYProgress: 0 }),
  useSpring: () => 0,
}));

const descriptor = (over: Partial<EntityDescriptor> = {}): EntityDescriptor =>
  ({
    source: 'milestone',
    id: 'm1',
    slug: 'stonewall',
    title: 'Stonewall uprising',
    hero: <h1>Stonewall uprising</h1>,
    sections: [
      { id: 'story', when: true, render: () => <p>Story body</p> },
      { id: 'hidden', when: false, render: () => <p>Should not render</p> },
    ],
    sidebar: <aside>Facts</aside>,
    related: null,
    mobileBar: null,
    overlays: null,
    breadcrumbs: [],
    meta: {} as never,
    personalization: null,
    trackView: null,
    ...over,
  }) as EntityDescriptor;

const draw = (props: Parameters<typeof EntityDetailScroll>[0]) =>
  render(
    <MemoryRouter>
      <EntityDetailScroll {...props} />
    </MemoryRouter>,
  );

/**
 * This shell hand-rolled `container mx-auto px-4 py-8` for its whole life. The
 * 2026-08-10 page-layout sweep fixed the sibling EntityDetailLayout and missed
 * this one, leaving milestone, venue and organization detail capped by
 * Tailwind's bare `.container` with a flat 16px gutter while the header
 * breathed to 32px — and there was no test here to notice, because this file
 * did not exist.
 *
 * `max-w-page` present + no bare `container` is the whole guard.
 */
describe('EntityDetailScroll — page frame', () => {
  it.each([
    ['loaded', { descriptor: descriptor(), loading: false, error: null }, 'entity-detail-layout'],
    ['loading', { descriptor: null, loading: true, error: null }, 'entity-detail-loading'],
    [
      'error',
      { descriptor: null, loading: false, error: new Error('boom') },
      'entity-detail-error',
    ],
  ])('frames the %s state with PageContainer', (_name, props, testId) => {
    draw(props as Parameters<typeof EntityDetailScroll>[0]);
    const frame = screen.getByTestId(testId);
    expect(frame.className).toContain('max-w-page');
    // `\bcontainer\b` would also match `max-w-page`'s siblings if someone
    // reintroduced the utility — match the standalone class only.
    expect(frame.className.split(/\s+/)).not.toContain('container');
  });

  it('applies the shared gutter ladder rather than a flat px-4', () => {
    draw({ descriptor: descriptor(), loading: false, error: null });
    const cls = screen.getByTestId('entity-detail-layout').className;
    expect(cls).toContain('px-4');
    expect(cls).toContain('sm:px-6');
    expect(cls).toContain('md:px-8');
  });
});

describe('EntityDetailScroll — descriptor contract', () => {
  it('renders the hero and only the sections whose `when` is not false', () => {
    draw({ descriptor: descriptor(), loading: false, error: null });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Stonewall uprising');
    expect(screen.getByText('Story body')).toBeInTheDocument();
    expect(screen.queryByText('Should not render')).not.toBeInTheDocument();
  });

  // The milestone adapter is the only caller that passes a null sidebar, so
  // this branch had no coverage at all.
  it('collapses the two-column grid when there is no sidebar', () => {
    const { container } = draw({
      descriptor: descriptor({ sidebar: null }),
      loading: false,
      error: null,
    });
    expect(container.querySelector('.md\\:grid-cols-\\[2fr_1fr\\]')).toBeFalsy();
  });

  it('keeps the two-column grid when a sidebar is present', () => {
    const { container } = draw({ descriptor: descriptor(), loading: false, error: null });
    expect(container.querySelector('.md\\:grid-cols-\\[2fr_1fr\\]')).toBeTruthy();
  });

  it('surfaces the error message instead of the body', () => {
    draw({ descriptor: null, loading: false, error: new Error('boom') });
    expect(screen.getByText('boom')).toBeInTheDocument();
  });
});
