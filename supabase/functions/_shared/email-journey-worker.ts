import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
export interface JourneyTask {
  run_id: string;
  lease: string;
  user_id: string;
  step_id: string;
  node: { type: string };
}
export async function processJourneyTask(
  db: SupabaseClient,
  task: JourneyTask,
  invokeWelcome: (task: JourneyTask) => Promise<void>,
): Promise<"advanced" | "held" | "action_failed"> {
  const eligible = await db.rpc("email_journey_run_allowed", {
    p_run: task.run_id,
    p_lease: task.lease,
  });
  if (eligible.error) throw new Error("Journey eligibility unavailable");
  if (eligible.data !== true) return "held";
  try {
    if (task.node.type === "welcome") await invokeWelcome(task);
    else if (!["wait", "branch", "end"].includes(task.node.type)) {
      throw new Error("Unsupported journey action");
    }
    // SQL decides the branch using current profile state and requires the
    // canonical provider receipt before completing any welcome step.
    const advanced = await db.rpc("email_journey_advance", {
      p_run: task.run_id,
      p_lease: task.lease,
    });
    if (advanced.error) throw new Error("Journey result unavailable");
    return advanced.data === true ? "advanced" : "held";
  } catch {
    const retry = await db.rpc("email_journey_advance", {
      p_run: task.run_id,
      p_lease: task.lease,
      p_error: "transactional_action_failed",
    });
    if (retry.error) throw new Error("Journey retry unavailable");
    return retry.data === true ? "action_failed" : "held";
  }
}
