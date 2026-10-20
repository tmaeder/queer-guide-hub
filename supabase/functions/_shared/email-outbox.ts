import { readEmailGatewayReceipt } from "./email-gateway-receipt.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
export interface OutboxRow {
  id: string;
  lease_id: string;
  status: string;
  payload: Record<string, unknown>;
  provider_id: string | null;
  last_error: string | null;
}
export async function dispatchEmail(
  db: SupabaseClient,
  row: OutboxRow,
): Promise<void> {
  const url = Deno.env.get("EMAIL_GATEWAY_URL");
  const secret = Deno.env.get("EMAIL_GATEWAY_SECRET");
  if (!url || !secret) {
    throw new Error("Cloudflare email delivery not configured");
  }
  // Transport failure can be retried using the SAME immutable Worker identity.
  // The Durable Object remembers acceptance and holds ambiguous submissions.
  let retryAfter: number | null = null;
  let status = "queued",
    id: string | null = null,
    error = "gateway_unavailable";
  try {
    const endpoint = new URL("/send", url);
    if (endpoint.protocol !== "https:") {
      throw new Error("HTTPS gateway required");
    }
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...row.payload, id: row.id }),
    });
    if (response.ok) {
      const receipt = await readEmailGatewayReceipt(response);
      if (
        typeof receipt.retryAfterSeconds === "number" &&
        Number.isFinite(receipt.retryAfterSeconds)
      ) {
        retryAfter = Math.min(
          86400,
          Math.max(0, Math.ceil(receipt.retryAfterSeconds)),
        );
      }
      if (
        receipt.status === "accepted" && typeof receipt.id === "string" &&
        receipt.id.length > 0 && receipt.id.length <= 250
      ) {
        status = "accepted";
        id = receipt.id;
        error = "";
      } else if (
        ["retry", "failed", "uncertain", "suppressed"].includes(
          String(receipt.status),
        )
      ) {
        status = receipt.status === "retry" ? "queued" : String(receipt.status);
        error = String(receipt.error ?? "delivery_failed").slice(0, 500);
      } else {
        status = "uncertain";
        error = "invalid_gateway_receipt";
      }
    } else {
      error = `gateway_http_${response.status}`;
      status = response.status === 429 || response.status >= 500
        ? "queued"
        : "failed";
      await response.body?.cancel();
    }
  } catch { /* Replay resolves against the persisted Worker identity. */ }
  const finished = await db.rpc("email_finish", {
    p_id: row.id,
    p_lease: row.lease_id,
    p_status: status,
    p_provider_id: id,
    p_error: error || null,
    p_retry_after: retryAfter,
  });
  if (finished.error || !finished.data) {
    throw new Error("Email receipt could not be persisted");
  }
}
