/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PersonalityCard, PersonalityCardSkeleton } from '../PersonalityCard';

describe('PersonalityCard', () => {
  it('Skeleton renders', () => {
    const { container } = render(<PersonalityCardSkeleton />);
    expect(container).toBeTruthy();
  });
  it('renders loading', () => {
    const { container } = render(
      <MemoryRouter>
        <PersonalityCard loading />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
  it('renders personality', () => {
    const { container } = render(
      <MemoryRouter>
        <PersonalityCard personality={{ id: 'p1', name: 'X', slug: 'x' } as never} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });

  it('draws the profession mark in the plate when there is no portrait', () => {
    const { container } = render(
      <MemoryRouter>
        <PersonalityCard
          personality={{ id: 'p1', name: 'X', slug: 'x', profession: 'activist' } as never}
        />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-fallback="station"]')).not.toBeNull();
    expect(container.querySelector('[data-station-badge]')).toBeNull();
  });

  it('puts the profession mark on a badge over a portrait, and drops it if the portrait fails', () => {
    const { container } = render(
      <MemoryRouter>
        <PersonalityCard
          personality={
            {
              id: 'p1',
              name: 'X',
              slug: 'x',
              profession: 'drag queen',
              image_url: 'https://example.com/a.jpg',
            } as never
          }
        />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-station-badge="wig"]')).not.toBeNull();
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('[data-station-badge]')).toBeNull();
    expect(container.querySelector('[data-fallback="station"]')).not.toBeNull();
  });
});
