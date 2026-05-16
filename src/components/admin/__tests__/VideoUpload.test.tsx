/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: () => ({}) } } }));
vi.mock('@/hooks/usePageFetchers', () => ({ insertRow: vi.fn() }));
vi.mock('react-dropzone', () => ({
  useDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
  }),
}));

import { VideoUpload } from '../VideoUpload';

describe('VideoUpload', () => {
  it('renders dropzone area', () => {
    const { container } = render(<VideoUpload />);
    expect(container).toBeTruthy();
  });
});
