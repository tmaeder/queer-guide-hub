/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { GroupImageUpload } from '../GroupImageUpload';

const upload = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => upload(...a),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }),
      }),
    },
  },
}));

describe('GroupImageUpload', () => {
  it('renders', () => {
    const { container } = render(<GroupImageUpload onImagesChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });

  it("uploads into the uploader's own folder, as the bucket's INSERT policy requires", async () => {
    const onImagesChange = vi.fn();
    const { container } = render(<GroupImageUpload onImagesChange={onImagesChange} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(onImagesChange).toHaveBeenCalled());
    expect(upload.mock.calls[0][0]).toMatch(/^u1\/group-images\//);
  });
});
