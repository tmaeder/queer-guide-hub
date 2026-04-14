export { bookingRegistry } from './registry';
export { travelpayoutsFlights } from './providers/travelpayouts-flights';
export { hotellookProvider } from './providers/hotellook';
export type {
  BookingVertical,
  BookingStatus,
  BookingSearchParams,
  BookingResult,
  BookingFlowData,
  BookingRoom,
  BookingConfirmation,
  BookingProvider,
} from './types';

import { bookingRegistry } from './registry';
import { travelpayoutsFlights } from './providers/travelpayouts-flights';
import { hotellookProvider } from './providers/hotellook';

bookingRegistry.register(travelpayoutsFlights);
bookingRegistry.register(hotellookProvider);
