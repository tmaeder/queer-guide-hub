import { describe, expect, it } from 'vitest';
import { formatImageCredit, stripCreditMarkup } from '@/lib/imageCredit';

describe('stripCreditMarkup', () => {
  it('reduces Commons artist HTML to the name', () => {
    expect(
      stripCreditMarkup('<a href="//commons.wikimedia.org/wiki/User:X" title="User:X">Lucas</a>'),
    ).toBe('Lucas');
  });
  it('reduces bracket-stripped markup to the name', () => {
    expect(
      formatImageCredit({
        attribution:
          'a href="//commons.wikimedia.org/wiki/User:Lucas_Werkmeister" title="User:Lucas Werkmeister"Lucas Werkmeister/a',
        license: 'CC BY 4.0',
      }),
    ).toBe('Lucas Werkmeister · CC BY 4.0');
  });
  it('leaves plain names alone', () => {
    expect(stripCreditMarkup('Jane Doe')).toBe('Jane Doe');
  });
});
