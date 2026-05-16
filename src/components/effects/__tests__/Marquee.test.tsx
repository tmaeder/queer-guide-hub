/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Marquee } from '../Marquee';

describe('Marquee', () => {
  it('renders', () => {
    const { container } = render(<Marquee><span>A</span><span>B</span></Marquee>);
    expect(container).toBeTruthy();
  });
});
