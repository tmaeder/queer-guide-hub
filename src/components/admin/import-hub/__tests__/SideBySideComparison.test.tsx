/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
        leftLabel="Rec A"
        rightLabel="Rec B"
      />,
    );
    expect(screen.getByText('Rec A')).toBeInTheDocument();
    expect(screen.getByText('Rec B')).toBeInTheDocument();
  });
  it('keeps populated survivor values, including zero, by default', () => {
    const onMerge = vi.fn();
    render(
      <SideBySideComparison
        entityType="venues"
        leftId="a"
        rightId="b"
        leftData={{ name: 'Short', rating: 0 }}
        rightData={{ name: 'A much longer title', rating: 5 }}
        onMerge={onMerge}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Merge Records' }));
    expect(onMerge).toHaveBeenCalledWith({ name: 'Short', rating: 0 }, 'a', 'b');
  });
  it('fills blank survivor fields from the donor by default', () => {
    const onMerge = vi.fn();
    render(
      <SideBySideComparison
        entityType="venues"
        leftId="a"
        rightId="b"
        leftData={{ name: '  ', rating: null }}
        rightData={{ name: 'Recovered', rating: 0 }}
        onMerge={onMerge}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Merge Records' }));
    expect(onMerge).toHaveBeenCalledWith({ name: 'Recovered', rating: 0 }, 'a', 'b');
  });
});
