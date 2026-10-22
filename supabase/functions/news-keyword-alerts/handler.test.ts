import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleNewsKeywordAlerts } from "./handler.ts";
Deno.test("saved editorial alerts report provider blocking without reading data, sending, or advancing cadence", async () => {
  const prior = Deno.env.get("NEWS_ALERTS_WEBHOOK_SECRET"),
    originalFetch = globalThis.fetch;
  let requests = 0;
  try {
    Deno.env.set("NEWS_ALERTS_WEBHOOK_SECRET", "fixture-only");
    globalThis.fetch = () => {
      ++requests;
      throw new Error("Unexpected external request");
    };
    for (
      const header of [new Headers({ "x-webhook-secret": "fixture-only" }), {
        authorization: "Bearer fixture-only",
      }]
    ) {
      const response = handleNewsKeywordAlerts(
        new Request("https://fixture.invalid", {
          method: "POST",
          headers: header,
        }),
      );
      assertEquals(response.status, 200);
      assertEquals(await response.json(), {
        processed: 0,
        category: "newsletter",
        dispatch_available: false,
        reason: "cloudflare_transactional_only",
      });
    }
    assertEquals(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (prior === undefined) Deno.env.delete("NEWS_ALERTS_WEBHOOK_SECRET");
    else Deno.env.set("NEWS_ALERTS_WEBHOOK_SECRET", prior);
  }
});
Deno.test("saved alert endpoint fails closed without a configured webhook secret", () => {
  const prior = Deno.env.get("NEWS_ALERTS_WEBHOOK_SECRET");
  try {
    Deno.env.delete("NEWS_ALERTS_WEBHOOK_SECRET");
    assertEquals(
      handleNewsKeywordAlerts(
        new Request("https://fixture.invalid", { method: "POST" }),
      ).status,
      401,
    );
  } finally {
    if (prior !== undefined) Deno.env.set("NEWS_ALERTS_WEBHOOK_SECRET", prior);
  }
});
