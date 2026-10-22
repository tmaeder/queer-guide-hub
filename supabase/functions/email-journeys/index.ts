import {
  getCorsHeaders,
  getServiceClient,
  jsonResponse,
  requireAdmin,
  requireInternalOrAdmin,
} from "../_shared/supabase-client.ts";
import { isEmailConfigured } from "../_shared/email.ts";
import { readEmailGatewayReceipt } from "../_shared/email-gateway-receipt.ts";
import {
  type JourneyTask,
  processJourneyTask,
} from "../_shared/email-journey-worker.ts";
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const db = getServiceClient();
  const result = (data: unknown, status = 200) =>
    jsonResponse(data, status, req);
  // Authenticate before reading a body. Internal cron may tick; publishing
  // always requires the existing administrator/service-role authorization.
  const gate = req.method === "POST"
    ? await requireInternalOrAdmin(req, db)
    : await requireAdmin(req, db);
  if (gate instanceof Response) return gate;
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      const runId = url.searchParams.get("run_id");
      const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (
        (id && !uuid.test(id)) || (runId && !uuid.test(runId)) || (id && runId)
      ) {
        return result({ error: "Choose one valid journey or run" }, 400);
      }
      if (id) {
        const journey = await db.from("email_journeys").select("*")
          .eq("id", id).maybeSingle();
        if (journey.error) throw journey.error;
        if (!journey.data) return result({ error: "Journey not found" }, 404);
        const version = await db.from("email_journey_versions").select("*")
          .eq("journey_id", id).eq("version", journey.data.version).single();
        if (version.error) throw version.error;
        return result({ journey: journey.data, version: version.data });
      }
      if (runId) {
        const [run, steps] = await Promise.all([
          db.from("email_journey_runs").select(
            "id,journey_id,version,step_id,status,due_at,attempts,total_steps,last_error,created_at",
          ).eq("id", runId).maybeSingle(),
          db.from("email_journey_steps").select(
            "step_id,kind,outcome,completed_at",
          ).eq("run_id", runId).order("completed_at", { ascending: true }),
        ]);
        if (run.error || steps.error) {
          throw new Error("Run history unavailable");
        }
        if (!run.data) return result({ error: "Run not found" }, 404);
        return result({ run: run.data, steps: steps.data });
      }
      const [journeys, runs, versions] = await Promise.all([
        db.from("email_journeys").select("*").order("updated_at", {
          ascending: false,
        }).limit(100),
        db.from("email_journey_runs").select(
          "id,journey_id,version,user_id,step_id,status,due_at,attempts,total_steps,last_error,created_at",
        ).order("created_at", { ascending: false }).limit(100),
        db.from("email_journey_versions").select("*").order("created_at", {
          ascending: false,
        }).limit(100),
      ]);
      if (journeys.error || runs.error || versions.error) {
        throw new Error("Journey overview unavailable");
      }
      return result({
        journeys: journeys.data,
        runs: runs.data,
        versions: versions.data,
        supportedActions: ["wait", "branch", "welcome", "end"],
        marketing: false,
      });
    }
    if (req.method !== "POST") {
      return result({ error: "Method not allowed" }, 405);
    }
    const raw = await req.text();
    if (raw.length > 20000) return result({ error: "Request too large" }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return result({ error: "Invalid request" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return result({ error: "Invalid request" }, 400);
    }
    if (body.action === "cancel") {
      const actor = await requireAdmin(req, db);
      if (actor instanceof Response) return actor;
      if (
        typeof body.run_id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.run_id)
      ) return result({ error: "Run required" }, 400);
      const cancelled = await db.rpc("email_journey_cancel", {
        p_run: body.run_id,
        p_actor: actor.isServiceRole ? null : actor.userId,
      });
      if (cancelled.error) throw cancelled.error;
      return result(
        cancelled.data
          ? { cancelled: true }
          : { error: "Run cannot be cancelled" },
        cancelled.data ? 200 : 409,
      );
    }
    if (body.action === "save") {
      const actor = await requireAdmin(req, db);
      if (actor instanceof Response) return actor;
      if (
        typeof body.name !== "string" || !body.definition ||
        typeof body.definition !== "object" ||
        typeof body.trigger_event !== "string" ||
        typeof body.trigger_state !== "string"
      ) return result({ error: "Invalid journey" }, 400);
      if (body.status === "active" && !isEmailConfigured()) {
        return result({
          error: "Cloudflare delivery must be configured before activation",
        }, 503);
      }
      if (
        body.status === "active" &&
        Object.values(body.definition.steps ?? {}).some((node) =>
          node !== null && typeof node === "object" && "type" in node &&
          node.type === "welcome"
        )
      ) {
        const template = await db.from("email_templates").select("template_key")
          .eq("template_key", "welcome").eq("is_active", true).maybeSingle();
        if (template.error) throw template.error;
        if (!template.data) {
          return result({ error: "Active welcome template required" }, 400);
        }
      }
      const { data, error } = await db.rpc("email_journey_save", {
        p_name: body.name,
        p_event: body.trigger_event,
        p_state: body.trigger_state,
        p_definition: body.definition,
        p_reentry: body.reentry ?? "once_per_account",
        p_status: body.status ?? "draft",
        p_actor: actor.isServiceRole ? null : actor.userId,
        p_id: body.id ?? null,
        p_expected_version: body.expected_version ?? null,
      });
      if (error) {
        if (error.code === "40001") {
          return result(
            { error: "Journey changed. Reload before saving." },
            409,
          );
        }
        if (["22023", "22P02", "23514"].includes(error.code)) {
          return result({ error: "Invalid or unsupported journey" }, 400);
        }
        if (error.code === "P0002") {
          return result({ error: "Journey not found" }, 404);
        }
        throw error;
      }
      return result({ journey: data });
    }
    if (body.action !== "tick") return result({ error: "Unknown action" }, 400);
    if (!isEmailConfigured()) {
      return result({ error: "Cloudflare delivery not configured" }, 503);
    }
    const origin = new URL(Deno.env.get("SUPABASE_URL") ?? "");
    if (origin.protocol !== "https:") throw new Error("HTTPS backend required");
    const enrolled = await db.rpc("email_journey_enroll", { p_limit: 100 });
    if (enrolled.error) throw enrolled.error;
    const claimed = await db.rpc("email_journey_claim", { p_limit: 5 });
    if (claimed.error) throw claimed.error;
    const outcomes = await Promise.allSettled(
      ((claimed.data ?? []) as JourneyTask[]).map((task) =>
        processJourneyTask(db, task, async (step) => {
          const response = await fetch(
            new URL("/functions/v1/send-welcome-email", origin),
            {
              method: "POST",
              redirect: "error",
              signal: AbortSignal.timeout(22000),
              headers: {
                Authorization: `Bearer ${
                  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
                }`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                user_id: step.user_id,
                journey: {
                  runId: step.run_id,
                  leaseId: step.lease,
                  stepId: step.step_id,
                },
              }),
            },
          );
          if (!response.ok) {
            await response.body?.cancel();
            throw new Error("Welcome action failed");
          }
          const receipt = await readEmailGatewayReceipt(response);
          if (!["sent", "already_sent"].includes(String(receipt.status))) {
            throw new Error("Welcome action unconfirmed");
          }
        })
      ),
    );
    return result(
      {
        enrolled: enrolled.data,
        advanced: outcomes.filter((o) =>
          o.status === "fulfilled" && o.value === "advanced"
        ).length,
        held: outcomes.filter((o) =>
          o.status === "fulfilled" && o.value === "held"
        ).length,
        action_failures: outcomes.filter((o) =>
          o.status === "fulfilled" && o.value === "action_failed"
        ).length,
        failed: outcomes.filter((o) =>
          o.status === "rejected"
        ).length,
      },
      outcomes.some((o) =>
          o.status === "rejected" ||
          (o.status === "fulfilled" && o.value === "action_failed")
        )
        ? 503
        : 200,
    );
  } catch {
    return result({ error: "Email journeys unavailable" }, 503);
  }
});
