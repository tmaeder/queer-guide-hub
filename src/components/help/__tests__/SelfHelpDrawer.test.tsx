/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SelfHelpDrawer } from '../SelfHelpDrawer';

describe('SelfHelpDrawer', () => {
  it('renders', () => {
    const { container } = render(<SelfHelpDrawer />);
    expect(container).toBeTruthy();
  });
});
