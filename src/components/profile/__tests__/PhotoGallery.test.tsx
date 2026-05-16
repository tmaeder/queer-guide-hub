/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useUserPhotos', () => ({
  useUserPhotos: () => ({
    photos: [], loading: false,
    uploadPhoto: vi.fn(), deletePhoto: vi.fn(), updateCaption: vi.fn(),
  }),
}));

import { PhotoGallery } from '../PhotoGallery';

describe('PhotoGallery', () => {
  it('renders', () => {
    const { container } = render(<PhotoGallery userId="u1" isOwnProfile={false} />);
    expect(container).toBeTruthy();
  });
});
