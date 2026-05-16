/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GroupImageUpload } from '../GroupImageUpload';

describe('GroupImageUpload', () => {
  it('renders', () => {
    const { container } = render(<GroupImageUpload onImagesChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
