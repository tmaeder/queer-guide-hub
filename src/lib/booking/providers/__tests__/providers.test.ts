import { describe, it, expect } from 'vitest';
import { viatorProvider } from '../viator';
import { hotellookProvider } from '../hotellook';
import { getyourguideProvider } from '../getyourguide';
import { impalaProvider } from '../impala';
import { travelpayoutsFlights } from '../travelpayouts-flights';

describe('booking providers', () => {
  it.each([
    ['viator', viatorProvider],
    ['hotellook', hotellookProvider],
    ['getyourguide', getyourguideProvider],
    ['impala', impalaProvider],
    ['travelpayouts', travelpayoutsFlights],
  ])('%s exports a provider object', (_, p) => {
    expect(p).toBeDefined();
    expect(typeof p.name).toBe('string');
  });
});
