/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/components/donate/DonationForm', () => ({
  DonationForm: () => <div data-testid="form" />,
}));
vi.mock('@/components/donate/DonorWall', () => ({ DonorWall: () => <div data-testid="wall" /> }));
vi.mock('@/components/donate/DonationSuccess', () => ({
  DonationSuccess: () => <div data-testid="success" />,
}));
vi.mock('@/components/effects/ColourfulText', () => ({
  ColourfulText: (p: { text: string }) => <>{p.text}</>,
}));
vi.mock('@/components/effects/Sparkles', () => ({ Sparkles: () => null }));

import Donate from '../Donate';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/donate" element={<Donate />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Donate page', () => {
  it('renders donation form + donor wall by default', () => {
    renderAt('/donate');
    expect(screen.getByTestId('form')).toBeInTheDocument();
    expect(screen.getByTestId('wall')).toBeInTheDocument();
    expect(screen.queryByTestId('success')).toBeNull();
  });

  it('shows success panel when status=success', () => {
    renderAt('/donate?status=success');
    expect(screen.getByTestId('success')).toBeInTheDocument();
    expect(screen.queryByTestId('form')).toBeNull();
  });

  // This page asks strangers for money, so a claim about what the money buys
  // has to be one the codebase can evidence. Two here could not.
  //
  // "We pay moderators and community ambassadors to vet every venue" was
  // false three times over — measured on prod 2026-09-05: one moderator,
  // zero ambassadors (the programme exists nowhere in the product), and zero
  // venue reviews against 26,905 venues.
  //
  // "100% to platform costs and community programs" named programmes that do
  // not exist and asserted an allocation this repo cannot evidence. An
  // unverifiable promise about someone else's money is the one kind of copy
  // that should fail closed, which is why the replacement claims less rather
  // than claiming a different number.
  it('makes no funding claim the codebase cannot evidence', () => {
    const { container } = renderAt('/donate');
    const text = container.textContent ?? '';
    // Positive control: an empty render must not pass this by default.
    expect(text).toMatch(/donat/i);
    for (const claim of [/ambassador/i, /vet every venue/i, /100%/, /community programs/i]) {
      expect(text).not.toMatch(claim);
    }
  });
});
