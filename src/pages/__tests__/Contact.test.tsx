/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } },
}));
vi.mock('@/components/effects', () => ({ FloatingInput: () => null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import Contact from '../Contact';

describe('Contact', () => {
  it('renders without crashing', () => {
    const { container } = render(<Contact />);
    expect(container).toBeTruthy();
  });
});
