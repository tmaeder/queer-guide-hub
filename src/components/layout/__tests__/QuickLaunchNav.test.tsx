/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultOrVars?: string | Record<string, unknown>) =>
      typeof defaultOrVars === 'string' ? defaultOrVars : key,
  }),
}));

import { QuickLaunchNav } from '../QuickLaunchNav';
import { DESTINATIONS, NAV_CLUSTERS } from '@/config/navigation';

describe('QuickLaunchNav', () => {
  it('renders every destination as a crawlable link grouped by cluster', () => {
    render(
      <MemoryRouter>
        <QuickLaunchNav />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(DESTINATIONS.length);
    for (const d of DESTINATIONS) {
      const link = links.find((l) => l.getAttribute('href') === d.to);
      expect(link, `link for ${d.to}`).toBeTruthy();
    }
    // Cluster labels are present as scanning aids.
    for (const c of NAV_CLUSTERS) {
      expect(screen.getByText(c.labelKey)).toBeTruthy();
    }
  });
});
