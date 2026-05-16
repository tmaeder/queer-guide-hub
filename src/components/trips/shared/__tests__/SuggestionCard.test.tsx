/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SuggestionCard } from '../SuggestionCard';

const base = {
  title: 'Eiffel Tower',
  provider: 'GetYourGuide',
  ctaLabel: 'Book now',
  onCtaClick: vi.fn(),
};

describe('SuggestionCard', () => {
  it('renders title, provider, CTA label', () => {
    render(<SuggestionCard {...base} />);
    expect(screen.getByText('Eiffel Tower')).toBeInTheDocument();
    expect(screen.getByText('GetYourGuide')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Book now/i })).toBeInTheDocument();
  });

  it('renders subtitle, description, price when provided', () => {
    render(<SuggestionCard {...base} subtitle="Paris" description="Iconic." priceLabel="€29" />);
    expect(screen.getByText('Paris')).toBeInTheDocument();
    expect(screen.getByText('Iconic.')).toBeInTheDocument();
    expect(screen.getByText('€29')).toBeInTheDocument();
  });

  it('renders image with role=img + aria-label when imageUrl set', () => {
    render(<SuggestionCard {...base} imageUrl="https://example/x.jpg" />);
    expect(screen.getByRole('img', { name: 'Eiffel Tower' })).toBeInTheDocument();
  });

  it('fires onCtaClick when CTA clicked', () => {
    const onCta = vi.fn();
    render(<SuggestionCard {...base} onCtaClick={onCta} />);
    fireEvent.click(screen.getByRole('button', { name: /Book now/i }));
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it('renders secondaryAction button and respects disabled', () => {
    const onSecondary = vi.fn();
    render(
      <SuggestionCard
        {...base}
        secondaryAction={{ label: 'Save', onClick: onSecondary, disabled: true }}
      />,
    );
    const btn = screen.getByRole('button', { name: /Save/i });
    expect(btn).toBeDisabled();
  });
});
