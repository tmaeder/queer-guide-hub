import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
import { ReportButton } from '../ReportButton';
describe('ReportButton', () => {
  it('should render report button', () => {
    render(<ReportButton contentType="venue" contentId="v-1" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
