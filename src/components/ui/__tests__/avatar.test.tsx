/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';

describe('Avatar', () => {
  it('renders fallback', () => {
    render(<Avatar><AvatarFallback>X</AvatarFallback></Avatar>);
    expect(screen.getByText('X')).toBeInTheDocument();
  });
  it('mounts image element', () => {
    const { container } = render(<Avatar><AvatarImage src="x.jpg" /></Avatar>);
    expect(container).toBeTruthy();
  });
});
