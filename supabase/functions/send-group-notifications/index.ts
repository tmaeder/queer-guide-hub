import { parseGroupMentionRequest } from "../_shared/email-group-mention.ts";
import { isEmailConfigured } from "../_shared/email.ts";
import { groupMentionEmail } from "../_shared/email-activity.ts";
import { fromHeader, getEmailBranding, wrapHtml } from "../_shared/branding.ts";
import {
  getCorsHeaders,
  getServiceClient,
  jsonResponse,
  requireInternalOrAdmin,
} from "../_shared/supabase-client.ts";

// Producers submit no recipients, private content or links. The database derives
// those identities from a current, saved post mention and its original membership.
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }
  const db = getServiceClient();
  const auth = await requireInternalOrAdmin(req, db);
  if (auth instanceof Response) return auth;
  try {
    const raw = await req.text();
    if (raw.length > 1000) {
      return jsonResponse({ error: "Request too large" }, 413, req);
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonResponse({ error: "Invalid request" }, 400, req);
    }
    const request = parseGroupMentionRequest(body);
    if (!request) {
      return jsonResponse(
        {
          error:
            "A saved group mention source is required; arbitrary group mail is unsupported",
        },
        400,
        req,
      );
    }
    if (!isEmailConfigured()) {
      return jsonResponse(
        { error: "Cloudflare email delivery not configured" },
        503,
        req,
      );
    }
    const candidates = await db.rpc("email_group_mention_candidates", {
      p_limit: 5,
      p_source: request.source_id ?? null,
    });
    if (candidates.error) throw candidates.error;
    const branding = await getEmailBranding();
    const message = groupMentionEmail();
    let queued = 0, skipped = 0;
    for (const candidate of candidates.data ?? []) {
      const result = await db.rpc("email_group_mention_enqueue", {
        p_source: candidate.source_id,
        p_payload: {
          category: "transactional",
          from: fromHeader(branding),
          to: candidate.recipient,
          subject: message.subject,
          html: wrapHtml(message.html, branding),
          text: message.text,
          headers: {},
        },
      });
      // A member can read/leave/block/change preferences between selection and enqueue.
      if (result.error?.code === "22023") {
        skipped++;
        continue;
      }
      if (result.error) throw result.error;
      queued++;
    }
    return jsonResponse({ queued, skipped }, 202, req);
  } catch {
    console.error("Group mention queue unavailable");
    return jsonResponse(
      { error: "Group mention service unavailable" },
      503,
      req,
    );
  }
});
