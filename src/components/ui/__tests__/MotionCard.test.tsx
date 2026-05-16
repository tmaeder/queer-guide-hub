/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MotionCard } from '../MotionCard';

describe('MotionCard', () => {
  it('renders children', () => {
    render(<MotionCard>Hello</MotionCard>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
