import {
  getCorsHeaders,
  getServiceClient,
  jsonResponse,
  requireInternalOrAdmin,
} from "../_shared/supabase-client.ts";
import { isEmailConfigured } from "../_shared/email.ts";
import { tripInvitationEmail } from "../_shared/email-activity.ts";
import { fromHeader, getEmailBranding, wrapHtml } from "../_shared/branding.ts";
import {
  parseTripInvitationRequest,
  validInvitationId,
} from "../_shared/email-trip-invitation.ts";
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const db = getServiceClient();
  try {
    let body;
    if (req.method === "POST") {
      const raw = await req.text();
      if (raw.length > 2000) {
        return jsonResponse({ error: "Request too large" }, 413, req);
      }
      try {
        body = parseTripInvitationRequest(JSON.parse(raw));
      } catch {
        body = null;
      }
      if (!body) {
        return jsonResponse({ error: "Invalid invitation request" }, 400, req);
      }
    } else if (req.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405, req);
    }
    if (body?.action === "tick") {
      const gate = await requireInternalOrAdmin(req, db);
      if (gate instanceof Response) return gate;
      if (!isEmailConfigured()) {
        return jsonResponse(
          { error: "Cloudflare email delivery not configured" },
          503,
          req,
        );
      }
      const candidates = await db.rpc("email_trip_invitation_candidates", {
        p_limit: 5,
        p_source: body.source_id ?? null,
      });
      if (candidates.error) throw candidates.error;
      const branding = await getEmailBranding(),
        message = tripInvitationEmail();
      let queued = 0, skipped = 0;
      for (const c of candidates.data ?? []) {
        const r = await db.rpc("email_trip_invitation_enqueue", {
          p_source: c.source_id,
          p_payload: {
            category: "transactional",
            from: fromHeader(branding),
            to: c.recipient,
            subject: message.subject,
            html: wrapHtml(message.html, branding),
            text: message.text,
            headers: {},
          },
        });
        if (r.error?.code === "22023") {
          skipped++;
          continue;
        }
        if (r.error) throw r.error;
        queued++;
      }
      return jsonResponse({ queued, skipped }, 202, req);
    }
    // All member actions derive their actor from verified Auth. Internal/admin
    // queue credentials do not authorize impersonating a member here.
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    const auth = token ? await db.auth.getUser(token) : null;
    const user = auth?.data.user;
    if (!user) {
      return jsonResponse({ error: "Authentication required" }, 401, req);
    }
    let operation;
    if (req.method === "GET") {
      const trip = new URL(req.url).searchParams.get("trip_id");
      if (trip !== null && !validInvitationId(trip)) {
        return jsonResponse({ error: "Invalid trip" }, 400, req);
      }
      operation = await db.rpc("trip_invitation_list", {
        p_user: user.id,
        p_trip: trip,
      });
    } else if (body?.action === "create") {
      operation = await db.rpc("trip_invitation_create", {
        p_actor: user.id,
        p_trip: body.trip_id,
        p_username: body.username,
        p_role: body.role,
      });
    } else if (body?.action === "respond") {
      operation = await db.rpc("trip_invitation_respond", {
        p_user: user.id,
        p_id: body.invitation_id,
        p_decision: body.decision,
      });
    } else if (body?.action === "revoke") {
      operation = await db.rpc("trip_invitation_revoke", {
        p_actor: user.id,
        p_id: body.invitation_id,
      });
    } else {return jsonResponse(
        { error: "Invalid invitation request" },
        400,
        req,
      );}
    if (operation.error?.message === "invitation_rate_limited") {
      return jsonResponse(
        { error: "Invitation limit reached. Try again in an hour." },
        429,
        req,
      );
    }
    if (operation.error?.code === "42501") {
      return jsonResponse({ error: "Invitation unavailable" }, 403, req);
    }
    if (operation.error?.code === "22023") {
      return jsonResponse(
        { error: "Invitation unavailable or no longer actionable" },
        409,
        req,
      );
    }
    if (operation.error) throw operation.error;
    if (body?.action === "revoke" && operation.data === false) {
      return jsonResponse({ error: "Invitation no longer pending" }, 409, req);
    }
    return jsonResponse(
      req.method === "GET" ? operation.data : { result: operation.data },
      200,
      req,
    );
  } catch {
    return jsonResponse({ error: "Invitation service unavailable" }, 503, req);
  }
});
