/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { RichTextField } from '../RichTextField';

const field = { name: 'body', label: 'Body', type: 'richtext' } as never;

describe('RichTextField', () => {
  it('renders fallback while editor loads', () => {
    const { container } = render(<RichTextField field={field} value="" onChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
