import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
import { dispatchEmail, type OutboxRow } from "./email-outbox.ts";

const row: OutboxRow = {
  id: "a1111111-0000-4000-8000-000000000001",
  lease_id: "b1111111-0000-4000-8000-000000000001",
  status: "processing",
  payload: { to: "member@example.com", subject: "Activity" },
  provider_id: null,
  last_error: null,
};

async function configured(run: () => Promise<void>) {
  const priorUrl = Deno.env.get("EMAIL_GATEWAY_URL");
  const priorSecret = Deno.env.get("EMAIL_GATEWAY_SECRET");
  const priorFetch = globalThis.fetch;
  Deno.env.set("EMAIL_GATEWAY_URL", "https://email.example.com");
  Deno.env.set("EMAIL_GATEWAY_SECRET", "test-only-secret");
  try {
    await run();
  } finally {
    globalThis.fetch = priorFetch;
    if (priorUrl === undefined) Deno.env.delete("EMAIL_GATEWAY_URL");
    else Deno.env.set("EMAIL_GATEWAY_URL", priorUrl);
    if (priorSecret === undefined) Deno.env.delete("EMAIL_GATEWAY_SECRET");
    else Deno.env.set("EMAIL_GATEWAY_SECRET", priorSecret);
  }
}

Deno.test("erased or cancelled claims never cross the delivery boundary", () =>
  configured(async () => {
    const calls: string[] = [];
    globalThis.fetch = () => {
      throw new Error("must not send");
    };
    const db = {
      rpc: (name: string) => {
        calls.push(name);
        return Promise.resolve({ data: false, error: null });
      },
    } as unknown as SupabaseClient;
    await dispatchEmail(db, row);
    assertEquals(calls, ["email_dispatch_authorize"]);
  }));

Deno.test("eligibility read errors fail closed instead of submitting stale payload", () =>
  configured(async () => {
    globalThis.fetch = () => {
      throw new Error("must not send");
    };
    const db = {
      rpc: () =>
        Promise.resolve({ data: null, error: { message: "unavailable" } }),
    } as unknown as SupabaseClient;
    await assertRejects(
      () => dispatchEmail(db, row),
      Error,
      "Could not validate",
    );
  }));

Deno.test("a current claim submits its immutable identity and persists only the real receipt", () =>
  configured(async () => {
    const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
    globalThis.fetch = (_url, options) => {
      const submitted = options && "body" in options ? options.body : undefined;
      assertEquals(JSON.parse(String(submitted)), {
        ...row.payload,
        id: row.id,
      });
      return Promise.resolve(
        Response.json({ status: "accepted", id: "cf-receipt" }),
      );
    };
    const db = {
      rpc: (name: string, input: Record<string, unknown>) => {
        calls.push({ name, input });
        return Promise.resolve({ data: true, error: null });
      },
    } as unknown as SupabaseClient;
    await dispatchEmail(db, row);
    assertEquals(calls[0], {
      name: "email_dispatch_authorize",
      input: { p_id: row.id, p_lease: row.lease_id },
    });
    assertEquals(calls[1].name, "email_finish");
    assertEquals(calls[1].input.p_provider_id, "cf-receipt");
    assertEquals(calls[1].input.p_status, "accepted");
  }));
