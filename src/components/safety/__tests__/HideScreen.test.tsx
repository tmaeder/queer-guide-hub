/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { HideScreen } from '../HideScreen';

describe('HideScreen', () => {
  it('renders', () => {
    const { container } = render(<HideScreen />);
    expect(container).toBeTruthy();
  });
});
