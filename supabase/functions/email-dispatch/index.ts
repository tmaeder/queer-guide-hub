import {
  getServiceClient,
  jsonResponse,
  requireInternalOrAdmin,
} from "../_shared/supabase-client.ts";
import { isEmailConfigured } from "../_shared/email.ts";
import { dispatchEmail, type OutboxRow } from "../_shared/email-outbox.ts";
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }
  const db = getServiceClient();
  const auth = await requireInternalOrAdmin(req, db);
  if (auth instanceof Response) return auth;
  if (!isEmailConfigured()) {
    return jsonResponse({ error: "Cloudflare email not configured" }, 503, req);
  }
  try {
    const { data, error } = await db.rpc("email_claim", { p_limit: 5 });
    if (error) throw error;
    const outcomes = await Promise.allSettled(
      ((data ?? []) as OutboxRow[]).map((row) => dispatchEmail(db, row)),
    );
    const processed = outcomes.filter((r) => r.status === "fulfilled").length;
    return jsonResponse(
      { processed, failed: outcomes.length - processed },
      outcomes.every((r) => r.status === "fulfilled") ? 200 : 503,
      req,
    );
  } catch {
    return jsonResponse({ error: "Email dispatch unavailable" }, 503, req);
  }
});
