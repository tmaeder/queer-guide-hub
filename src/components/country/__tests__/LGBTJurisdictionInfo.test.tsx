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

describe('LGBTJurisdictionInfo penalty line', () => {
  const crimCountry = (crim: Record<string, unknown>) =>
    ({ name: 'X', lgbti_criminalization: { legal: false, ...crim } }) as never;

  it('does not append a bare "(Years)" category label (Ghana)', () => {
    const { container } = render(
      <LGBTJurisdictionInfo
        country={crimCountry({ penalty: 'Up to 8 years imprisonment', max_prison: 'Years' })}
      />,
    );
    expect(container.textContent).toContain('Up to 8 years imprisonment');
    expect(container.textContent).not.toContain('(Years)');
    expect(container.textContent).not.toMatch(/\(Unknown\)/);
  });

  it('does not repeat "death penalty" when the penalty already says it (Iran)', () => {
    const { container } = render(
      <LGBTJurisdictionInfo
        country={crimCountry({
          penalty: 'Death Penalty',
          death_penalty: 'Yes',
          max_prison: 'Unknown',
        })}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Death Penalty');
    // Iran's stored values. The line named the penalty twice.
    const line = text.slice(text.indexOf('Penalty:'));
    expect(line.match(/death penalty/gi)).toHaveLength(1);
  });
});
