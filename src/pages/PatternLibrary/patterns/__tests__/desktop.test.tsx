/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import {
  PatternHome,
  PatternSignIn,
  PatternSignUp,
  PatternCity,
  PatternVenueList,
  PatternVenueDetail,
  PatternEvents,
  PatternFestival,
  PatternHotelSearch,
  PatternHotelDetail,
} from '../desktop';

describe('PatternLibrary/desktop', () => {
  for (const [name, Comp] of Object.entries({
    Home: PatternHome, SignIn: PatternSignIn, SignUp: PatternSignUp,
    City: PatternCity, VenueList: PatternVenueList, VenueDetail: PatternVenueDetail,
    Events: PatternEvents, Festival: PatternFestival,
    HotelSearch: PatternHotelSearch, HotelDetail: PatternHotelDetail,
  })) {
    it(`${name} renders`, () => {
      const { container } = render(<Comp />);
      expect(container).toBeTruthy();
    });
  }
});
