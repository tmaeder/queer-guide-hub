/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } },
}));

import { VenueImageUpload } from '../VenueImageUpload';

describe('VenueImageUpload', () => {
  it('renders without crashing', () => {
    const { container } = render(<VenueImageUpload images={[]} onChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
