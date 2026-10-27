/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { GuideCard, type GuideCardSummary } from '../GuideCard';

const GUIDE: GuideCardSummary = {
  id: 'g1',
  format: 'guide',
  slug: 'saunas',
  title: 'Saunas',
  dek: null,
  hero_image_path: null,
  category: 'sauna',
  reading_time_min: 3,
  pick_count: 2,
};

describe('GuideCard', () => {
  it('draws the category mark in the plate when there is no hero image', () => {
    const { container } = render(
      <MemoryRouter>
        <GuideCard guide={GUIDE} />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-fallback="station"]')).not.toBeNull();
    expect(container.querySelector('[data-station-badge]')).toBeNull();
  });

  it('puts the category mark on a badge over a hero image, and drops it if the image fails', () => {
    const { container } = render(
      <MemoryRouter>
        <GuideCard guide={{ ...GUIDE, hero_image_path: 'https://example.com/a.jpg' }} />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-station-badge="waves"]')).not.toBeNull();
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('[data-station-badge]')).toBeNull();
    expect(container.querySelector('[data-fallback="station"]')).not.toBeNull();
  });
});
