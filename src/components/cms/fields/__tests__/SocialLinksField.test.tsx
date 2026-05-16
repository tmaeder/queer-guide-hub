/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SocialLinksField } from '../SocialLinksField';

const field = { name: 'social', label: 'Social', type: 'social_links' } as never;

describe('SocialLinksField', () => {
  it('renders empty', () => {
    const { container } = render(<SocialLinksField field={field} value={{}} onChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
  it('renders with values', () => {
    const { container } = render(<SocialLinksField field={field} value={{ twitter: 'https://twitter.com/x' }} onChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
