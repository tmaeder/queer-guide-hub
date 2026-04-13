import { describe, it, expect } from 'vitest';
import { container, responsive, center, pageWrapper, stack, row } from '../sx';

describe('container', () => {
  it('should have full width', () => {
    expect(container).toHaveProperty('width', '100%');
  });

  it('should have horizontal padding', () => {
    expect(container).toHaveProperty('px');
  });
});

describe('responsive', () => {
  it('should return xs only when no other args', () => {
    const result = responsive(1);
    expect(result).toEqual({ xs: 1 });
  });

  it('should include provided breakpoints', () => {
    const result = responsive(1, 2, 3);
    expect(result).toEqual({ xs: 1, sm: 2, md: 3 });
  });

  it('should include all breakpoints', () => {
    const result = responsive(1, 2, 3, 4, 5);
    expect(result).toEqual({ xs: 1, sm: 2, md: 3, lg: 4, xl: 5 });
  });

  it('should skip undefined breakpoints', () => {
    const result = responsive(1, undefined, 3);
    expect(result).toEqual({ xs: 1, md: 3 });
  });
});

describe('center', () => {
  it('should have flex display', () => {
    expect(center).toHaveProperty('display', 'flex');
  });

  it('should center items', () => {
    expect(center).toHaveProperty('alignItems', 'center');
    expect(center).toHaveProperty('justifyContent', 'center');
  });
});

describe('pageWrapper', () => {
  it('should have full width', () => {
    expect(pageWrapper).toHaveProperty('width', '100%');
  });
});

describe('stack', () => {
  it('should return column flex with default gap', () => {
    const result = stack();
    expect(result).toHaveProperty('flexDirection', 'column');
    expect(result).toHaveProperty('gap', 2);
  });

  it('should accept custom gap', () => {
    expect(stack(4)).toHaveProperty('gap', 4);
  });
});

describe('row', () => {
  it('should return row flex with default gap', () => {
    const result = row();
    expect(result).toHaveProperty('flexDirection', 'row');
    expect(result).toHaveProperty('gap', 1);
  });

  it('should accept custom gap and alignment', () => {
    const result = row(3, 'flex-start');
    expect(result).toHaveProperty('gap', 3);
    expect(result).toHaveProperty('alignItems', 'flex-start');
  });
});
