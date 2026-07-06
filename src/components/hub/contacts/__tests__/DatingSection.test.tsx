/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({
  profile: { data: null as { id: string } | null, isLoading: false },
  matches: { data: [] as { viewer_id: string; other_id: string; matched_at: string }[] },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string; count?: number }) =>
      (o?.defaultValue ?? _k).replace('{{count}}', String(o?.count ?? '')),
  }),
}));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock('@/hooks/useIntimateProfile', () => ({ useMyIntimateProfile: () => h.profile }));
vi.mock('@/hooks/useIntimateMatches', () => ({ useIntimateMatches: () => h.matches }));

import { DatingSection } from '../DatingSection';

describe('DatingSection', () => {
  it('renders nothing for users who have not opted into dating', () => {
    h.profile = { data: null, isLoading: false };
    const { container } = render(<DatingSection />);
    expect(container.textContent).toBe('');
  });

  it('shows the live match count and deep-links deck + matches when opted in', () => {
    h.profile = { data: { id: 'me' }, isLoading: false };
    h.matches = {
      data: [
        { viewer_id: 'me', other_id: 'a', matched_at: '2026-07-01' },
        { viewer_id: 'me', other_id: 'b', matched_at: '2026-07-02' },
      ],
    };
    render(<DatingSection />);
    expect(screen.getAllByText('2 matches').length).toBeGreaterThanOrEqual(1);
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/people/dating');
    expect(hrefs).toContain('/hub/messages?filter=matches');
  });
});
