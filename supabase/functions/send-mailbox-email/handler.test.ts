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

const copyId = "88888888-0000-4000-8000-000000000030";
function readFixture(
  options: {
    source?: boolean;
    status?: string;
    error?: string;
    removed?: boolean;
  } = {},
) {
  const filters: [string, unknown][] = [];
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const chain = {
    select: (columns: string) => {
      assertEquals(columns, "request_id");
      return chain;
    },
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return chain;
    },
    maybeSingle: () =>
      Promise.resolve({
        data: options.source === false ? null : { request_id: requestId },
        error: null,
      }),
  };
  const db = {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: actor } }, error: null }),
    },
    from: (table: string) => {
      assertEquals(table, "email_mailbox_sends");
      return chain;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      assertEquals(name, "email_mailbox_status");
      return Promise.resolve({
        data: options.removed ? null : {
          email_id: copyId,
          status: options.status ?? "accepted",
          provider_id: "private-provider",
          outbox_id: "private-outbox",
        },
        error: options.error ? { message: options.error } : null,
      });
    },
  } as unknown as Dependencies["db"];
  return {
    filters,
    calls,
    deps: {
      db,
      configured: () => {
        throw new Error("Reads must not inspect transport");
      },
      dispatch: () => {
        throw new Error("Reads must never dispatch");
      },
    } as Dependencies,
  };
}
function readRequest(query = `email_id=${copyId}`) {
  return new Request(`https://fixture.invalid?${query}`, {
    headers: { Authorization: "Bearer fixture-auth" },
  });
}
Deno.test("mailbox receipt GET is owner-bound, private, minimal and cannot send", async () => {
  const f = readFixture();
  const response = await handleMailboxSend(readRequest(), f.deps);
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Cache-Control"), "no-store");
  assertEquals(await response.json(), { delivery_status: "accepted" });
  assertEquals(f.filters, [["owner_id", actor], ["mailbox_email_id", copyId]]);
  assertEquals(f.calls, [{
    name: "email_mailbox_status",
    args: { p_user: actor, p_request: requestId },
  }]);
});
Deno.test("receipt GET rejects missing, duplicate or caller-authored ownership parameters before reads", async () => {
  for (
    const query of [
      "",
      "email_id=invalid",
      `email_id=${copyId}&owner_id=${actor}`,
      `email_id=${copyId}&email_id=${copyId}`,
    ]
  ) {
    const f = readFixture();
    assertEquals(
      (await handleMailboxSend(readRequest(query), f.deps)).status,
      400,
    );
    assertEquals(f.filters, []);
    assertEquals(f.calls, []);
  }
  const f = readFixture();
  assertEquals(
    (await handleMailboxSend(
      new Request(`https://fixture.invalid?email_id=${copyId}`),
      f.deps,
    )).status,
    401,
  );
  assertEquals(f.filters, []);
});
Deno.test("foreign, legacy, deleted and erased copies reveal no receipt identity", async () => {
  for (const options of [{ source: false }, { removed: true }]) {
    const f = readFixture(options);
    const response = await handleMailboxSend(readRequest(), f.deps);
    assertEquals(await response.json(), { delivery_status: null });
    assertEquals(f.calls.length, options.source === false ? 0 : 1);
  }
});
Deno.test("receipt GET rejects disabled owners and unknown provider states without a delivery claim", async () => {
  for (
    const options of [{ error: "operator_account_disabled" }, {
      status: "sent",
    }, { error: "internal details must not escape" }]
  ) {
    const f = readFixture(options);
    const response = await handleMailboxSend(readRequest(), f.deps);
    assertEquals(
      response.status,
      options.error === "operator_account_disabled" ? 403 : 503,
    );
    assertEquals(await response.json(), {
      error: "Delivery status could not be read.",
    });
    assertEquals(f.calls.length, 1);
  }
});
