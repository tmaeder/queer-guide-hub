/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TagsField } from '../TagsField';

const field = { name: 'tags', label: 'Tags', type: 'tags' } as never;

describe('TagsField', () => {
  it('renders empty', () => {
    render(<TagsField field={field} value={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Tags')).toBeInTheDocument();
  });
  it('renders tag chips', () => {
    render(<TagsField field={field} value={['music', 'art']} onChange={vi.fn()} />);
    expect(screen.getByText('music')).toBeInTheDocument();
    expect(screen.getByText('art')).toBeInTheDocument();
  });
});
