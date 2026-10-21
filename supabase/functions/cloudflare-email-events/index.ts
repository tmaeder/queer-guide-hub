import { getServiceClient, jsonResponse } from "../_shared/supabase-client.ts";
import { parseCloudflareEmailEvent } from "../_shared/email-events.ts";
Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("EMAIL_EVENTS_SECRET");
  if (!secret || req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return jsonResponse({ error: "Unauthorized" }, 401, req);
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }
  try {
    const raw = await req.text();
    if (raw.length > 32000) {
      return jsonResponse({ error: "Event too large" }, 413, req);
    }
    const event = parseCloudflareEmailEvent(JSON.parse(raw));
    if (!event) return jsonResponse({ error: "Invalid event" }, 400, req);
    const { data, error } = await getServiceClient().rpc(
      "email_record_event",
      event,
    );
    if (error) throw error;
    return jsonResponse({ recorded: data }, 200, req);
  } catch {
    return jsonResponse({ error: "Event processing failed" }, 503, req);
  }
});
