/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  },
}));

import { EnhancedImageUpload } from '../EnhancedImageUpload';

describe('EnhancedImageUpload', () => {
  it('renders', () => {
    const { container } = render(<EnhancedImageUpload onUpload={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
