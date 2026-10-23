import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleMailboxSend } from "./handler.ts";
type Dependencies = NonNullable<Parameters<typeof handleMailboxSend>[1]>;
const actor = "88888888-0000-4000-8000-000000000001";
const requestId = "88888888-0000-4000-8000-000000000010";
function fixture(initial = "queued", brokenReceipt = false) {
  let status = initial;
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let dispatches = 0;
  const receipt = () => ({
    outbox_id: "fixture-outbox",
    email_id: "fixture-copy",
    status,
    provider_id: status === "accepted" || status === "delivered"
      ? "cf-fixture"
      : null,
  });
  const db = {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: actor } }, error: null }),
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "email_mailbox_prepare") {
        return Promise.resolve({ data: receipt(), error: null });
      }
      if (name === "email_claim") {
        return Promise.resolve({
          data: [{
            id: "fixture-outbox",
            lease_id: "lease",
            status: "processing",
            payload: {},
            provider_id: null,
            last_error: null,
          }],
          error: null,
        });
      }
      if (name === "email_mailbox_status") {
        return Promise.resolve(
          brokenReceipt
            ? { data: null, error: { message: "read unavailable" } }
            : { data: receipt(), error: null },
        );
      }
      throw new Error("Unexpected RPC");
    },
  } as unknown as Dependencies["db"];
  const deps: Dependencies = {
    db,
    configured: () => true,
    dispatch: async () => {
      dispatches++;
      status = "accepted";
    },
  };
  return { deps, calls, dispatches: () => dispatches };
}
function request(extra: Record<string, unknown> = {}) {
  return new Request("https://fixture.invalid", {
    method: "POST",
    headers: { Authorization: "Bearer fixture-auth" },
    body: JSON.stringify({
      request_id: requestId,
      to: "recipient@example.com",
      subject: "Requested reply",
      body_text: "Fixture",
      ...extra,
    }),
  });
}
Deno.test("mailbox submission authenticates before preparing or dispatching", async () => {
  const f = fixture();
  assertEquals(
    (await handleMailboxSend(
      new Request("https://fixture.invalid", { method: "POST" }),
      f.deps,
    )).status,
    401,
  );
  assertEquals(f.calls.length, 0);
  assertEquals(f.dispatches(), 0);
});
Deno.test("mailbox owner comes from Auth and acceptance is not reported as delivery", async () => {
  const f = fixture();
  const response = await handleMailboxSend(request(), f.deps);
  assertEquals(response.status, 200);
  assertEquals((await response.json()).delivery_status, "accepted");
  assertEquals(f.calls[0].args.p_user, actor);
  assertEquals(f.calls[0].args.p_request, requestId);
  assertEquals(f.calls[1].args, { p_limit: 1, p_id: "fixture-outbox" });
  assertEquals(f.dispatches(), 1);
});
Deno.test("caller supplied ownership, sender and missing request identity are rejected without writes", async () => {
  for (
    const extra of [{ owner_id: actor }, { from: "forged@example.com" }, {
      request_id: null,
    }]
  ) {
    const f = fixture();
    assertEquals((await handleMailboxSend(request(extra), f.deps)).status, 400);
    assertEquals(f.calls.length, 0);
    assertEquals(f.dispatches(), 0);
  }
});
Deno.test("uncertain and accepted replays never initiate a fresh provider submission", async () => {
  for (const status of ["uncertain", "accepted", "delivered", "deferred"]) {
    const f = fixture(status);
    const response = await handleMailboxSend(request(), f.deps);
    assertEquals((await response.json()).delivery_status, status);
    assertEquals(f.dispatches(), 0);
  }
});
Deno.test("a failed receipt read returns the saved identity and pending confirmation", async () => {
  const f = fixture("queued", true);
  const response = await handleMailboxSend(request(), f.deps);
  assertEquals(response.status, 202);
  assertEquals(await response.json(), {
    success: true,
    email_id: "fixture-copy",
    outbox_id: "fixture-outbox",
    provider_id: null,
    resend_id: null,
    delivery_status: "pending",
  });
  assertEquals(f.dispatches(), 1);
});
Deno.test("terminal failure is retained without resending and oversized bodies are bounded", async () => {
  const f = fixture("bounced");
  assertEquals((await handleMailboxSend(request(), f.deps)).status, 422);
  assertEquals(f.dispatches(), 0);
  const oversized = fixture();
  assertEquals(
    (await handleMailboxSend(
      request({ body_text: "x".repeat(128001) }),
      oversized.deps,
    )).status,
    413,
  );
  assertEquals(oversized.calls.length, 0);
});
