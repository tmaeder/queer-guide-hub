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
import { PRIMARY_NAV, NAV_CLUSTERS } from '@/config/navigation';

describe('QuickLaunchNav', () => {
  it('renders the primary destinations as crawlable links', () => {
    render(
      <MemoryRouter>
        <QuickLaunchNav />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(PRIMARY_NAV.length);
    for (const d of PRIMARY_NAV) {
      const link = links.find((l) => l.getAttribute('href') === d.to);
      expect(link, `link for ${d.to}`).toBeTruthy();
    }
  });

  it('does not render cluster labels in the header row (those live in the hub)', () => {
    render(
      <MemoryRouter>
        <QuickLaunchNav />
      </MemoryRouter>,
    );
    for (const c of NAV_CLUSTERS) {
      expect(screen.queryByText(c.labelKey)).toBeNull();
    }
  });
});
