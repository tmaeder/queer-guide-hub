/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import LGBTJurisdictionInfo from '../LGBTJurisdictionInfo';

describe('LGBTJurisdictionInfo', () => {
  it('renders', () => {
    const { container } = render(<LGBTJurisdictionInfo country={{ name: 'X' } as never} />);
    expect(container).toBeTruthy();
  });
});
