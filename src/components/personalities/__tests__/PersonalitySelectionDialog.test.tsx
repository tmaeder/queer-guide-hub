/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PersonalitySelectionDialog } from '../PersonalitySelectionDialog';

describe('PersonalitySelectionDialog', () => {
  it('renders closed', () => {
    const { container } = render(
      <PersonalitySelectionDialog open={false} onOpenChange={vi.fn()} candidates={[]} searchTerm="" onSelect={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
