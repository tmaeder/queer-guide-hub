/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TravelModeSwitcher } from '../TravelModeSwitcher';

describe('TravelModeSwitcher', () => {
  it('renders', () => {
    const { container } = render(<TravelModeSwitcher current="browse" onChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
