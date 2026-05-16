/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import {
  PatternHomeMobile,
  PatternSignInMobile,
  PatternCityMobile,
  PatternVenueMobile,
  PatternEventsMobile,
} from '../mobile';

describe('PatternLibrary/mobile', () => {
  for (const [name, Comp] of Object.entries({
    Home: PatternHomeMobile,
    SignIn: PatternSignInMobile,
    City: PatternCityMobile,
    Venue: PatternVenueMobile,
    Events: PatternEventsMobile,
  })) {
    it(`${name} renders`, () => {
      const { container } = render(<Comp />);
      expect(container).toBeTruthy();
    });
  }
});
