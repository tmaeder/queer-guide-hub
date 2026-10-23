import { hasValidWebhookSecret } from "../_shared/webhook-auth.ts";

/** Recurring saved-search digests are newsletter content. Do not read private
 * search filters, create an outbox row, or advance a cadence while Cloudflare
 * prohibits this purpose. Alert preferences remain saved for future support. */
export function handleNewsKeywordAlerts(req: Request): Response {
  const secret = Deno.env.get("NEWS_ALERTS_WEBHOOK_SECRET");
  const authorized = hasValidWebhookSecret(req, "NEWS_ALERTS_WEBHOOK_SECRET") ||
    (Boolean(secret) &&
      req.headers.get("authorization") === `Bearer ${secret}`);
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers,
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }
  return new Response(
    JSON.stringify({
      processed: 0,
      category: "newsletter",
      dispatch_available: false,
      reason: "cloudflare_transactional_only",
    }),
    { headers },
  );
}
