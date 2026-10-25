import {
  getCorsHeaders,
  getServiceClient,
  jsonResponse,
  requireAdmin,
  requireInternalOrAdmin,
} from "../_shared/supabase-client.ts";
import { operationalEmail } from "../_shared/email-operational.ts";
import { fromHeader, getEmailBranding, wrapHtml } from "../_shared/branding.ts";
import { readEmailGatewayReceipt } from "../_shared/email-gateway-receipt.ts";
import { readEmailQueueMetrics } from "./queue-metrics.ts";

// Planning/maintenance has its own scheduler so a failed audience job cannot
// prevent essential transactional retries from draining the delivery outbox.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const db = getServiceClient();
  const actor = req.method === "POST"
    ? await requireInternalOrAdmin(req, db)
    : await requireAdmin(req, db);
  if (actor instanceof Response) return actor;
  const result = (body: unknown, status = 200) => {
    const response = jsonResponse(body, status, req);
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  try {
    if (req.method === "GET") {
      const [jobs, events, health, queues] = await Promise.all([
        db.from("email_campaign_audiences").select(
          "id,campaign_id,version,status,scanned,created_at,completed_at",
        )
          .order("created_at", { ascending: false }).limit(100),
        db.from("email_operator_events").select(
          "id,object_type,object_id,version,action,actor_id,created_at",
        )
          .order("created_at", { ascending: false }).limit(100),
        db.rpc("email_operations_health"),
        readEmailQueueMetrics(),
      ]);
      if (jobs.error || events.error || health.error) {
        throw new Error("Operations unavailable");
      }
      return result({
        jobs: jobs.data,
        events: events.data,
        health: health.data,
        queues,
      });
    }
    if (req.method !== "POST") {
      return result({ error: "Method not allowed" }, 405);
    }
    const raw = await req.text();
    if (raw.length > 4000) return result({ error: "Request too large" }, 413);
    let body;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      return result({ error: "Invalid request" }, 400);
    }
    if (
      !body || typeof body !== "object" || Array.isArray(body) ||
      (body.action && !["tick", "reconcile"].includes(body.action))
    ) {
      return result({ error: "Unknown operation" }, 400);
    }
    if (body.action === "reconcile") {
      if (
        typeof body.id !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          body.id,
        )
      ) return result({ error: "Invalid message identity" }, 400);
      const row = await db.from("email_outbox").select(
        "id,erased_at,payload_retained_at",
      ).eq("id", body.id).maybeSingle();
      if (row.error) throw row.error;
      if (!row.data || row.data.erased_at || row.data.payload_retained_at) {
        return result({ error: "Message unavailable" }, 404);
      }
      const endpoint = new URL(
        `/receipts/${body.id}`,
        Deno.env.get("EMAIL_GATEWAY_URL"),
      );
      const secret = Deno.env.get("EMAIL_GATEWAY_SECRET");
      if (endpoint.protocol !== "https:" || !secret) {
        throw new Error("Gateway unavailable");
      }
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${secret}` },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Receipt unavailable");
      }
      const stored = await readEmailGatewayReceipt(response);
      if (stored.found !== true) {
        return result({
          found: false,
          changed: false,
          sent: false,
          reason:
            "No durable receipt exists. This does not authorize resending.",
        });
      }
      const recorded = await db.rpc("email_receipt_reconcile", {
        p_id: body.id,
        p_receipt: stored.receipt,
        p_actor: actor.isServiceRole
          ? actor.originalActorId ?? null
          : actor.userId,
      });
      if (recorded.error) throw recorded.error;
      return result({ found: true, ...recorded.data });
    }
    const { data, error } = await db.rpc("email_campaign_snapshot_tick", {
      p_limit: 5,
    });
    if (error) throw error;
    const experiments = await db.rpc("email_experiment_tick", { p_limit: 5 });
    if (experiments.error) throw experiments.error;
    const reminders = await db.rpc("email_notice_reminders", { p_limit: 50 });
    if (reminders.error) throw reminders.error;
    const candidates = await db.rpc("email_notice_candidates", { p_limit: 5 });
    if (candidates.error) throw candidates.error;
    let noticesQueued = 0;
    if (candidates.data?.length) {
      const branding = await getEmailBranding();
      for (const notice of candidates.data) {
        const content = operationalEmail(notice.kind);
        const queued = await db.rpc("email_notice_enqueue", {
          p_source: notice.source_id,
          p_payload: {
            category: "transactional",
            from: fromHeader(branding),
            to: notice.recipient,
            subject: content.subject,
            html: wrapHtml(content.html, branding),
            text: content.text,
            headers: {},
          },
        });
        if (queued.error?.code === "22023") continue;
        if (queued.error) throw queued.error;
        ++noticesQueued;
      }
    }
    const retained = await db.rpc("email_retention_tick", { p_limit: 500 });
    if (retained.error) throw retained.error;
    return result({
      audience_batches: data,
      notices_queued: noticesQueued,
      experiment_batches: experiments.data,
      retention: retained.data,
      messages_sent: 0,
    });
  } catch {
    return result({ error: "Email operations unavailable" }, 503);
  }
});
