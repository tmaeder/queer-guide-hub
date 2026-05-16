/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScrollArea, ScrollBar } from '../scroll-area';

describe('ScrollArea', () => {
  it('renders children', () => {
    render(<ScrollArea><div>content</div><ScrollBar /></ScrollArea>);
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
