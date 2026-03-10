import { describe, it, expect } from 'vitest';
import { parseCSV } from '../csv';

describe('parseCSV', () => {
  it('parses simple CSV', () => {
    expect(parseCSV('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted fields with commas', () => {
    expect(parseCSV('"hello, world",b\n')).toEqual([['hello, world', 'b']]);
  });

  it('handles escaped quotes', () => {
    expect(parseCSV('"he said ""hi""",b\n')).toEqual([['he said "hi"', 'b']]);
  });

  it('handles embedded newlines in quoted fields', () => {
    expect(parseCSV('"line1\nline2",b\n')).toEqual([['line1\nline2', 'b']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCSV('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('skips empty rows', () => {
    expect(parseCSV('a,b\n,,\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('trims whitespace from fields', () => {
    expect(parseCSV(' a , b \n 1 , 2 \n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles input without trailing newline', () => {
    expect(parseCSV('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles empty input', () => {
    expect(parseCSV('')).toEqual([]);
  });

  it('handles single field', () => {
    expect(parseCSV('hello\n')).toEqual([['hello']]);
  });
});
