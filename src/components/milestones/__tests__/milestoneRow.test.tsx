// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MilestoneRow } from '../MilestoneRow';
import { MilestoneImpactMarker } from '../MilestoneImpactMarker';
import { StationRing } from '@/components/transit/StationRing';
import type { Milestone, MilestoneRef } from '@/types/milestone';

vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k, i18n: { language: 'en' } }),
}));

/** The impact marker is the only rounded-full box in a row. */
const MARKER_INLINE = '.h-3.w-3.rounded-full';
const MARKER_STATION = '.h-4.w-4.rounded-full';
/** MilestoneCategoryBadge's own signature — its label is an i18n key, so text
 *  queries are unreliable. */
const BADGE = '.uppercase.tracking-label';

const row = (over: Partial<MilestoneRef & Milestone> = {}) =>
  ({
    id: 'm1',
    slug: 'stonewall',
    title: 'Stonewall uprising',
    date: '1969-06-28',
    date_precision: 'day',
    significance: 5,
    impact: 'positive',
    category: 'uprising-movement',
    country_name: 'United States',
    description: 'Six days of protest.',
    ...over,
  }) as never;

describe('MilestoneRow', () => {
  it('links to the milestone detail page', () => {
    render(<MilestoneRow milestone={row()} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/history/stonewall');
  });

  /**
   * The unlayered `li a:not(.no-underline)` rule in index.css sets
   * display:inline, which collapses this flex row the moment EraTrack puts it
   * in an <li>. jsdom does not apply that stylesheet, so this asserts the
   * OPT-OUT CLASS is present rather than the computed style — the class is the
   * only thing a unit test can see. The computed `display: flex` is asserted in
   * e2e/history-timeline.spec.ts.
   */
  it('carries no-underline so the spine row survives being inside an <li>', () => {
    render(<MilestoneRow milestone={row()} />);
    expect(screen.getByRole('link').className).toContain('no-underline');
  });

  describe('density', () => {
    it('derives card from significance 5', () => {
      render(<MilestoneRow milestone={row({ significance: 5 })} />);
      expect(screen.getByText('Six days of protest.')).toBeInTheDocument();
    });

    it('derives row from significance 3 — no description, no badge', () => {
      render(<MilestoneRow milestone={row({ significance: 3 })} />);
      expect(screen.queryByText('Six days of protest.')).not.toBeInTheDocument();
    });

    it('derives compact from significance 1', () => {
      const { container } = render(<MilestoneRow milestone={row({ significance: 1 })} />);
      expect(container.querySelector('.truncate')).toBeTruthy();
      expect(screen.queryByText('Six days of protest.')).not.toBeInTheDocument();
    });

    it('lets an explicit density override the significance', () => {
      render(<MilestoneRow milestone={row({ significance: 5 })} density="compact" />);
      expect(screen.queryByText('Six days of protest.')).not.toBeInTheDocument();
    });

    // Four `compact` call sites are ~340px panels rendering 6-8 rows. Any
    // per-row chrome added there multiplies; keep it a bare line.
    // Matched by the badge's own class signature, not by its text — the label
    // comes from an i18n key and the test title happens to contain the word
    // "uprising", so a text query passes for the wrong reason.
    it('keeps compact free of the category badge', () => {
      const { container } = render(<MilestoneRow milestone={row()} density="compact" />);
      expect(container.querySelector(BADGE)).toBeFalsy();
    });

    it('does render the category badge at card density', () => {
      const { container } = render(<MilestoneRow milestone={row()} density="card" />);
      expect(container.querySelector(BADGE)).toBeTruthy();
    });
  });

  /**
   * Rank 4 (`--text-title`) is Space Grotesk 700 — the docs' rank table, and
   * the 111-site majority. The transit components render this rank in Anton
   * (41 files), and following that minority is how history drifted the first
   * time. Pinned here because the token name alone does not say which face,
   * so nothing else would catch a revert.
   */
  it.each(['card', 'row'] as const)('renders the %s title in Space Grotesk, not Anton', (d) => {
    const { container } = render(<MilestoneRow milestone={row()} density={d} />);
    const title = [...container.querySelectorAll('span')].find((el) =>
      el.className.includes('text-title'),
    );
    expect(title).toBeTruthy();
    expect(title?.className).not.toContain('font-display');
    expect(title?.className).toContain('font-bold');
  });

  describe('marker', () => {
    // Scoped to `.rounded-full`: the category badge's lucide icon is also
    // h-3 w-3, so a bare size selector matches it and reports a marker that
    // is not there.
    it('renders an inline marker by default', () => {
      const { container } = render(<MilestoneRow milestone={row()} />);
      expect(container.querySelector(MARKER_INLINE)).toBeTruthy();
    });

    it('renders nothing for marker="none"', () => {
      const { container } = render(<MilestoneRow milestone={row()} marker="none" />);
      expect(container.querySelector(`${MARKER_INLINE}, ${MARKER_STATION}`)).toBeFalsy();
    });

    it("centres the station marker in the 16px column EraTrack's rail shares", () => {
      const { container } = render(<MilestoneRow milestone={row()} marker="station" />);
      const col = container.querySelector('.w-4.justify-center');
      expect(col).toBeTruthy();
      expect(col?.querySelector('.h-4.w-4')).toBeTruthy();
    });
  });
});

describe('MilestoneImpactMarker', () => {
  /**
   * The two components are deliberately NOT merged (StationRing takes a
   * `track`; impact is a state and may never be colour-coded). What keeps them
   * usable on the same rail is that their boxes match exactly — pin it.
   */
  it('matches StationRing\'s box model at size="station"', () => {
    const { container: marker } = render(<MilestoneImpactMarker impact="neutral" size="station" />);
    const { container: ring } = render(<StationRing state="open" />);
    // GEOMETRY only. The two draw the same box but deliberately name their
    // ink differently: StationRing takes `--track-ring` because it gates a
    // track-coloured fill, while the impact marker takes `--foreground`
    // because it may never carry one. Same ink, different rule — asserting the
    // colour class here would force one of them to break its own invariant.
    const box = (el: Element | null) =>
      ['h-4', 'w-4', 'rounded-full', 'border-[3px]'].filter((c) => el?.className.includes(c));
    expect(box(marker.firstElementChild)).toHaveLength(4);
    expect(box(ring.firstElementChild)).toHaveLength(4);
    // Both edges are ink, via their respective tokens.
    expect(marker.firstElementChild?.className).toContain('border-foreground');
    expect(ring.firstElementChild?.className).toContain('border-track-ring');
  });

  it.each(['positive', 'neutral', 'negative'] as const)(
    'never paints %s with a track colour',
    (impact) => {
      const { container } = render(<MilestoneImpactMarker impact={impact} />);
      expect(container.innerHTML).not.toMatch(/track-(pink|blue|green|yellow)/);
    },
  );

  it('keeps the destructive glyph for negative', () => {
    const { container } = render(<MilestoneImpactMarker impact="negative" />);
    expect(container.firstElementChild?.className).toContain('text-destructive');
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('fills ink for positive and leaves neutral open', () => {
    const { container: pos } = render(<MilestoneImpactMarker impact="positive" />);
    const { container: neu } = render(<MilestoneImpactMarker impact="neutral" />);
    expect(pos.firstElementChild?.className).toContain('bg-foreground');
    expect(neu.firstElementChild?.className).toContain('bg-background');
  });
});
