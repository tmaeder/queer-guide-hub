import { lazy, Suspense } from 'react';
import { MemoryRouter, Route, Outlet, useParams } from 'react-router';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RoutesWithLeafSuspense } from '../RoutesWithLeafSuspense';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

describe('lazy page route boundaries', () => {
  it('keeps routing and layouts mounted while the selected page loads, then preserves its params', async () => {
    let finish!: (module: { default: () => React.ReactNode }) => void;
    const Page = lazy(
      () =>
        new Promise<{ default: () => React.ReactNode }>((resolve) => {
          finish = resolve;
        }),
    );
    let routingRenders = 0;
    function Layout() {
      return (
        <>
          <p>Route layout</p>
          <Outlet />
        </>
      );
    }
    function Routing() {
      routingRenders++;
      return (
        <RoutesWithLeafSuspense>
          <Route path="/:locale" element={<Layout />}>
            <Route path="city/:slug" element={<Page />} />
          </Route>
        </RoutesWithLeafSuspense>
      );
    }
    render(
      <MemoryRouter initialEntries={['/de/city/berlin']}>
        <Suspense fallback={<p>Outer fallback</p>}>
          <Routing />
        </Suspense>
      </MemoryRouter>,
    );
    expect(screen.getByText('Route layout')).toBeInTheDocument();
    expect(screen.queryByText('Outer fallback')).not.toBeInTheDocument();
    expect(document.querySelector('[data-route-loading]')).not.toBeNull();
    await act(async () =>
      finish({
        default: function Loaded() {
          const { locale, slug } = useParams();
          return (
            <h1>
              {locale}: {slug}
            </h1>
          );
        },
      }),
    );
    expect(await screen.findByRole('heading', { name: 'de: berlin' })).toBeInTheDocument();
    expect(routingRenders).toBe(1);
  });
});
