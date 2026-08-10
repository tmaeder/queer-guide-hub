import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AmenityDisplay } from '../AmenityDisplay';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useAmenityVocabulary', () => ({
  useAmenityVocabulary: () => ({ vocab: null }),
}));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));

/**
 * Regression guard for a real harm case.
 *
 * `public.amenities` keeps negative access assertions as FIRST-CLASS values —
 * `not-step-free`, `no-accessible-restroom` — specifically so they are never
 * collapsed into a positive claim. The render collapsed them anyway: every
 * slug went through one row component, so "Not step-free" sat in a grid of
 * amenities looking exactly like a feature that IS present.
 */
describe('AmenityDisplay — negative access assertions', () => {
  it('marks a negative assertion differently from a positive one', () => {
    const { container } = render(
      <AmenityDisplay
        amenities={[]}
        accessibility={['step-free', 'not-step-free', 'no-accessible-restroom']}
        accessibilityNotes={null}
      />,
    );
    const dots = [...container.querySelectorAll('[aria-hidden].rounded-full')].map(
      (e) => e.className,
    );
    expect(dots).toHaveLength(3);
    expect(dots[0]).toContain('bg-track-green'); // step-free -> yes
    expect(dots[1]).toContain('bg-track-pink'); // not-step-free -> no
    expect(dots[2]).toContain('bg-track-pink'); // no-accessible-restroom -> no
  });

  it('still spells every assertion out in text, not colour alone', () => {
    render(
      <AmenityDisplay
        amenities={[]}
        accessibility={['not-wheelchair-accessible']}
        accessibilityNotes={null}
      />,
    );
    // The label must be present and readable regardless of the dot: a user who
    // cannot perceive the colour still has to get the negative.
    expect(screen.getByText(/not wheelchair accessible/i)).toBeInTheDocument();
  });
});
