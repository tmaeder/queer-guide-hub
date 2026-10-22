import { isEmailConfigured } from "../_shared/email.ts";
import {
  getAnonClient,
  getCorsHeaders,
  getServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/supabase-client.ts";
import {
  catalogReferences,
  contactsCsv,
  loadEmailTemplate,
  publicCatalogBlocks,
} from "../_shared/email-content.ts";
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
          db.from("email_campaigns").select(
            "id,name,status,topic,template_key,locale,scheduled_at,version,review_state,segment_id,created_at,updated_at",
          ).order("created_at", {
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
      if (resource === "recipients") {
        const kind = url.searchParams.get("kind");
        const after = url.searchParams.get("after");
        if (
          !kind ||
          !["organization", "venue", "vendor", "user"].includes(kind) ||
          (after &&
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
              .test(after))
        ) {
          return result({ error: "Invalid recipient directory request" }, 400);
        }
        const r = await db.rpc("email_recipient_directory", {
          p_kind: kind,
          p_after: after,
        });
        if (r.error) throw r.error;
        return result(r.data);
      }
      if (resource === "measurement") {
        const r = await db.rpc("email_measurement_report");
        if (r.error) throw r.error;
        return result(r.data);
      }
      if (resource === "experiments") {
        const id = url.searchParams.get("campaign");
        if (
          !id ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
            .test(id)
        ) return result({ error: "Campaign required" }, 400);
        const r = await db.rpc("email_experiment_report", { p_campaign: id });
        if (r.error) throw r.error;
        return result({ experiments: r.data });
      }
      if (resource === "contacts") {
        const after = url.searchParams.get("after");
        if (
          after &&
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
            .test(after)
        ) return result({ error: "Invalid contact cursor" }, 400);
        const exporting = url.searchParams.get("format") === "csv";
        const page = await db.rpc("email_contacts_page", {
          p_after: after ?? null,
          p_export: exporting,
          p_actor: actor.isServiceRole ? null : actor.userId,
        });
        if (page.error) throw page.error;
        return result({
          ...page.data,
          ...(exporting ? { csv: contactsCsv(page.data.contacts) } : {}),
        });
      }
      if (resource === "localizations") {
        const key = url.searchParams.get("key");
        if (!key || key.length > 100) {
          return result({ error: "Template required" }, 400);
        }
        const locale = url.searchParams.get("locale");
        if (locale && !/^[a-z]{2}(?:-[A-Za-z0-9]{2,8})?$/.test(locale)) {
          return result({ error: "Invalid locale" }, 400);
        }
        let q = db.from("email_template_localizations").select(
          locale
            ? "template_key,locale,subject,html_content,text_content,is_active,version,updated_at"
            : "template_key,locale,is_active,version,updated_at",
        ).eq("template_key", key).order("locale").limit(locale ? 1 : 100);
        if (locale) q = q.eq("locale", locale.toLowerCase());
        const r = await q;
        if (r.error) throw r.error;
        return result({ localizations: r.data });
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
      if (resource === "campaign") {
        const id = url.searchParams.get("id");
        if (
          !id ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(id)
        ) {
          return result({ error: "Campaign required" }, 400);
        }
        const [campaign, versions, reviews, audiences] = await Promise.all([
          db.from("email_campaigns").select("*").eq("id", id).maybeSingle(),
          db.from("email_campaign_versions").select(
            "campaign_id,version,created_at,created_by",
          ).eq("campaign_id", id).order("version", { ascending: false }).limit(
            100,
          ),
          db.from("email_campaign_reviews").select(
            "version,action,created_at,actor_id",
          ).eq("campaign_id", id).order("created_at", { ascending: false })
            .limit(100),
          db.rpc("email_campaign_audience_report", { p_campaign: id }),
        ]);
        if ([campaign, versions, reviews, audiences].some((q) => q.error)) {
          throw new Error("Campaign overview unavailable");
        }
        if (!campaign.data) return result({ error: "Campaign not found" }, 404);
        const version = await db.from("email_campaign_versions").select("*").eq(
          "campaign_id",
          id,
        ).eq("version", campaign.data.version).maybeSingle();
        if (version.error) throw version.error;
        return result({
          campaign: campaign.data,
          version: version.data,
          versions: versions.data,
          reviews: reviews.data,
          audiences: audiences.data,
          catalog: version.data?.content?.catalog_references?.length
            ? await publicCatalogBlocks(
              getAnonClient(),
              version.data.content.catalog_references,
            )
            : {
              blocks: [],
              evaluated_at: new Date().toISOString(),
              dispatch_available: false,
            },
        });
      }
      if (resource === "audit") {
        const { data, error } = await db.from("email_operator_events").select(
          "id,object_type,object_id,version,action,actor_id,created_at",
        ).order("created_at", { ascending: false }).limit(100);
        if (error) throw error;
        return result({ events: data });
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
    if (raw.length > 600000) return result({ error: "Request too large" }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return result({ error: "Invalid request" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return result({ error: "Invalid request" }, 400);
    }
    if (
      raw.length > 12000 &&
      !["contact-import", "localization-save"].includes(body.action)
    ) return result({ error: "Request too large" }, 413);
    if (body.action === "recipient-import") {
      if (
        !["organization", "venue", "vendor", "user"].includes(body.kind) ||
        typeof body.id !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          body.id,
        )
      ) {
        return result({ error: "Invalid recipient reference" }, 400);
      }
      const r = await db.rpc("email_recipient_import", {
        p_kind: body.kind,
        p_id: body.id,
        p_actor: actor.isServiceRole ? null : actor.userId,
      });
      if (r.error) {
        return result(
          { error: "Recipient unavailable. Reload the directory." },
          r.error.code === "22023" ? 400 : 503,
        );
      }
      return result(r.data);
    }
    if (body.action === "experiment-create") {
      if (
        typeof body.campaign_id !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          body.campaign_id,
        ) || !Number.isInteger(body.expected_version) ||
        body.expected_version < 1 || body.expected_version > 2147483647 ||
        !Number.isInteger(body.window_seconds) || body.window_seconds < 86400 ||
        body.window_seconds > 2592000 ||
        !["username_claimed", "event_rsvp", "group_joined", "trip_accepted"]
          .includes(body.goal) ||
        !Array.isArray(body.variants) || body.variants.length < 2 ||
        body.variants.length > 5
      ) return result({ error: "Invalid experiment definition" }, 400);
      const r = await db.rpc("email_experiment_create", {
        p_campaign: body.campaign_id,
        p_version: body.expected_version,
        p_goal: body.goal,
        p_window: body.window_seconds,
        p_variants: body.variants,
        p_actor: actor.isServiceRole ? null : actor.userId,
      });
      if (r.error) {
        return result(
          {
            error: r.error.code === "40001"
              ? "The campaign changed or this version already has an experiment. Reload its details."
              : "Create a ready audience snapshot and check the variant weights, active templates and declared goal.",
          },
          r.error.code === "40001"
            ? 409
            : r.error.code.startsWith("22")
            ? 400
            : 503,
        );
      }
      return result({
        id: r.data,
        dispatch_available: false,
        exposures: 0,
        window_started: false,
      });
    }
    if (body.action === "contact-import") {
      const r = await db.rpc("email_contacts_import", {
        p_source: body.source,
        p_reference: body.reference,
        p_rows: body.rows,
        p_actor: actor.isServiceRole ? null : actor.userId,
      });
      if (r.error) {
        return result({
          error: "Import rejected; check the row format and source provenance.",
        }, r.error.code === "22023" ? 400 : 503);
      }
      return result(r.data);
    }
    if (body.action === "localization-save") {
      const r = await db.rpc("email_template_localization_save", {
        p_key: body.template_key,
        p_locale: body.locale,
        p_subject: body.subject,
        p_html: body.html_content,
        p_text: body.text_content ?? null,
        p_version: body.expected_version,
        p_actor: actor.isServiceRole ? null : actor.userId,
        p_active: body.is_active ?? true,
      });
      if (r.error) {
        return result(
          {
            error: r.error.code === "40001"
              ? "This translation changed. Reload before saving."
              : "Translation rejected. Preserve the base template variables and check the content.",
          },
          r.error.code === "40001" ? 409 : r.error.code === "22023" ? 400 : 503,
        );
      }
      return result({ localization: r.data });
    }
    if (body.action === "content-preview") {
      if (
        typeof body.template_key !== "string" ||
        body.template_key.length > 100 ||
        (body.locale !== undefined && body.locale !== null &&
          (typeof body.locale !== "string" ||
            !/^[a-z]{2}(?:-[A-Za-z0-9]{2,8})?$/.test(body.locale)))
      ) return result({ error: "Invalid content request" }, 400);
      const template = await loadEmailTemplate(
        db,
        body.template_key,
        body.locale,
      );
      return result({ template });
    }
    if (body.action === "catalog-preview") {
      const refs = catalogReferences(body.references);
      if (!refs) {
        return result({
          error: "Provide up to twelve unique public catalog references",
        }, 400);
      }
      return result(await publicCatalogBlocks(getAnonClient(), refs));
    }
    if (
      [
        "campaign-save",
        "campaign-cancel",
        "campaign-review",
        "campaign-snapshot",
      ].includes(body.action) &&
      (body.action !== "campaign-save" || body.id !== undefined)
    ) {
      if (
        typeof body.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          body.id,
        ) || !Number.isInteger(body.expected_version) ||
        body.expected_version < 1 || body.expected_version > 2147483647
      ) {
        return result({ error: "Current campaign and version required" }, 400);
      }
    }
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
      if (
        body.locale &&
        (typeof body.locale !== "string" ||
          !/^[a-z]{2}(?:-[A-Za-z]{2,8})?$/.test(body.locale))
      ) {
        return result({ error: "Invalid locale" }, 400);
      }
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
      if (body.locale) {
        rule = {
          all: [rule, { field: "locale", op: "eq", value: body.locale }],
        };
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
      const references = body.catalog_references ?? [];
      if (
        !Array.isArray(references) ||
        (references.length && !catalogReferences(references))
      ) return result({ error: "Invalid public catalog blocks" }, 400);
      if (references.length) {
        const preview = await publicCatalogBlocks(getAnonClient(), references);
        if (preview.blocks.some((b) => !b.available)) {
          return result({
            error:
              "A catalog block is unavailable. Remove it or choose current public content.",
          }, 400);
        }
      }
      const values = {
        catalog_references: references,
        name: body.name.trim(),
        template_key: body.template_key,
        topic: body.topic,
        locale: body.locale || null,
        scheduled_at: body.scheduled_at || null,
        segment_id: body.segment_id || null,
      };
      const saved = await db.rpc("email_campaign_save", {
        p_data: values,
        p_actor: actor.isServiceRole ? null : actor.userId,
        p_id: body.id ?? null,
        p_expected_version: body.expected_version ?? null,
      });
      if (saved.error) {
        if (saved.error.code === "40001") {
          return result(
            { error: "Campaign changed. Reload before saving." },
            409,
          );
        }
        if (
          ["22023", "22P02", "23514", "22007", "22008"].includes(
            saved.error.code,
          )
        ) {
          return result({
            error: "Check the campaign, active template and audience.",
          }, 400);
        }
        if (saved.error.code === "P0002") {
          return result({ error: "Campaign not found" }, 404);
        }
        throw saved.error;
      }
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
      const { error } = await db.rpc("email_campaign_cancel", {
        p_id: body.id,
        p_version: body.expected_version,
        p_actor: actor.isServiceRole ? null : actor.userId,
      });
      if (error?.code === "40001") {
        return result(
          { error: "Campaign changed. Reload before cancelling." },
          409,
        );
      }
      if (error) throw error;
      return result({ success: true });
    }
    if (body.action === "campaign-review") {
      if (!["submit", "approve", "request_changes"].includes(body.decision)) {
        return result({ error: "Invalid review action" }, 400);
      }
      const { data, error } = await db.rpc("email_campaign_review", {
        p_id: body.id,
        p_version: body.expected_version,
        p_action: body.decision,
        p_actor: actor.isServiceRole ? null : actor.userId,
      });
      if (error?.code === "40001") {
        return result(
          { error: "Campaign changed. Reload before reviewing." },
          409,
        );
      }
      if (error?.code === "22023") {
        return result(
          { error: "Refresh the campaign's current review state." },
          400,
        );
      }
      if (error) throw error;
      return result({
        campaign: data,
        dispatchAvailable: false,
        reason: BLOCK,
      });
    }
    if (body.action === "campaign-snapshot") {
      const { data, error } = await db.rpc("email_campaign_snapshot_begin", {
        p_id: body.id,
        p_version: body.expected_version,
        p_actor: actor.isServiceRole ? null : actor.userId,
      });
      if (error?.code === "40001") {
        return result({
          error: "Campaign changed. Reload before collecting an audience.",
        }, 409);
      }
      if (error) throw error;
      return result({
        audience_id: data,
        dispatchAvailable: false,
        reason: BLOCK,
      });
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
