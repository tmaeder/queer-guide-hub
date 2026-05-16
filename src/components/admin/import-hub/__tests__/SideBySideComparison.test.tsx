/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../StructuredFieldDisplay', () => ({
  getFieldsForEntity: () => [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'rating', label: 'Rating', type: 'number' },
  ],
}));

import { SideBySideComparison } from '../SideBySideComparison';

describe('SideBySideComparison', () => {
  it('renders both record labels', () => {
    render(
      <SideBySideComparison
        entityType="venues"
        leftData={{ name: 'A', rating: 5 }}
        rightData={{ name: 'B', rating: 0 }}
        leftLabel="Rec A" rightLabel="Rec B"
      />,
    );
    expect(screen.getByText('Rec A')).toBeInTheDocument();
    expect(screen.getByText('Rec B')).toBeInTheDocument();
  });
});
