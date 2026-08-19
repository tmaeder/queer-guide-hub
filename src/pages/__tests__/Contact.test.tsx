/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } },
}));
vi.mock('@/components/effects', () => ({ FloatingInput: () => null }));
vi.mock('@/components/effects/ColourfulText', () => ({
  ColourfulText: (p: { text: string }) => <>{p.text}</>,
}));
vi.mock('@/components/effects/WobbleCard', () => ({
  WobbleCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/effects/TracingBeam', () => ({
  TracingBeam: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import Contact from '../Contact';

// Contact is a ROUTE, so it renders inside a router — it reads `?category=`
// to preselect the Safety & Moderation lane for the footer's report link.
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Contact />
    </MemoryRouter>,
  );

describe('Contact', () => {
  it('renders without crashing', () => {
    const { container } = renderAt('/contact');
    expect(container).toBeTruthy();
  });

  it('preselects a known category from the query string', () => {
    const { getByLabelText } = renderAt('/contact?category=safety');
    expect(getByLabelText('Category')).toHaveTextContent('Safety & Moderation');
  });

  it('ignores an unknown category rather than setting a lane that does not exist', () => {
    const { getByLabelText } = renderAt('/contact?category=not-a-lane');
    expect(getByLabelText('Category')).toHaveTextContent('Select a category');
  });
});
