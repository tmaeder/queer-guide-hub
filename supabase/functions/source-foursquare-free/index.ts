// Stable deployment alias for the guarded Foursquare API + OS Places source.
// The legacy `source-foursquare` slug is still deployed by older automation;
// keeping the free-data implementation on a distinct slug prevents that
// automation from rolling the guarded OS/API handler back.
import '../source-foursquare/index.ts'
