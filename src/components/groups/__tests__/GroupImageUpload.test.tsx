/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { GroupImageUpload } from '../GroupImageUpload';

const upload = vi.fn().mockResolvedValue({ error: null });
const buckets: string[] = [];

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => {
        buckets.push(bucket);
        return {
          upload: (...a: unknown[]) => upload(...a),
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }),
        };
      },
    },
  },
}));

describe('GroupImageUpload', () => {
  it('renders', () => {
    const { container } = render(<GroupImageUpload onImagesChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });

  it("uploads to the public group-images bucket, in the uploader's own folder", async () => {
    const onImagesChange = vi.fn();
    const { container } = render(<GroupImageUpload onImagesChange={onImagesChange} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(onImagesChange).toHaveBeenCalled());
    expect(upload.mock.calls[0][0]).toMatch(/^u1\//);
    // user-photos is private; a public URL into it would not load.
    expect(new Set(buckets)).toEqual(new Set(['group-images']));
  });
});
