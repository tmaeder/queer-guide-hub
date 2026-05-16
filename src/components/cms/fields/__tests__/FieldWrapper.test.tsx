/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldWrapper } from '../FieldWrapper';

const field = { name: 'x', label: 'X', type: 'text' } as never;

describe('FieldWrapper', () => {
  it('renders label and children', () => {
    render(<FieldWrapper field={field}><input id="x" /></FieldWrapper>);
    expect(screen.getByText('X')).toBeInTheDocument();
  });
  it('renders error message', () => {
    render(<FieldWrapper field={field} error="Required"><input id="x" /></FieldWrapper>);
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });
  it('hides label when hideLabel', () => {
    render(<FieldWrapper field={field} hideLabel><input id="x" /></FieldWrapper>);
    expect(screen.queryByText('X')).toBeNull();
  });
});
