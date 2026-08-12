// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MilestoneHero, MilestoneSidebar } from '../MilestoneDetail.parts';
import type { Milestone } from '@/types/milestone';

vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/tags/TagChip', () => ({
  TagChip: ({ tag }: { tag: string }) => <span>{tag}</span>,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Mirror i18next interpolation so `partOf` renders its {{era}} slot.
    t: (key: string, def?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const fallback = typeof def === 'string' ? def : key;
      const values = (typeof def === 'string' ? vars : def) ?? {};
      return fallback.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(values[k] ?? ''));
    },
    i18n: { language: 'en' },
  }),
}));

const milestone = (over: Partial<Milestone> = {}): Milestone =>
  ({
    id: 'm1',
    slug: 'stonewall',
    title: 'Stonewall uprising',
    description: 'Six days of protest.',
    date: '1969-06-28',
    date_precision: 'day',
    date_end: null,
    date_end_precision: null,
    significance: 5,
    impact: 'positive',
    category: 'uprising-movement',
    country_name: 'United States',
    country: null,
    city: null,
    city_name: 'New York',
    location: 'Stonewall Inn',
    image_url: null,
    image_metadata: null,
    tags: ['protest'],
    sources: [],
    links: [],
    prev: null,
    next: null,
    country_id: null,
    ...over,
  }) as never;

describe('MilestoneHero', () => {
  it('renders exactly one h1, carrying the title', () => {
    render(<MilestoneHero milestone={milestone()} />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Stonewall uprising');
  });

  it('carries the milestone route bullet', () => {
    render(<MilestoneHero milestone={milestone()} />);
    expect(screen.getByRole('img', { name: 'Milestone' })).toHaveTextContent('M');
  });

  /**
   * `milestones.partOf` shipped in all 12 locales but had no caller after
   * #2678 swapped the era chip for a bare link — which left
   * e2e/history-timeline.spec.ts red against a "Part of:" link that no longer
   * existed. This is the unit-level mirror so it cannot rot silently again.
   */
  it('links to the era as "Part of: …"', () => {
    render(<MilestoneHero milestone={milestone()} />);
    const link = screen.getByRole('link', { name: /part of:/i });
    expect(link).toHaveAttribute('href', '/history#era-liberation');
  });

  /**
   * The date moved from a second text-display slab into the masthead status
   * chip, and the sidebar's Date row was dropped to match ("a headline fact
   * lives once"). Rendering both together is the only way to catch a
   * regression that re-adds either copy.
   */
  it('shows the date once across hero and sidebar', () => {
    render(
      <>
        <MilestoneHero milestone={milestone()} />
        <MilestoneSidebar milestone={milestone()} />
      </>,
    );
    expect(screen.getAllByText(/28 June 1969|June 28, 1969/)).toHaveLength(1);
  });

  it('renders tags in the hero, at spine position S4', () => {
    render(<MilestoneHero milestone={milestone()} />);
    expect(screen.getByText('protest')).toBeInTheDocument();
  });

  it('does not nest a header inside a header', () => {
    const { container } = render(<MilestoneHero milestone={milestone()} />);
    expect(container.querySelectorAll('header header')).toHaveLength(0);
  });
});

describe('impact never borrows a track colour', () => {
  /**
   * Decision 3, executable: track colours are wayfinding and may never encode a
   * state, and impact is a state.
   *
   * Asserted as INVARIANCE rather than absence. The page legitimately paints
   * `bg-track-pink` — that is the milestone route bullet, which marks the
   * entity TYPE — so "no track class anywhere" is the wrong test and fails on
   * correct code. What must hold is that varying `impact` does not vary the
   * colour: same track classes for positive, neutral and negative.
   */
  const trackClasses = (impact: Milestone['impact']) => {
    const { container } = render(<MilestoneHero milestone={milestone({ impact })} />);
    return [...container.innerHTML.matchAll(/(?:bg|text|border)-track-\w+/g)]
      .map((m) => m[0])
      .sort();
  };

  it('paints the same track classes whatever the impact', () => {
    const positive = trackClasses('positive');
    expect(trackClasses('neutral')).toEqual(positive);
    expect(trackClasses('negative')).toEqual(positive);
  });

  it('keeps the destructive glyph — not a track colour — for a negative milestone', () => {
    const { container } = render(<MilestoneHero milestone={milestone({ impact: 'negative' })} />);
    const marker = container.querySelector('.text-destructive');
    expect(marker).toBeTruthy();
    expect(marker?.innerHTML).not.toMatch(/track-/);
  });
});

describe('Anton is never faux-bolded', () => {
  /**
   * --font-display is Anton, a single-weight 400 face; a weight class on it
   * makes the browser synthesise bold and smear the stems. 15 sites in this
   * tree carried one before the rebrand sweep.
   */
  it.each([
    ['hero', <MilestoneHero key="h" milestone={milestone()} />],
    ['sidebar', <MilestoneSidebar key="s" milestone={milestone()} />],
  ])('holds for the %s', (_name, node) => {
    const { container } = render(node);
    for (const el of container.querySelectorAll('[class*="font-display"]')) {
      expect(el.className).not.toMatch(/font-(semibold|bold|extrabold|black)\b/);
    }
  });
});

describe('restrained framing', () => {
  const withImage = { image_url: 'https://img.example/x.jpg' };

  it('keeps persecution imagery documentary-sized', () => {
    const { container } = render(
      <MilestoneHero
        milestone={milestone({
          ...withImage,
          category: 'persecution-destruction',
          impact: 'negative',
        })}
      />,
    );
    const figure = container.querySelector('figure');
    expect(figure?.className).toContain('max-w-sm');
    expect(container.querySelector('img')?.className).toContain('max-h-64');
    expect(container.querySelector('img')?.className).not.toContain('aspect-[16/10]');
  });

  it('gives a celebratory milestone the full-width frame', () => {
    const { container } = render(<MilestoneHero milestone={milestone(withImage)} />);
    expect(container.querySelector('figure')?.className).not.toContain('max-w-sm');
    expect(container.querySelector('img')?.className).toContain('aspect-[16/10]');
  });
});

describe('MilestoneSidebar', () => {
  it('drops the Date row but keeps place facts', () => {
    render(<MilestoneSidebar milestone={milestone()} />);
    expect(screen.queryByText('Date')).not.toBeInTheDocument();
    expect(screen.getByText('Place')).toBeInTheDocument();
    expect(screen.getByText('Stonewall Inn')).toBeInTheDocument();
  });

  it('renders nothing at all when there is no place data', () => {
    const { container } = render(
      <MilestoneSidebar
        milestone={milestone({ location: null, city_name: null, country_name: null })}
      />,
    );
    expect(container.querySelector('section')).toBeFalsy();
  });
});
