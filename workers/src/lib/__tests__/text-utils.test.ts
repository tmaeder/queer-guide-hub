import { describe, it, expect } from 'vitest';
import { sanitizeIdentifier, normalizeRecord } from '../text-utils';

describe('sanitizeIdentifier', () => {
  it('removes special characters', () => {
    expect(sanitizeIdentifier('hello-world!')).toBe('helloworld');
  });

  it('preserves alphanumeric and underscore', () => {
    expect(sanitizeIdentifier('table_name_1')).toBe('table_name_1');
  });

  it('removes spaces', () => {
    expect(sanitizeIdentifier('my table')).toBe('mytable');
  });

  it('handles empty string', () => {
    expect(sanitizeIdentifier('')).toBe('');
  });

  it('removes SQL injection characters', () => {
    expect(sanitizeIdentifier("'; DROP TABLE --")).toBe('DROPTABLE');
  });
});

describe('normalizeRecord', () => {
  it('trims string values', () => {
    const result = normalizeRecord({ name: '  John  ' });
    expect(result.name).toBe('John');
  });

  it('lowercases email fields', () => {
    const result = normalizeRecord({ email: '  JOHN@EXAMPLE.COM  ' });
    expect(result.email).toBe('john@example.com');
  });

  it('lowercases fields ending with _email', () => {
    const result = normalizeRecord({ contact_email: 'Admin@Test.Com' });
    expect(result.contact_email).toBe('admin@test.com');
  });

  it('preserves non-string values', () => {
    const result = normalizeRecord({ count: 42, active: true, name: 'test' });
    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
    expect(result.name).toBe('test');
  });

  it('handles empty record', () => {
    const result = normalizeRecord({});
    expect(result).toEqual({});
  });

  it('handles mixed field types', () => {
    const result = normalizeRecord({
      name: '  Test  ',
      email: '  TEST@TEST.COM  ',
      count: 5,
      tags: ['a', 'b'],
    });
    expect(result.name).toBe('Test');
    expect(result.email).toBe('test@test.com');
    expect(result.count).toBe(5);
    expect(result.tags).toEqual(['a', 'b']);
  });
});
