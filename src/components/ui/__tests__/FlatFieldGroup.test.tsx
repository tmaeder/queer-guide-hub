/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FlatFieldGroup, FlatField } from '../FlatFieldGroup';

describe('FlatFieldGroup', () => {
  it('renders with title and field', () => {
    render(
      <FlatFieldGroup title="Section">
        <FlatField label="Name"><input /></FlatField>
      </FlatFieldGroup>,
    );
    expect(screen.getByText('Section')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
  });
});
