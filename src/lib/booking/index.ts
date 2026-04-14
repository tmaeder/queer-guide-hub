export { bookingRegistry } from './registry';
export { travelpayoutsFlights } from './providers/travelpayouts-flights';
export { hotellookProvider } from './providers/hotellook';
export { getyourguideProvider } from './providers/getyourguide';
export { viatorProvider } from './providers/viator';
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
import { getyourguideProvider } from './providers/getyourguide';
import { viatorProvider } from './providers/viator';

bookingRegistry.register(travelpayoutsFlights);
bookingRegistry.register(hotellookProvider);
bookingRegistry.register(getyourguideProvider);
bookingRegistry.register(viatorProvider);
