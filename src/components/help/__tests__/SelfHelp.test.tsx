/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SelfHelp } from '../SelfHelp';

describe('SelfHelp', () => {
  it('renders', () => {
    const { container } = render(<SelfHelp />);
    expect(container.textContent).toContain('4-7-8 breathing');
    expect(container.textContent).toContain('Safety plan');
  });
});
