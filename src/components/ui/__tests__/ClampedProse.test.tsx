/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClampedProse } from '../ClampedProse';
import { splitProseParagraphs } from '@/lib/prose';

describe('splitProseParagraphs', () => {
  it('respects author paragraphs when the text has blank lines', () => {
    expect(splitProseParagraphs('First block.\n\nSecond block.')).toEqual([
      'First block.',
      'Second block.',
    ]);
  });

  it('chunks an unbroken blob into sentence groups', () => {
    // `editorial_long` arrives as one string with no newlines — on Iran it
    // rendered as a single 2,569px paragraph.
    const blob = Array.from({ length: 8 }, (_, i) => `Sentence number ${i + 1} says things.`).join(
      ' ',
    );
    const paras = splitProseParagraphs(blob);
    expect(paras.length).toBe(2);
    expect(paras.join(' ')).toContain('Sentence number 8');
  });

  it('does not split on abbreviations', () => {
    const paras = splitProseParagraphs('The U.S. capital is Washington. It is not New York.');
    expect(paras).toHaveLength(1);
  });
});

describe('ClampedProse', () => {
  it('keeps the full text in the DOM while collapsed — line-clamp hides visually, not from the document', () => {
    const text = 'Alpha beta gamma. Delta epsilon zeta.';
    render(<ClampedProse text={text} moreLabel="Read more" lessLabel="Show less" />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('renders no toggle when the text does not overflow the clamp', () => {
    // jsdom has no layout, so scrollHeight === clientHeight — exactly the
    // no-overflow case: short editorials never grow a dead button.
    render(<ClampedProse text="Short." moreLabel="Read more" lessLabel="Show less" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
