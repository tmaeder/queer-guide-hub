/**
 * SSRF guard — block fetches to private / loopback / link-local hosts.
 * Re-exports the shared implementation in ../../_shared/ssrf-guard.ts, which
 * also fixed a bypass this file's own regex set had: an IPv4-mapped-IPv6
 * literal (e.g. ::ffff:a9fe:a9fe, the WHATWG-normalized form of
 * 169.254.169.254 — cloud metadata) matched none of `UNSAFE_HOST_PATTERNS`.
 * Kept as its own file (rather than switching every import in this worker)
 * so no call site needs to change.
 */
export { assertPublicHttpUrl, UnsafeUrlError } from '../../_shared/ssrf-guard';
