/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/components/cms/media/MediaPickerDialog', () => ({ default: () => null }));

import { ImagesField } from '../ImagesField';

const field = { name: 'gallery', label: 'Gallery', type: 'images' } as never;

describe('ImagesField', () => {
  it('renders empty', () => {
    const { container } = render(<ImagesField field={field} value={[]} onChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
  it('renders with image array', () => {
    const { container } = render(<ImagesField field={field} value={['https://x/1.jpg']} onChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
