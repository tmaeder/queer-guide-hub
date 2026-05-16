/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: () => ({ upload: vi.fn() }) } } }));
vi.mock('@/hooks/usePageFetchers', () => ({ insertRow: vi.fn() }));

import { AudioUpload } from '../AudioUpload';

describe('AudioUpload', () => {
  it('renders empty dropzone', () => {
    render(<AudioUpload />);
    expect(screen.getByText(/Drag & drop audio files/i)).toBeInTheDocument();
  });
});
