/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/components/cms/media/MediaPickerDialog', () => ({ default: () => null }));

import { ImageField } from '../ImageField';

const field = { name: 'cover', label: 'Cover', type: 'image' } as never;

describe('ImageField', () => {
  it('renders empty', () => {
    const { container } = render(<ImageField field={field} value="" onChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
  it('renders with image url', () => {
    const { container } = render(<ImageField field={field} value="https://example.com/x.jpg" onChange={vi.fn()} />);
    expect(container.querySelector('img, [aria-label]')).toBeTruthy();
  });
});
