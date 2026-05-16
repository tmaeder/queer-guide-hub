/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ insert: vi.fn() }) } }));

import { ReportHotline } from '../ReportHotline';

describe('ReportHotline', () => {
  it('renders', () => {
    const { container } = render(<ReportHotline hotlineId="h1" />);
    expect(container).toBeTruthy();
  });
});
