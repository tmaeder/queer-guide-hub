/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Label } from '../label';

describe('Label', () => {
  it('renders text', () => {
    render(<Label htmlFor="x">Name</Label>);
    expect(screen.getByText('Name')).toBeInTheDocument();
  });
});
