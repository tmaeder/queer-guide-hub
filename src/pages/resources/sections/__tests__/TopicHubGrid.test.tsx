/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Heart } from 'lucide-react';

vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock('@/pages/resources/topics.config', () => ({
  TOPIC_HUBS: [
    { slug: 'health', title: 'Health', description: 'd', icon: Heart, tagCluster: ['a', 'b'], adult: false },
    { slug: 'kink', title: 'Kink', description: 'd', icon: Heart, tagCluster: ['x'], adult: true },
  ],
}));
vi.mock('@/providers/SafeModeProvider', () => ({
  useSafeMode: () => ({ enabled: false }),
}));
vi.mock('@/hooks/useTopicHubs', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useTopicHubs')>('@/hooks/useTopicHubs');
  return {
    ...actual,
    useTopicHubs: () => ({ data: [], isLoading: false }),
  };
});

import { TopicHubGrid } from '../TopicHubGrid';

describe('TopicHubGrid', () => {
  it('renders all topic cards when safe mode disabled', () => {
    render(<TopicHubGrid />);
    expect(screen.getByText('Health')).toBeInTheDocument();
    expect(screen.getByText('Kink')).toBeInTheDocument();
  });

  it('links each card to its topic route', () => {
    render(<TopicHubGrid />);
    expect(screen.getByRole('link', { name: /Health/ })).toHaveAttribute('href', '/resources/topic/health');
  });
});
