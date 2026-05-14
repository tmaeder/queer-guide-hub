import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TopicHubGrid } from '../sections/TopicHubGrid';
import { TOPIC_HUBS } from '../topics.config';

vi.mock('@/providers/SafeModeProvider', () => ({
  useSafeMode: () => ({ enabled: true, toggle: vi.fn() }),
}));

vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}));

describe('TopicHubGrid', () => {
  it('renders one link per non-adult topic to /resources/topic/:slug', () => {
    const { container } = render(
      <MemoryRouter>
        <TopicHubGrid />
      </MemoryRouter>,
    );
    const nonAdult = TOPIC_HUBS.filter((t) => !t.adult);
    for (const t of nonAdult) {
      const link = container.querySelector(`a[href="/resources/topic/${t.slug}"]`);
      expect(link, `expected link for topic ${t.slug}`).not.toBeNull();
    }
  });

  it('hides adult topics when safe mode is enabled', () => {
    const { container } = render(
      <MemoryRouter>
        <TopicHubGrid />
      </MemoryRouter>,
    );
    const adult = TOPIC_HUBS.filter((t) => t.adult);
    for (const t of adult) {
      const link = container.querySelector(`a[href="/resources/topic/${t.slug}"]`);
      expect(link, `did not expect adult topic ${t.slug}`).toBeNull();
    }
  });
});
