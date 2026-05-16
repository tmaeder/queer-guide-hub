/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { UrlValidator } from '../UrlValidator';

describe('UrlValidator', () => {
  it('renders', () => {
    const { container } = render(<UrlValidator url="https://x" onValidate={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
