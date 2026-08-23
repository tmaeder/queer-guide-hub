/**
 * Replace storefront thumbnail URLs with the merchant's original, and mirror the
 * result to R2 so the reader never depends on the merchant at page-load time.
 *
 * This is the server-side half of `scripts/data-quality/upgrade-marketplace-images.mjs`.
 * The rewrite rules and the accept/reject gate are shared with it via
 * `_shared/image-upscale.ts`, so the two cannot disagree about what an upgrade is.
 *
 * ── Why this exists as a cron and not just a script ─────────────────────────
 * The script finished mrsleather (983 listings, 135x135 -> 400x500),
 * invinciblerubber and pnpplzine. misterb is ~2,200 listings whose covers are
 * all purged Magento cache derivatives, and it is slow and partly rotten: some
 * originals are still there at 450x600 to 1200x1200, some are gone. That is a
 * long patient sweep, not a desk job, and a cron resumes it for free.
 *
 * ── 403 means two opposite things, and getting that wrong cost a day ────────
 * Magento answers a MISSING FILE with 403, and a WAF answers a BLOCKED CALLER
 * with 403. Read as a block, dead assets never get stamped and the work-list
 * never drains. Read as a verdict, a real block writes the merchant off
 * permanently. Three separate theories were entertained and each was wrong:
 * per-IP rate limiting (this machine 200s on every header variant), TLS
 * fingerprinting (curl and Node behave the same once volume is low), and
 * datacenter-range blocking (pg_net from Supabase fetches misterb fine, 200).
 * What is actually true is per-file. The code therefore never assumes: it
 * corroborates within the run — a host that answered 200 at least once is
 * talking to us, so its 403s are about the file.
 *
 * ── Mirroring ───────────────────────────────────────────────────────────────
 * An upgraded cover is downloaded and mirrored to R2 in the same pass, using
 * the bytes the probe already fetched, so the merchant is not asked twice and
 * rendering stops depending on a slow shop. When the mirror fails the upgraded
 * merchant URL is still recorded, as 'pending', so the ladder falls back to it
 * and a later pass can mirror it.
 *
 * ── Pacing ──────────────────────────────────────────────────────────────────
 * Requests are serialised per HOST with a gap, because a batch scoped to one
 * source draws every image from one small shop. The run also stops on a
 * wall-clock budget rather than a fixed count, since a slow merchant makes the
 * per-listing cost unpredictable and being killed mid-write is the one outcome
 * worth avoiding.
 */

