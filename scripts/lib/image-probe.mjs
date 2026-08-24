/**
 * Measure a remote image without downloading it, politely.
 *
 * ── Why curl and not `fetch` ────────────────────────────────────────────────
 * misterb.com answers Node (undici) and Python with 403 and curl with 200, for
 * identical headers — including no User-Agent at all. Header bisection came up
 * empty across UA, Accept, Accept-Encoding, Range and HTTP version, so the
 * discriminator is the TLS/HTTP2 fingerprint, which no fetch option can change.
 *
 * A dual-stack "try fetch, fall back to curl" arrangement was built first and
 * is WORSE than either alone: the flagged fetch trips the WAF, the shop blocks
 * the IP for a short window, and the curl retry inherits the block — so the
 * fallback reports failure for a host that would have answered curl on the
 * first try. One fetcher that nothing objects to beats two that interfere.
 *
 * ── Why this matters more than it looks ─────────────────────────────────────
 * Every caller uses these numbers to decide whether a better copy of an image
 * exists. A blocked request that reports as "no image" is absence of evidence
 * recorded as evidence of absence — the exact failure that wrote off 6,498
 * venues during the logo.dev outage. So a transport failure and a genuine
 * "this image is 135px" must never collapse into the same answer: this module
 * returns `{ error }` for the former and dimensions for the latter, and callers
 * must branch on it.
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { imageSize } from './image-size.mjs'

const execFileAsync = promisify(execFile)

export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** Read this many leading bytes. Every supported format carries its
 * dimensions well inside this, and the hash only needs to distinguish photos. */
const HEAD_BYTES = 65535

/**
 * Probe one image. Returns `{ w, h, fmt, hash }` or `{ error }`.
 *
 * `hash` is over the bytes actually read, not the whole file — it exists to
 * catch a storefront placeholder recurring across unrelated products, and two
 * different photos do not share 64 KB of leading bytes.
 */
export async function probeImage(url, { timeoutMs = 20000 } = {}) {
  const args = [
    '-sS',
    // Without `-f`, curl writes the ERROR BODY to stdout and exits 0, so a 403
    // HTML page arrives as bytes that simply are not an image and reports as
    // "unparsed" — a block wearing the costume of a broken image.
    '-f',
    '--max-time',
    String(Math.ceil(timeoutMs / 1000)),
    '-L',
    '-r',
    `0-${HEAD_BYTES}`,
    '-A',
    BROWSER_UA,
    '-o',
    '-',
  ]
  // The mirror host's WAF answers any other Referer with `error code: 1011`,
  // so an unreferered probe reads every mirrored asset as dead.
  if (url.includes('img.queer.guide')) args.push('-e', 'https://queer.guide/')
  args.push(url)

  try {
    const { stdout } = await execFileAsync('curl', args, {
      encoding: 'buffer',
      maxBuffer: 8 * 1024 * 1024,
    })
    const size = imageSize(stdout)
    if (!size) return { error: 'unparsed' }
    return { ...size, hash: createHash('sha256').update(stdout).digest('hex').slice(0, 16) }
  } catch (e) {
    if (e?.code === 22) return { error: 'http_error' }
    const why = String(e?.stderr ?? '').trim().split('\n').pop() || String(e?.code ?? e)
    return { error: why.slice(0, 90) }
  }
}

/**
 * Serialise probes per host, with a gap between them.
 *
 * A run scoped to one merchant draws every image from one small shop, so a
 * caller's "concurrency 6" is six simultaneous requests to that shop. Both
 * merchants with a WAF in this corpus (misterb, mr-s-leather) answer 403 to
 * that and 200 to a paced caller.
 */
export function createHostLimiter({ gapMs = 250 } = {}) {
  const queues = new Map()
  return function perHost(url, fn) {
    let host
    try {
      host = new URL(url).hostname
    } catch {
      return fn()
    }
    const prev = queues.get(host) ?? Promise.resolve()
    const next = prev.then(async () => {
      const out = await fn()
      await new Promise((r) => setTimeout(r, gapMs))
      return out
    })
    // Keep the chain alive past a rejection, and do not retain results — a
    // queue that holds every prior return value is a memory leak on a sweep
    // that touches hundreds of thousands of URLs.
    queues.set(
      host,
      next.then(
        () => undefined,
        () => undefined,
      ),
    )
    return next
  }
}
