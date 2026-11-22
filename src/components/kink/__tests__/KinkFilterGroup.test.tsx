import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { KinkFilterTerm } from '@/hooks/useKinkFilterTerms';

const ageState = { affirmed: false };
vi.mock('@/hooks/useAgeAffirmation', () => ({
  useAgeAffirmation: () => ({
    affirmed: ageState.affirmed,
    checking: false,
    affirm: vi.fn(),
    revoke: vi.fn(),
  }),
}));

const term = (over: Partial<KinkFilterTerm>): KinkFilterTerm => ({
  slug: 'x',
  name: 'X',
  label: 'X',
  short_description: null,
  term_group: 'kink',
  sort: 10,
  applies_to: ['events', 'venues'],
  public_without_18: false,
  event_count: 3,
  venue_count: 5,
  ...over,
});

const TERMS: KinkFilterTerm[] = [
  term({ slug: 'sauna', label: 'Sauna', term_group: 'feature', public_without_18: true }),
  term({ slug: 'sex-swing', label: 'Sling', term_group: 'feature' }),
  term({ slug: 'fisting', label: 'Fisting', venue_count: 0 }),
  term({
    slug: 'steam-room',
    label: 'Steam room',
    term_group: 'feature',
    applies_to: ['venues'],
    public_without_18: true,
  }),
];

vi.mock('@/hooks/useKinkFilterTerms', async (orig) => {
  const real = await orig<typeof import('@/hooks/useKinkFilterTerms')>();
  return { ...real, useKinkFilterTerms: () => ({ data: TERMS }) };
});

import { KinkFilterGroup } from '../KinkFilterGroup';

describe('KinkFilterGroup', () => {
  beforeEach(() => {
    ageState.affirmed = false;
  });

  it('without 18+ shows only public terms and the unlock button', () => {
    renderWithProviders(<KinkFilterGroup target="events" selected={[]} onToggle={vi.fn()} />);
    expect(screen.getByText('Sauna')).toBeInTheDocument();
    expect(screen.queryByText('Sling')).not.toBeInTheDocument();
    expect(screen.queryByText('Fisting')).not.toBeInTheDocument();
    expect(screen.getByTestId('kink-filter-unlock')).toBeInTheDocument();
  });

  it('a selected gated term stays visible so it can be removed', () => {
    renderWithProviders(
      <KinkFilterGroup target="events" selected={['fisting']} onToggle={vi.fn()} />,
    );
    expect(screen.getByText('Fisting')).toBeInTheDocument();
  });

  it('with 18+ shows every term for the target and no unlock button', () => {
    ageState.affirmed = true;
    renderWithProviders(<KinkFilterGroup target="events" selected={[]} onToggle={vi.fn()} />);
    expect(screen.getByText('Sling')).toBeInTheDocument();
    expect(screen.getByText('Fisting')).toBeInTheDocument();
    // steam-room applies to venues only
    expect(screen.queryByText('Steam room')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kink-filter-unlock')).not.toBeInTheDocument();
  });

  it('shows the count for the target and toggles by slug', () => {
    ageState.affirmed = true;
    const onToggle = vi.fn();
    renderWithProviders(
      <KinkFilterGroup target="venues" selected={['sex-swing']} onToggle={onToggle} />,
    );
    const sling = screen.getByText('Sling').closest('button')!;
    expect(sling).toHaveAttribute('aria-pressed', 'true');
    expect(sling).toHaveTextContent('5');
    fireEvent.click(screen.getByText('Fisting'));
    expect(onToggle).toHaveBeenCalledWith('fisting');
  });
});