import {
  corsResponse,
  errorResponse,
  getServiceClient,
  jsonResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'
import { imageSize } from '../_shared/site-icon.ts'
import { mirrorImageToR2 } from '../_shared/logo-mirror.ts'
import { isRealUpgrade, looksLikePlaceholder, upscaleCandidates } from '../_shared/image-upscale.ts'

const R2_PREFIX = 'marketplace-images'
const MAX_BYTES = 8 * 1024 * 1024
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** Only these reach the reader; anything else is not a product photo we can serve. */
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

interface Probe {
  w?: number
  h?: number
  bytes?: Uint8Array
  contentType?: string
  error?: string
}

/** Serialise per host with a gap — see the pacing note in the file header. */
class HostPacer {
  private chains = new Map<string, Promise<unknown>>()
  constructor(private gapMs: number) {}
  run<T>(url: string, fn: () => Promise<T>): Promise<T> {
    let host: string
    try {
      host = new URL(url).hostname
    } catch {
      return fn()
    }
    const prev = this.chains.get(host) ?? Promise.resolve()
    const next = prev.then(async () => {
      const out = await fn()
      await new Promise((r) => setTimeout(r, this.gapMs))
      return out
    })
    // Keep the chain alive past a rejection and drop the value, or the map
    // retains every response for the life of the run.
    this.chains.set(
      host,
      next.then(
        () => undefined,
        () => undefined,
      ),
    )
    return next
  }
}

/**
 * Fetch an image and measure it. Returns the bytes too, so an accepted candidate
 * can be mirrored without a second download from a shop that is counting.
 *
 * A transport failure and a small image must not collapse into the same answer:
 * `error` means "we could not look", never "the image is bad". Recording a 403
 * as a verdict is what wrote off this merchant in the first place.
 */
async function probe(url: string, timeoutMs = 20000): Promise<Probe> {
  try {
    const headers: Record<string, string> = { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*' }
    // The mirror host's WAF answers any other Referer with `error code: 1011`.
    if (url.includes('img.queer.guide')) headers.Referer = 'https://queer.guide/'
    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return { error: `http_${res.status}` }
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength > MAX_BYTES) return { error: 'too_large' }
    const size = imageSize(buf)
    if (!size) return { error: 'unparsed' }
    return { w: size.width, h: size.height, bytes: buf, contentType }
  } catch (e) {
    return { error: String((e as Error)?.name ?? e).slice(0, 40) }
  }
}

interface Row {
  id: string
  source_type: string | null
  images: string[] | null
  served_url: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    const body = await req.json().catch(() => ({}))

    // Diagnostic: measure specific URLs from THIS function's egress and report
    // nothing else. `host_fail` on a sweep cannot distinguish "these particular
    // files are gone" from "this egress is blocked", and every attempt to infer
    // it from the sweep's own numbers was wrong. Point this at a URL already
    // known to be alive from somewhere else and the ambiguity disappears.
    if (Array.isArray(body.probe_urls)) {
      const out: Record<string, string> = {}
      for (const u of body.probe_urls.slice(0, 10)) {
        const p = await probe(String(u))
        out[String(u)] = p.error ?? `${p.w}x${p.h}`
      }
      return jsonResponse({ success: true, probe: out }, 200, req)
    }

    const batchSize = Math.min(Number(body.batch_size) || 25, 200)
    const sourceType: string | undefined = body.source_type
    const dryRun = body.dry_run === true
    const pacer = new HostPacer(Number(body.host_gap_ms) || 2500)
    // Leave room under the platform's ceiling so the write phase always lands.
    const deadline = Date.now() + (Number(body.max_ms) || 110_000)

    const { data, error } = await supabase.rpc('marketplace_image_upscale_worklist', {
      p_limit: batchSize,
      p_source_type: sourceType ?? null,
    })
    if (error) return errorResponse(error.message, 500, req)
    const rows = (data ?? []) as Row[]
    if (!rows.length) {
      return jsonResponse({ success: true, processed: 0, message: 'nothing to upscale' }, 200, req)
    }

    let upgraded = 0
    let mirrored = 0
    let unchanged = 0
    let skipped = 0
    let listingsChanged = 0
    let deadAssets = 0
    const skipReasons: Record<string, number> = {}
    const candidateErrors: Record<string, number> = {}

    /**
     * Per-host evidence, used to tell a DEAD ASSET from a BLOCKED CALLER.
     *
     * Both arrive as 403 — Magento answers a missing file that way, and so does
     * a WAF — and the two need opposite handling: a dead asset must be stamped
     * so the work-list drains, a block must NOT be, or the merchant is written
     * off permanently. Guessing wrong in either direction is how this job spent
     * a day being "unfixable" and then, once fixed, never terminating.
     *
     * The discriminator is corroboration within the same run: if this host
     * answered 200 even once, it is talking to us, and its 403s are about the
     * individual file. Zero successes means we cannot tell, so we do not judge.
     */
    const hostOk = new Map<string, number>()
    const hostFail = new Map<string, number>()
    const hostOf = (u: string) => {
      try {
        return new URL(u).hostname
      } catch {
        return '?'
      }
    }
    const note = (u: string, p: Probe) => {
      const h = hostOf(u)
      const m = p.error ? hostFail : hostOk
      m.set(h, (m.get(h) ?? 0) + 1)
      return p
    }
    const measure = (u: string) => pacer.run(u, async () => note(u, await probe(u)))
    const examined: string[] = []
    let stoppedOnDeadline = false

    for (const row of rows) {
      if (Date.now() > deadline) {
        stoppedOnDeadline = true
        break
      }
      const images = row.images ?? []
      const next = [...images]
      let changedCover: { url: string; mirror: string | null } | null = null
      let changed = false
      let blocked = false
      const touchedHosts = new Set<string>()
      const candidateHosts = new Set<string>()

      for (let i = 0; i < images.length; i++) {
        const url = images[i]
        if (!url) continue
        if (Date.now() > deadline) {
          stoppedOnDeadline = true
          break
        }

        const candidates = upscaleCandidates(url).filter((c) => !looksLikePlaceholder(c.url))
        if (!candidates.length) {
          unchanged++
          continue
        }

        // Baseline is what the READER sees. misterb's stored cache URLs are all
        // 403 (Magento answers a purged derivative that way), so comparing
        // against the stored URL alone skipped the entire merchant.
        let base = await measure(url)
        if (base.error && i === 0 && row.served_url && row.served_url !== url) {
          const served = await measure(row.served_url)
          if (served.w) base = served
        }
        if (base.error) {
          skipped++
          blocked = true
          touchedHosts.add(hostOf(url))
          skipReasons[base.error] = (skipReasons[base.error] ?? 0) + 1
          continue
        }

        let best: { url: string; probe: Probe } | null = null
        // A candidate we could not MEASURE is not a candidate we rejected.
        // Without this distinction a blocked probe falls through to "unchanged"
        // and the listing then gets STAMPED — writing the merchant off on the
        // strength of a 403. Measured on the first live run: 6 misterb listings
        // reported unchanged when in fact every candidate had been refused.
        let candidatesMeasured = 0
        for (const c of candidates) {
          const got = await measure(c.url)
          if (got.error || !got.w || !got.h) {
            candidateErrors[got.error ?? 'unknown'] = (candidateErrors[got.error ?? 'unknown'] ?? 0) + 1
            candidateHosts.add(hostOf(c.url))
            continue
          }
          candidatesMeasured++
          if (!isRealUpgrade({ w: base.w!, h: base.h! }, { w: got.w, h: got.h }, c.preservesAspect)) continue
          if (!best || got.w > best.probe.w!) best = { url: c.url, probe: got }
        }
        if (!best) {
          if (candidatesMeasured === 0) {
            // Nothing was looked at; this listing has not been judged — unless
            // the host is demonstrably answering us, in which case the files
            // themselves are gone and the row is genuinely finished.
            blocked = true
            for (const h of candidateHosts) touchedHosts.add(h)
            skipped++
          } else {
            unchanged++
          }
          continue
        }

        upgraded++
        next[i] = best.url
        changed = true

        if (i === 0 && !dryRun) {
          // Mirror the cover so rendering stops depending on the merchant.
          const type = best.probe.contentType ?? ''
          const mirror = ALLOWED_TYPES.has(type)
            ? await mirrorImageToR2(best.probe.bytes!, type, R2_PREFIX)
            : null
          if (mirror) mirrored++
          changedCover = { url: best.url, mirror }
        }
      }

      if (!dryRun && changed) {
        listingsChanged++
        const { error: updErr } = await supabase
          .from('marketplace_listings')
          .update({ images: next, updated_at: new Date().toISOString() })
          .eq('id', row.id)
        if (updErr) console.error(`[upscale] listing ${row.id}: ${updErr.message}`)

        if (changedCover) {
          const { error: linkErr } = await supabase.rpc('marketplace_set_cover_asset', {
            p_listing_id: row.id,
            p_url: changedCover.url,
            p_optimized_url: changedCover.mirror,
          })
          if (linkErr) console.error(`[upscale] cover link ${row.id}: ${linkErr.message}`)
        }
      }

      // A listing whose images could not be MEASURED is left unstamped ONLY
      // when the host gave us no evidence either way. If it answered other
      // requests in this same run, the missing file is the merchant's, not
      // ours, and stamping is what lets the work-list finish.
      if (!blocked) {
        examined.push(row.id)
      } else if ([...touchedHosts].every((h) => (hostOk.get(h) ?? 0) > 0)) {
        examined.push(row.id)
        deadAssets++
      }
    }

    if (!dryRun && examined.length) {
      const { error: stampErr } = await supabase.rpc('marketplace_stamp_image_upscale', { p_ids: examined })
      if (stampErr) console.error(`[upscale] stamp: ${stampErr.message}`)
    }

    return jsonResponse(
      {
        success: true,
        processed: rows.length,
        listings_changed: listingsChanged,
        upgraded,
        mirrored,
        unchanged,
        skipped,
        stamped: dryRun ? 0 : examined.length,
        left_unstamped: rows.length - examined.length,
        skip_reasons: skipReasons,
        candidate_errors: candidateErrors,
        dead_assets: deadAssets,
        host_ok: Object.fromEntries(hostOk),
        host_fail: Object.fromEntries(hostFail),
        stopped_on_deadline: stoppedOnDeadline,
        dry_run: dryRun,
      },
      200,
      req,
    )
  } catch (e) {
    return errorResponse((e as Error).message, 500, req)
  }
})
