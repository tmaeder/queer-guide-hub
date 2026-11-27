import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { imageAttachment, useChatImageSrc } from '../chatImage';
import type { Message } from '@/hooks/useMessaging';

const createSignedUrl = vi.fn().mockResolvedValue({
  data: { signedUrl: 'https://signed/x' },
  error: null,
});
const buckets: string[] = [];
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => {
        buckets.push(bucket);
        return { createSignedUrl: (...a: unknown[]) => createSignedUrl(...a) };
      },
    },
  },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);
const msg = (attachments: unknown[]) => ({ attachments }) as unknown as Message;

describe('chat images', () => {
  it('reads a stored path and signs it from the private bucket', async () => {
    const image = imageAttachment(msg([{ type: 'image', path: 'u1/chat-media/c1/a.webp' }]))!;
    expect(image.path).toBe('u1/chat-media/c1/a.webp');
    const { result } = renderHook(() => useChatImageSrc(image), { wrapper });
    await waitFor(() => expect(result.current).toBe('https://signed/x'));
    expect(createSignedUrl.mock.calls[0][0]).toBe('u1/chat-media/c1/a.webp');
    expect(buckets).toEqual(['user-photos']);
  });

  it('uses a direct url as is', () => {
    const image = imageAttachment(msg([{ type: 'image', url: 'https://x/y.webp' }]))!;
    const { result } = renderHook(() => useChatImageSrc(image), { wrapper });
    expect(result.current).toBe('https://x/y.webp');
  });

  it('ignores an attachment with neither', () => {
    expect(imageAttachment(msg([{ type: 'image' }]))).toBeNull();
  });
});
