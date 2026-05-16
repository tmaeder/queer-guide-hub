/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } },
}));

import { ImageUpload } from '../image-upload';

describe('ImageUpload', () => {
  it('renders', () => {
    const { container } = render(<ImageUpload value="" onValueChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
