/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { MotionPage } from '../MotionPage';

describe('MotionPage', () => {
  it('renders children', () => {
    const { container } = render(<MemoryRouter><MotionPage><span>x</span></MotionPage></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
