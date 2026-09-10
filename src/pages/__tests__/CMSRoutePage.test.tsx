/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const { useCMSPageMock } = vi.hoisted(() => ({ useCMSPageMock: vi.fn() }));
vi.mock('@/hooks/useCMSPage', () => ({ useCMSPage: useCMSPageMock }));

import CMSRoutePage from '../CMSRoutePage';

function robotsContent() {
  return document.querySelector('meta[name="robots"]')?.getAttribute('content');
}

describe('CMSRoutePage', () => {
  it('renders without crashing', () => {
    useCMSPageMock.mockReturnValue({ data: null, isLoading: false });
    const { container } = render(<MemoryRouter><CMSRoutePage slug="about" /></MemoryRouter>);
    expect(container).toBeTruthy();
  });

  it('noindexes a missing route instead of publishing an empty-titled indexable page', () => {
    // `useMeta` used to be called with `page?.meta_title || page?.title || ''`
    // and a fixed `canonicalPath: '/${slug}'` regardless of whether the slug
    // resolved — an unknown fixed route shipped the default title with a
    // live self-referential canonical and no robots tag.
    useCMSPageMock.mockReturnValue({ data: { page: null, notFound: true }, isLoading: false });
    render(<MemoryRouter><CMSRoutePage slug="not-a-real-route" /></MemoryRouter>);
    expect(screen.getByText(/Page Not Found/i)).toBeInTheDocument();
    expect(robotsContent()).toBe('noindex,nofollow');
  });
});
