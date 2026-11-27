import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { LinkToUs } from '../LinkToUs';
import { BADGE_PATH, BADGE_SNIPPET, LINKABLE_PAGES } from '../linkToUsSnippets';

// Snippets are pasted into other people's pages, so a wrong path is a broken
// backlink we can never fix from our side. Every path must be a real route.
const appRoutes = JSON.parse(readFileSync('functions/_lib/appRoutes.json', 'utf8'));
const knownPaths = new Set<string>(appRoutes.paths ?? appRoutes.routes ?? []);

describe('LinkToUs', () => {
  it.each(LINKABLE_PAGES.map((p) => [p.path]))('%s is a real route', (path) => {
    expect(knownPaths.size).toBeGreaterThan(50);
    expect(knownPaths.has(path)).toBe(true);
  });

  it('ships the badge file it links to', () => {
    expect(existsSync(`public${BADGE_PATH}`)).toBe(true);
    expect(BADGE_SNIPPET).toContain(`https://queer.guide${BADGE_PATH}`);
  });

  it('renders an absolute-URL snippet for every linkable page', () => {
    renderWithProviders(<LinkToUs />);
    for (const page of LINKABLE_PAGES) {
      expect(
        screen.getByText(`<a href="https://queer.guide${page.path}">${page.text}</a>`),
      ).toBeTruthy();
    }
    expect(screen.getByText(BADGE_SNIPPET)).toBeTruthy();
  });

  it('names every copy button after its snippet, starting with the visible text', () => {
    renderWithProviders(<LinkToUs />);
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-labelledby') && b);
    const copyButtons = screen.getAllByRole('button', { name: /^Copy \S/ });
    // 4 pages + badge + listing, and no two share a name.
    expect(copyButtons).toHaveLength(LINKABLE_PAGES.length + 2);
    const accessibleNames = copyButtons.map((b) =>
      (b.getAttribute('aria-labelledby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent)
        .join(' '),
    );
    expect(new Set(accessibleNames).size).toBe(copyButtons.length);
    expect(names.filter(Boolean)).toHaveLength(copyButtons.length);
  });
});
