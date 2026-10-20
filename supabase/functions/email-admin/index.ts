import { isEmailConfigured } from "../_shared/email.ts";
import {
  getCorsHeaders,
  getServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/supabase-client.ts";
const BLOCK = "cloudflare_transactional_only";
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const db = getServiceClient();
  const actor = await requireAdmin(req, db);
  if (actor instanceof Response) return actor;
  const result = (data: unknown, status = 200) =>
    jsonResponse(data, status, req);
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const resource = url.searchParams.get("resource") ?? "overview";
      if (resource === "overview") {
        const queries = await Promise.all([
          db.from("email_outbox").select(
            "id,status,recipient_email,attempts,template_key,last_error,provider_id,created_at",
          ).order("created_at", { ascending: false }).limit(50),
          db.from("email_campaigns").select("*").order("created_at", {
            ascending: false,
          }).limit(50),
          db.from("email_subscribers").select("id", {
            count: "exact",
            head: true,
          }).eq("status", "subscribed"),
          db.from("email_suppressions").select("email", {
            count: "exact",
            head: true,
          }),
          db.from("email_templates").select("template_key,name,is_active")
            .order("name"),
        ]);
        if (queries.some((q) => q.error)) {
          throw new Error("Overview query failed");
        }
        return result({
          provider: "cloudflare",
          configured: isEmailConfigured(),
          capabilities: {
            transactional: true,
            marketing: false,
            newsletter: false,
            reason: BLOCK,
          },
          messages: queries[0].data,
          campaigns: queries[1].data,
          subscribers: queries[2].count,
          suppressions: queries[3].count,
          templates: queries[4].data,
        });
      }
      if (resource === "subscribers") {
        const { data, error } = await db.from("email_subscribers").select(
          "id,email,status,topics,locale,source,confirmed_at,created_at",
        ).order("created_at", { ascending: false }).limit(100);
        if (error) throw error;
        return result({ subscribers: data });
      }
      if (resource === "segments") {
        const { data, error } = await db.from("email_segments").select("*")
          .order("updated_at", { ascending: false }).limit(100);
        if (error) throw error;
        return result({ segments: data });
      }
      if (resource === "timeline") {
        const id = url.searchParams.get("id");
        if (!id || !/^[a-f0-9-]{36}$/i.test(id)) {
          return result({ error: "Subscriber required" }, 400);
        }
        const { data, error } = await db.rpc("email_contact_timeline", {
          p_subscriber: id,
        });
        if (error) throw error;
        return result({ events: data });
      }
      if (resource === "consent") {
        const id = url.searchParams.get("id");
        if (!id || !/^[a-f0-9-]{36}$/i.test(id)) {
          return result({ error: "Subscriber required" }, 400);
        }
        const { data, error } = await db.from("email_consent_events").select(
          "*",
        ).eq("subscriber_id", id).order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        return result({ events: data });
      }
      return result({ error: "Unknown resource" }, 400);
    }
    if (req.method !== "POST") {
      return result({ error: "Method not allowed" }, 405);
    }
    const raw = await req.text();
    if (raw.length > 12000) return result({ error: "Request too large" }, 413);
    const body = JSON.parse(raw);
    if (body.action === "segment-save") {
      if (
        typeof body.name !== "string" || !body.rule ||
        typeof body.rule !== "object" || Array.isArray(body.rule) ||
        (body.id &&
          (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id))) ||
        (body.id &&
          (!Number.isInteger(body.expected_version) ||
            body.expected_version < 1 || body.expected_version > 1000000000)) ||
        (body.status && !["active", "archived"].includes(body.status))
      ) return result({ error: "Invalid segment" }, 400);
      const { data, error } = await db.rpc("email_segment_save", {
        p_name: body.name,
        p_rule: body.rule,
        p_actor: actor.isServiceRole ? null : actor.userId,
        p_id: body.id ?? null,
        p_expected_version: body.expected_version ?? null,
        p_status: body.status ?? "active",
      });
      if (error) {
        if (error.code === "40001") {
          return result(
            { error: "Segment changed. Reload before saving." },
            409,
          );
        }
        if (["22023", "22P02", "23514"].includes(error.code)) {
          return result({ error: "Invalid segment rule" }, 400);
        }
        if (error.code === "P0002") {
          return result({ error: "Segment not found" }, 404);
        }
        throw error;
      }
      return result({ segment: data });
    }
    if (body.action === "segment-preview") {
      if (
        (body.id &&
          (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id))) ||
        (!body.id &&
          (!body.rule || typeof body.rule !== "object" ||
            Array.isArray(body.rule))) ||
        (body.limit !== undefined &&
          (!Number.isInteger(body.limit) || body.limit < 1 ||
            body.limit > 100)) ||
        (body.after &&
          (typeof body.after !== "string" ||
            !/^[a-f0-9-]{36}$/i.test(body.after)))
      ) return result({ error: "Invalid segment preview" }, 400);
      let rule = body.rule;
      let version: number | null = null;
      if (body.id) {
        const saved = await db.from("email_segments").select("rule,version").eq(
          "id",
          body.id,
        ).maybeSingle();
        if (saved.error) throw saved.error;
        if (!saved.data) return result({ error: "Segment not found" }, 404);
        rule = saved.data.rule;
        version = saved.data.version;
      }
      const { data, error } = await db.rpc("email_segment_preview", {
        p_rule: rule,
        p_topic: body.topic ?? null,
        p_limit: body.limit ?? 50,
        p_after: body.after ?? null,
      });
      if (error) {
        if (["22023", "22P02"].includes(error.code)) {
          return result({ error: "Invalid segment rule" }, 400);
        }
        throw error;
      }
      return result({
        preview: data,
        version,
        dispatchAvailable: false,
        reason: BLOCK,
      });
    }
    if (body.action === "campaign-save") {
      if (
        typeof body.name !== "string" || !body.name.trim() ||
        body.name.length > 200 || typeof body.template_key !== "string" ||
        !["newsletter", "product_updates", "events"].includes(body.topic)
      ) return result({ error: "Invalid campaign" }, 400);
      if (
        body.locale !== null && body.locale !== undefined &&
        (typeof body.locale !== "string" ||
          !/^[a-z]{2}(?:-[A-Za-z]{2,8})?$/.test(body.locale))
      ) return result({ error: "Invalid locale" }, 400);
      if (
        body.scheduled_at && !Number.isFinite(Date.parse(body.scheduled_at))
      ) return result({ error: "Invalid schedule" }, 400);
      const { data: template, error } = await db.from("email_templates").select(
        "subject,html_content,text_content",
      ).eq("template_key", body.template_key).eq("is_active", true).single();
      if (error || !template) {
        return result({ error: "Active template required" }, 400);
      }
      const values = {
        name: body.name.trim(),
        template_key: body.template_key,
        topic: body.topic,
        locale: body.locale || null,
        subject: template.subject,
        html_content: template.html_content,
        text_content: template.text_content ?? "",
        scheduled_at: body.scheduled_at || null,
        status: body.scheduled_at ? "blocked" : "draft",
        blocked_reason: body.scheduled_at ? BLOCK : null,
        updated_at: new Date().toISOString(),
      };
      const query = body.id
        ? db.from("email_campaigns").update(values).eq("id", body.id).neq(
          "status",
          "cancelled",
        )
        : db.from("email_campaigns").insert({
          ...values,
          created_by: actor.isServiceRole ? null : actor.userId,
        });
      const saved = await query.select("id").single();
      if (saved.error) throw saved.error;
      return result({
        campaign: saved.data,
        dispatchAvailable: false,
        reason: BLOCK,
      });
    }
    if (body.action === "campaign-send") {
      return result({
        error: BLOCK,
        message: "Cloudflare Email Service supports transactional email only.",
      }, 409);
    }
    if (body.action === "campaign-cancel") {
      const { error } = await db.from("email_campaigns").update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      }).eq("id", body.id);
      if (error) throw error;
      return result({ success: true });
    }
    if (body.action === "audience-count") {
      if (!["newsletter", "product_updates", "events"].includes(body.topic)) {
        return result({ error: "Invalid audience" }, 400);
      }
      const { data, error } = await db.rpc("email_audience_count", {
        p_topic: body.topic,
        p_locale: body.locale || null,
      });
      if (error) throw error;
      return result({ eligible: data, truncated: false });
    }
    return result({ error: "Unknown action" }, 400);
  } catch {
    return result({ error: "Email administration unavailable" }, 503);
  }
});
