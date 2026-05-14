// Test-only utility file — fast refresh doesn't apply since it's only
// imported by .test.tsx files, never rendered in dev mode.
/* eslint-disable react-refresh/only-export-components */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

/**
 * Create a fresh QueryClient per test — TanStack Query caches results,
 * which leaks state between tests if reused.
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
    // Silence TanStack Query's error logger in tests — the errors we trigger
    // on purpose in "failure path" tests are expected.
    logger: {
      log: () => {},
      warn: () => {},
      error: () => {},
    } as unknown as undefined,
  });
}

interface ProviderProps {
  children: ReactNode;
  route?: string;
  queryClient?: QueryClient;
}

/**
 * Wraps children in the minimum providers trip components need:
 * - QueryClientProvider (for useQuery/useMutation)
 * - MemoryRouter (for react-router hooks)
 */
export function TestProviders({ children, route = '/', queryClient }: ProviderProps) {
  const client = queryClient ?? makeQueryClient();
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
  queryClient?: QueryClient;
}

/**
 * Drop-in replacement for `@testing-library/react`'s render that wraps
 * the component in QueryClient + MemoryRouter.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route, queryClient, ...options }: CustomRenderOptions = {},
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <TestProviders route={route} queryClient={queryClient}>
        {children}
      </TestProviders>
    ),
    ...options,
  });
}

// Re-export the commonly used testing-library bits so test files can
// import everything from a single place.
export * from '@testing-library/react';

export function expectNoPlaceholderLeaks(container: HTMLElement) {
  const text = container.textContent ?? '';
  const needles: Array<[string, RegExp]> = [
    ['"null" literal in text', /\bnull\b/],
    ['"undefined" literal in text', /\bundefined\b/],
    ['"[object Object]" leak', /\[object Object\]/],
    ['unresolved {{moustache}} template', /\{\{[^}]*\}\}/],
  ];
  for (const [label, re] of needles) {
    if (re.test(text)) {
      throw new Error(
        `Placeholder leak detected (${label}):\n${text.slice(0, 500)}`,
      );
    }
  }
}
