/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCMSMedia', () => ({
  useCMSMedia: () => ({
    media: [], loading: false, error: null, totalCount: 0,
    fetchMedia: vi.fn(), importExternalMedia: vi.fn().mockResolvedValue({}),
  }),
}));

import MediaPickerDialog from '../MediaPickerDialog';

describe('MediaPickerDialog', () => {
  it('renders closed without crashing', () => {
    const { container } = render(
      <MediaPickerDialog open={false} onClose={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
