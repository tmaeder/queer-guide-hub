#!/usr/bin/env node

// Retired: Foursquare Photos is a Premium endpoint and has no free-call
// allowance. Keep an explicit local tombstone so old operator instructions
// cannot silently create paid usage.
console.error(
  'venue-photo-foursquare is retired by the zero-spend policy: Foursquare Photos is Premium. ' +
  'Use licensed free/open image sources instead.',
)
process.exit(2)
