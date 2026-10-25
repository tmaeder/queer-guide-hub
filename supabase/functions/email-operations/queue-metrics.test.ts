import { readEmailQueueMetrics } from "./queue-metrics.ts";
const empty = {
  available: true,
  backlog_count: 0,
  backlog_bytes: 0,
  oldest_message_at: null,
};
const unknown = {
  available: false,
  backlog_count: null,
  backlog_bytes: null,
  oldest_message_at: null,
};
const data = {
  observed_at: "2026-10-25T18:00:00Z",
  events: empty,
  dead_letter: unknown,
};
function assert(value: unknown): asserts value {
  if (!value) throw new Error("Assertion failed");
}
Deno.test("queue health reads only the authenticated gateway and distinguishes unknown from zero", async () => {
  let calls = 0;
  const result = await readEmailQueueMetrics({
    url: "https://gateway/send",
    secret: "fixture",
    request: async (url, options) => {
      calls++;
      assert(String(url) === "https://gateway/queues/metrics");
      assert(options?.method === "GET");
      assert(options.redirect === "error");
      assert(options.signal instanceof AbortSignal);
      assert(
        (options.headers as Record<string, string>).Authorization ===
          "Bearer fixture",
      );
      return Response.json(data);
    },
  });
  assert(calls === 1);
  assert(result?.events.backlog_count === 0);
  assert(result.dead_letter.available === false);
  assert(result.dead_letter.backlog_count === null);
});
Deno.test("queue health rejects malformed evidence rather than reporting an empty queue", async () => {
  for (
    const bad of [
      { ...data, observed_at: "invalid" },
      { ...data, events: { ...empty, backlog_count: -1 } },
      { ...data, dead_letter: { ...unknown, backlog_count: 0 } },
      { ...data, events: { ...empty, backlog_count: 0.5 } },
    ]
  ) {
    const result = await readEmailQueueMetrics({
      url: "https://gateway",
      secret: "fixture",
      request: async () => Response.json(bad),
    });
    assert(result === null);
  }
});
Deno.test("gateway outages, timeout, oversized output and insecure configuration leave queue health unavailable", async () => {
  for (
    const request of [
      async () => new Response("unavailable", { status: 503 }),
      async () => {
        throw new DOMException("timeout", "AbortError");
      },
      async () => new Response("x".repeat(17000)),
    ]
  ) {
    assert(
      await readEmailQueueMetrics({
        url: "https://gateway",
        secret: "fixture",
        request,
      }) === null,
    );
  }
  let called = false;
  assert(
    await readEmailQueueMetrics({
      url: "http://gateway",
      secret: "fixture",
      request: async () => {
        called = true;
        return Response.json(data);
      },
    }) === null,
  );
  assert(!called);
});
