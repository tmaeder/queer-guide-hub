/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PageHero } from '../PageHero';

describe('PageHero', () => {
  it('renders', () => {
    const { container } = render(<PageHero title="Title" />);
    expect(container).toBeTruthy();
  });
});
