import { describe, it, expect } from "vitest";
import { resolveSession } from "../src/sessionCookie";
import type { Env } from "../src/index";

/**
 * The contract `handleTrack`'s write gate stands on.
 *
 * `/track` writes `user_events` with the service key, and until 2026-09-20 it
 * wrote for ANY caller: measured on prod, a POST with a forged `Origin` and no
 * cookie reached field validation, so CORS rejected nothing. Origin-locking
 * only sets response headers — the browser enforces them and curl does not,
 * which the worker's own comment already conceded.
 *
 * `resolveSession` has returned `verified` since bug #14 and nothing read it.
 * These tests pin the three properties the gate needs to be both safe and
 * survivable; if any of them changes, the gate either stops protecting or
 * starts eating real traffic, and neither is visible from the call site.
 */

const SECRET = "test-session-signing-key-please-ignore";
const env = { SESSION_SIGNING_KEY: SECRET } as unknown as Env;

function post(cookie?: string): Request {
  return new Request("https://search.queer.guide/track", {
    method: "POST",
    headers: cookie ? { Cookie: cookie } : {},
  });
}

/** Round-trip a mint so the test signs with the real code, never a fixture. */
async function mintCookieValue(): Promise<string> {
  const minted = await resolveSession(post(), env, undefined);
  const setCookie = minted.setCookie;
  if (!setCookie) throw new Error("expected a Set-Cookie when minting");
  return setCookie.split(";")[0]; // "qg_sid=<token>"
}

describe("track write gate — resolveSession contract", () => {
  it("a cookie-less caller is NOT verified, so the gate refuses the write", async () => {
    // This is the crawler and the curl case. Over 7 days on prod, 99.6% of
    // behavioural events came from sessions holding exactly one event — the
    // signature of a client that never returns a cookie.
    const s = await resolveSession(post(), env, undefined);
    expect(s.verified, "no cookie must never be treated as a verified session").toBe(false);
  });

  it("the refusal still mints a Set-Cookie, or no client could ever bootstrap", async () => {
    // Load-bearing: the gate returns 202 WITH this header. Drop it and every
    // real browser is permanently stuck on its first request.
    const s = await resolveSession(post(), env, undefined);
    expect(s.setCookie, "an unverified caller must be given a cookie to come back with").toBeTruthy();
    expect(s.setCookie).toContain("HttpOnly");
    expect(s.setCookie).toContain("Secure");
  });

  it("a validly signed cookie IS verified, so real browsers keep being tracked", async () => {
    // The positive control. Without it, a resolveSession that returned false
    // unconditionally would satisfy both assertions above while silently
    // dropping 100% of telemetry.
    const cookie = await mintCookieValue();
    const s = await resolveSession(post(cookie), env, undefined);
    expect(s.verified, "a signed cookie must verify, or the gate eats real traffic").toBe(true);
    expect(s.setCookie, "an already-verified session needs no re-mint").toBeNull();
  });

  it("a forged cookie does not verify", async () => {
    const s = await resolveSession(post("qg_sid=not-a-real-signature"), env, undefined);
    expect(s.verified).toBe(false);
  });

  it("a body-supplied session_id cannot confer verification", async () => {
    // The body is attacker-controlled. It may seed the id, never the trust:
    // if it could, the gate would be bypassable by typing a string.
    const s = await resolveSession(post(), env, "attacker-supplied-session");
    expect(s.verified).toBe(false);
  });
});
