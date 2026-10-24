/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';
import { PersonalitiesFiltersBar } from '../PersonalitiesFiltersBar';

describe('PersonalitiesFiltersBar', () => {
  it('renders', () => {
    const { container } = renderWithProviders(
      <PersonalitiesFiltersBar filters={{}} onFiltersChange={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
