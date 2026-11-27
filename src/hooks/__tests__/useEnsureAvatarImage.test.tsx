import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const upload = vi.fn();
const updateProfile = vi.fn();
let profile: Record<string, unknown> | null = null;

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
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile, updateProfile }) }));
vi.mock('@/lib/avatarImage', () => ({ avatarConfigToSvg: () => '<svg/>' }));

// jsdom has no image decoding or canvas encoding.
beforeEach(() => {
  upload.mockReset().mockResolvedValue({ error: null });
  updateProfile.mockReset().mockResolvedValue({ error: null });
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: () => {},
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) =>
    cb(new Blob(['x'], { type: 'image/webp' })),
  );
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

describe('useEnsureAvatarImage', () => {
  it('stores an image for a second built avatar chosen in the same page load', async () => {
    const { useEnsureAvatarImage } = await import('../useEnsureAvatarImage');
    profile = { user_id: 'u1', avatar_url: null, avatar_config: { hair: 'short' } };
    const { rerender } = renderHook(() => useEnsureAvatarImage());
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));

    // The image landed, then the member builds a different avatar (url cleared).
    profile = { user_id: 'u1', avatar_url: null, avatar_config: { hair: 'long' } };
    rerender();
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(2));
    expect(upload).toHaveBeenCalledTimes(2);
  });
});
