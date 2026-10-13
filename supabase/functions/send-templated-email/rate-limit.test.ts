import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { takeEmailQuota } from "./rate-limit.ts";

Deno.test("email quota uses the atomic project limiter with a per-user hourly bucket", async () => {
  let captured: unknown;
  const result = await takeEmailQuota((name, args) => {
    captured = { name, args };
    return Promise.resolve({ data: true, error: null });
  }, "verified-admin");
  assertEquals(result, "allowed");
  assertEquals(captured, {
    name: "rate_limit_hit",
    args: {
      p_key: "send-templated-email|verified-admin",
      p_window: 3600,
      p_max: 100,
    },
  });
});
Deno.test("a consumed quota rejects the send", async () => {
  assertEquals(
    await takeEmailQuota(
      () => Promise.resolve({ data: false, error: null }),
      "admin",
    ),
    "limited",
  );
});
Deno.test("limiter RPC errors fail closed", async () => {
  assertEquals(
    await takeEmailQuota(
      () => Promise.resolve({ data: true, error: { code: "PGRST202" } }),
      "admin",
    ),
    "unavailable",
  );
});
Deno.test("missing or malformed limiter decisions fail closed", async () => {
  for (const data of [null, undefined, {}, "true", 1]) {
    assertEquals(
      await takeEmailQuota(
        () => Promise.resolve({ data, error: null }),
        "admin",
      ),
      "unavailable",
    );
  }
});
Deno.test("limiter transport errors fail closed", async () => {
  assertEquals(
    await takeEmailQuota(
      () => Promise.reject(new Error("Transport failed")),
      "admin",
    ),
    "unavailable",
  );
});
Deno.test("missing verified identity does not consume or bypass a quota", async () => {
  let called = false;
  assertEquals(
    await takeEmailQuota(() => {
      called = true;
      return Promise.resolve({ data: true, error: null });
    }, ""),
    "unavailable",
  );
  assertEquals(called, false);
});
