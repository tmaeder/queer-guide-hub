/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Switch } from '../switch';

describe('Switch', () => {
  it('renders', () => {
    render(<Switch />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });
});
