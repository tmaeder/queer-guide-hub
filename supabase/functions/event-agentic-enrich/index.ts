// Grounded event content gap closure. Daily AI budget and per-event retry leases
// are enforced for scheduled runs and explicit IDs alike.
import { serveEventGaps } from '../_shared/event-gap-worker.ts'
Deno.serve(serveEventGaps('content'))
