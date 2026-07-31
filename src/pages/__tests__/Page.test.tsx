/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

const { useCMSPageMock } = vi.hoisted(() => ({ useCMSPageMock: vi.fn() }));

vi.mock('@/hooks/useCMSPage', () => ({ useCMSPage: useCMSPageMock }));
vi.mock('dompurify', () => ({
  default: { sanitize: (s: string) => s },
}));

import Page from '../Page';

function renderAt(slug: string, prefix = '') {
  return render(
    <MemoryRouter initialEntries={[`${prefix}/p/${slug}`]}>
      <Routes>
        <Route path="/p/:slug" element={<Page />} />
        <Route path="/:locale/p/:slug" element={<Page />} />
      </Routes>
    </MemoryRouter>,
  );
}

function canonicalHref() {
  return document.querySelector('link[rel="canonical"]')?.getAttribute('href');
}

function metaContent(name: string) {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content');
}

beforeEach(() => useCMSPageMock.mockReset());

describe('Page (CMS renderer)', () => {
  it('shows loading state', () => {
    useCMSPageMock.mockReturnValue({ data: undefined, isLoading: true });
    renderAt('about');
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('renders not-found message', () => {
    useCMSPageMock.mockReturnValue({ data: { page: null, notFound: true }, isLoading: false });
    renderAt('missing');
    expect(screen.getByText(/Page Not Found/i)).toBeInTheDocument();
  });

  it('renders page with title + sanitized body + tags', () => {
    useCMSPageMock.mockReturnValue({
      data: {
        page: {
          title: 'About',
          subtitle: 'sub',
          body_html: '<p>hello</p>',
          tags: ['queer', 'travel'],
          category: 'guides',
          published_at: '2026-05-15',
        },
        notFound: false,
      },
      isLoading: false,
    });
    renderAt('about');
    expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument();
    expect(screen.getByText('queer')).toBeInTheDocument();
    expect(screen.getByText('guides')).toBeInTheDocument();
  });
});

/**
 * Every cms_pages row carries authored meta_title/meta_description. This
 * renderer used to emit neither, so /p/* kept whatever <title> the previously
 * visited SPA route had set.
 */
describe('Page SEO meta', () => {
  function mockPage(page: Record<string, unknown>) {
    useCMSPageMock.mockReturnValue({ data: { page, notFound: false }, isLoading: false });
  }

  it('prefers the authored meta_title over the display title', () => {
    mockPage({ title: 'About', meta_title: 'About Queer Guide', body_html: '<p>x</p>' });
    renderAt('about');
    expect(document.title).toBe('About Queer Guide | Queer Guide');
  });

  it('falls back to the display title when meta_title is empty', () => {
    mockPage({ title: 'Contact', body_html: '<p>x</p>' });
    renderAt('contact');
    expect(document.title).toBe('Contact | Queer Guide');
  });

  it('emits meta_description, falling back to excerpt', () => {
    mockPage({ title: 'About', meta_description: 'The authored description.', excerpt: 'ex' });
    renderAt('about');
    expect(metaContent('description')).toBe('The authored description.');

    mockPage({ title: 'About', excerpt: 'The excerpt.' });
    renderAt('about');
    expect(metaContent('description')).toBe('The excerpt.');
  });

  it('canonicalises the locale-prefixed form to the unprefixed URL', () => {
    mockPage({ title: 'About', body_html: '<p>x</p>' });
    renderAt('about', '/de');
    expect(canonicalHref()).toBe('https://queer.guide/p/about');
  });
});
