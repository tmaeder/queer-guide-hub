/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/components/donate/DonationForm', () => ({ DonationForm: () => <div data-testid="form" /> }));
vi.mock('@/components/donate/DonorWall', () => ({ DonorWall: () => <div data-testid="wall" /> }));
vi.mock('@/components/donate/DonationSuccess', () => ({ DonationSuccess: () => <div data-testid="success" /> }));
vi.mock('@/components/effects/ColourfulText', () => ({ ColourfulText: (p: { text: string }) => <>{p.text}</> }));
vi.mock('@/components/effects/Sparkles', () => ({ Sparkles: () => null }));

import Donate from '../Donate';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/donate" element={<Donate />} /></Routes>
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
});
