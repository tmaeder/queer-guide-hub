import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
import {
  type JourneyTask,
  processJourneyTask,
} from "./email-journey-worker.ts";
const task: JourneyTask = {
  run_id: "run",
  lease: "lease",
  user_id: "member",
  step_id: "welcome",
  node: { type: "welcome" },
};
Deno.test("a paused or erased journey does not invoke its email action", async () => {
  let invoked = false;
  const calls: string[] = [];
  const db = {
    rpc: (name: string) => {
      calls.push(name);
      return Promise.resolve({ data: false, error: null });
    },
  } as unknown as SupabaseClient;
  assertEquals(
    await processJourneyTask(db, task, () => {
      invoked = true;
      return Promise.resolve();
    }),
    "held",
  );
  assertEquals(invoked, false);
  assertEquals(calls, ["email_journey_run_allowed"]);
});
Deno.test("an eligibility outage fails closed without a send or an invented step result", async () => {
  const db = {
    rpc: () =>
      Promise.resolve({ data: null, error: { message: "unavailable" } }),
  } as unknown as SupabaseClient;
  await assertRejects(
    () =>
      processJourneyTask(db, task, () => {
        throw new Error("must not invoke");
      }),
    Error,
    "eligibility unavailable",
  );
});
Deno.test("an action response cannot bypass the database provider-receipt requirement", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const db = {
    rpc: (name: string, input: Record<string, unknown>) => {
      calls.push({ name, ...input });
      if (name === "email_journey_run_allowed" || input.p_error) {
        return Promise
          .resolve({ data: true, error: null });
      }
      return Promise.resolve({
        data: null,
        error: { message: "journey_receipt_required" },
      });
    },
  } as unknown as SupabaseClient;
  assertEquals(
    await processJourneyTask(db, task, () => Promise.resolve()),
    "action_failed",
  );
  assertEquals(calls[2].p_error, "transactional_action_failed");
  assertEquals(calls[2].p_lease, task.lease);
});
Deno.test("control steps never invoke email and stale completion is held", async () => {
  const db = {
    rpc: (name: string) =>
      Promise.resolve({
        data: name === "email_journey_run_allowed",
        error: null,
      }),
  } as unknown as SupabaseClient;
  assertEquals(
    await processJourneyTask(db, { ...task, node: { type: "branch" } }, () => {
      throw new Error("must not send");
    }),
    "held",
  );
});
