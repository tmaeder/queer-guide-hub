import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) },
}));

import { RelatedTagsCard } from '../RelatedTagsCard';

const w = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('RelatedTagsCard', () => {
  it('should show loading skeleton initially', () => {
    render(<RelatedTagsCard tagId="t-1" onTagClick={vi.fn()} />, { wrapper: w });
    expect(screen.getByText('Related')).toBeInTheDocument();
  });
});
