/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PersonalityCard, PersonalityCardSkeleton } from '../PersonalityCard';

describe('PersonalityCard', () => {
  it('Skeleton renders', () => {
    const { container } = render(<PersonalityCardSkeleton />);
    expect(container).toBeTruthy();
  });
  it('renders loading', () => {
    const { container } = render(<MemoryRouter><PersonalityCard loading /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
  it('renders personality', () => {
    const { container } = render(<MemoryRouter><PersonalityCard personality={{ id: 'p1', name: 'X', slug: 'x' } as never} /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
