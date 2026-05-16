/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCMSMedia', () => ({
  useCMSMedia: () => ({ assets: [], loading: false, loadAssets: vi.fn() }),
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
