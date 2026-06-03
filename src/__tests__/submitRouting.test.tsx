/**
 * @vitest-environment jsdom
 *
 * Regression guard for the /submit/:contentType ↔ optional :locale? collision.
 *
 * The locale layout parent is `<Route path="/:locale?">`. React Router expands
 * the optional segment, so for a URL like /submit/news two branches match and
 * score identically:
 *   - /:locale/news          (locale="submit" → News page)
 *   - /submit/:contentType   (contentType="news" → SubmitForm)
 * The tie breaks toward the earlier-defined sibling (news / feedback), so
 * LocaleRouter sees "submit" as an unknown locale and renders NotFound.
 *
 * This only bites submit slugs that ALSO exist as standalone top-level routes
 * (news, feedback). The fix adds a fully-static `submit/<slug>` route per
 * registry entry, which outranks the locale branch deterministically.
 *
 * The pre-existing SubmitForm.test.tsx missed this because it mounted SubmitForm
 * under a hand-built `/submit/:type` route with no :locale? parent — no collision.
 * This test mounts the REAL AppRoutes so the live route tree is what's exercised.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { submissionRegistry } from '@/config/submissionRegistry';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: 'en', changeLanguage: () => {} },
  }),
}));

vi.mock('@/providers/SearchTelemetryProvider', () => ({
  useSearchTelemetry: () => {},
}));

vi.mock('@/components/security/AdminRouteGuard', () => ({
  AdminRouteGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/motion', () => ({
  MotionPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mirror the real SubmitForm's type resolution (prop ?? :contentType param)
// so the test catches not just "form renders" but "the right type reaches it".
vi.mock('@/pages/SubmitForm', async () => {
  const { useParams } = await import('react-router');
  const SubmitFormMock = ({ contentType }: { contentType?: string }) => {
    const { contentType: param } = useParams<{ contentType: string }>();
    return <div>SUBMIT_FORM_SENTINEL:{contentType ?? param ?? 'NONE'}</div>;
  };
  return { default: SubmitFormMock };
});
vi.mock('@/pages/SubmitHub', () => ({ default: () => <div>SUBMIT_HUB_SENTINEL</div> }));
vi.mock('@/pages/NotFound', () => ({ default: () => <div>NOT_FOUND_SENTINEL</div> }));
vi.mock('@/pages/News', () => ({ default: () => <div>NEWS_SENTINEL</div> }));
vi.mock('@/pages/FeedbackBoard', () => ({ default: () => <div>FEEDBACK_SENTINEL</div> }));

import { AppRoutes } from '@/routes';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('submit route resolution', () => {
  it('renders the submit form with the correct type for every registered submission type', async () => {
    for (const slug of Object.keys(submissionRegistry)) {
      const { unmount } = renderAt(`/submit/${slug}`);
      expect(
        await screen.findByText(`SUBMIT_FORM_SENTINEL:${slug}`),
        `/submit/${slug} should render SubmitForm with type "${slug}", not NotFound or an empty type`,
      ).toBeTruthy();
      unmount();
    }
  });

  it('renders the submit form for the two slugs that collide with top-level routes', async () => {
    for (const slug of ['news', 'feedback']) {
      const { unmount } = renderAt(`/submit/${slug}`);
      expect(await screen.findByText(`SUBMIT_FORM_SENTINEL:${slug}`)).toBeTruthy();
      expect(screen.queryByText('NOT_FOUND_SENTINEL')).toBeNull();
      expect(screen.queryByText('NEWS_SENTINEL')).toBeNull();
      expect(screen.queryByText('FEEDBACK_SENTINEL')).toBeNull();
      unmount();
    }
  });

  it('still resolves the standalone /news and /feedback pages', async () => {
    const news = renderAt('/news');
    expect(await screen.findByText('NEWS_SENTINEL')).toBeTruthy();
    news.unmount();

    const feedback = renderAt('/feedback');
    expect(await screen.findByText('FEEDBACK_SENTINEL')).toBeTruthy();
    feedback.unmount();
  });
});
