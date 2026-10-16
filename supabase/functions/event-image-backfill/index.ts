// Event-owned artwork only, with durable cooldown and verified cover dimensions.
import { serveEventGaps } from '../_shared/event-gap-worker.ts'
Deno.serve(serveEventGaps('image'))
