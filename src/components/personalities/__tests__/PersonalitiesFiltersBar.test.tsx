/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PersonalitiesFiltersBar } from '../PersonalitiesFiltersBar';

describe('PersonalitiesFiltersBar', () => {
  it('renders', () => {
    const { container } = render(<PersonalitiesFiltersBar filters={{}} onFiltersChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
