/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StructuredFieldDisplay, getFieldsForEntity } from '../StructuredFieldDisplay';

describe('getFieldsForEntity', () => {
  it('returns defined venue fields', () => {
    const fields = getFieldsForEntity('venues', {});
    expect(fields.some((f) => f.key === 'name')).toBe(true);
    expect(fields.some((f) => f.key === 'address')).toBe(true);
  });

  it('derives fields from data when entity type unknown', () => {
    const fields = getFieldsForEntity('weird_table', { name: 'x', active: true, created_at: 'now', id: '1' });
    expect(fields.some((f) => f.key === 'name')).toBe(true);
    expect(fields.some((f) => f.key === 'active')).toBe(true);
    expect(fields.some((f) => f.key === 'id')).toBe(false);
  });
});

describe('StructuredFieldDisplay', () => {
  it('renders field labels + values', () => {
    render(
      <StructuredFieldDisplay
        entityType="venues"
        data={{ name: 'Pride Bar', address: '1 Pride St', featured: true }}
      />,
    );
    expect(screen.getByText('Pride Bar')).toBeInTheDocument();
    expect(screen.getByText('1 Pride St')).toBeInTheDocument();
  });
});
