/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TextGenerateEffect } from '../TextGenerateEffect';

describe('TextGenerateEffect', () => {
  it('renders', () => {
    const { container } = render(<TextGenerateEffect words="hello world" />);
    expect(container).toBeTruthy();
  });
});
