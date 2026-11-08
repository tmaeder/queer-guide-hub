/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCMSMedia', () => ({
  useCMSMedia: () => ({ uploadAsset: vi.fn().mockResolvedValue({}), loading: false }),
}));

import MediaUploader from '../MediaUploader';

describe('MediaUploader', () => {
  it('renders', () => {
    const { container } = render(<MediaUploader onUploaded={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
