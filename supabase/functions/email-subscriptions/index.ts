import {
  managementForm,
  verifyEmailChallenge,
} from "../_shared/email-management.ts";
import {
  getCorsHeaders,
  getServiceClient,
  jsonResponse,
} from "../_shared/supabase-client.ts";
import {
  newEmailToken,
  subscriptionForm,
  tokenHash,
  validTopics,
} from "../_shared/email-subscription.ts";
import { fromHeader, getEmailBranding, wrapHtml } from "../_shared/branding.ts";
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const url = new URL(req.url), action = url.searchParams.get("action");
  const db = getServiceClient();
  if (action === "manage") {
    const token = url.searchParams.get("token") ?? "";
    if (!/^[a-f0-9]{64}$/.test(token)) {
      return jsonResponse(
        { error: "Invalid or expired management link" },
        400,
        req,
      );
    }
    const headers = {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    };
    try {
      const hash = await tokenHash(token);
      if (req.method === "GET") {
        const r = await db.rpc("email_management_read", { p_hash: hash });
        if (r.error) throw r.error;
        const form = r.data ? managementForm(token, r.data) : null;
        if (!form) {
          return new Response(
            '<h1>This email link is expired or already used</h1><p>Request a new private link from <a href="https://queer.guide/email-updates">email updates</a>.</p>',
            { status: 400, headers },
          );
        }
        return new Response(form, { headers });
      }
      if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405, req);
      }
      const raw = await req.text();
      if (raw.length > 4000) {
        return jsonResponse({ error: "Request too large" }, 413, req);
      }
      const form = new URLSearchParams(raw),
        decision = form.get("decision"),
        topics = form.getAll("topics"),
        locale = form.get("locale");
      if (
        !["save", "unsubscribe"].includes(decision ?? "") ||
        !validTopics(topics) || typeof locale !== "string" ||
        !/^[a-z]{2}(?:-[A-Za-z]{2,8})?$/.test(locale)
      ) return jsonResponse({ error: "Invalid email preferences" }, 400, req);
      const r = await db.rpc("email_management_save", {
        p_hash: hash,
        p_topics: topics,
        p_locale: locale,
        p_unsubscribe: decision === "unsubscribe",
      });
      if (r.error) throw r.error;
      if (r.data !== true) {
        return new Response(
          "<h1>This choice could not be saved</h1><p>The link may have expired or already been used. An unsubscribed mailbox needs a new confirmation to subscribe again.</p>",
          { status: 400, headers },
        );
      }
      return new Response(
        '<h1>Email preferences saved</h1><p>Your choice is recorded. <a href="https://queer.guide/email-updates">Return to email updates</a>.</p>',
        { headers },
      );
    } catch {
      return jsonResponse(
        { error: "Email management temporarily unavailable" },
        503,
        req,
      );
    }
  }
  if (action === "confirm" || action === "unsubscribe") {
    const token = url.searchParams.get("token") ?? "";
    const form = subscriptionForm(action, token);
    if (!form) return jsonResponse({ error: "Invalid link" }, 400, req);
    if (req.method === "GET") {
      return new Response(form, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy":
            "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        },
      });
    }
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, req);
    }
    const { data, error } = await db.rpc("email_subscription_consume", {
      p_hash: await tokenHash(token),
      p_purpose: action,
    });
    return jsonResponse(
      error
        ? { error: "Subscription unavailable" }
        : data
        ? { success: true, action }
        : { error: "Link expired or already used" },
      error ? 503 : data ? 200 : 400,
      req,
    );
  }
  try {
    const bearer = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    const auth = bearer ? await db.auth.getUser(bearer) : null;
    const user = auth?.data.user;
    if (req.method === "GET") {
      if (!user) {
        return jsonResponse({ error: "Authentication required" }, 401, req);
      }
      if (action === "group_invitations") {
        const after = url.searchParams.get("after");
        if (
          after &&
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
            .test(after)
        ) {
          return jsonResponse({ error: "Invalid invitation cursor" }, 400, req);
        }
        const page = await db.rpc("email_group_invitation_review", {
          p_user: user.id,
          p_after: after,
        });
        if (page.error) throw page.error;
        const response = jsonResponse(
          { ...page.data, userId: user.id },
          200,
          req,
        );
        response.headers.set("Cache-Control", "no-store");
        response.headers.set("Referrer-Policy", "no-referrer");
        return response;
      }
      const { data, error } = await db.from("email_subscribers").select(
        "status,topics,locale,confirmed_at",
      ).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      const preferences = await db.rpc("email_delivery_preferences_get", {
        p_user: user.id,
      });
      if (preferences.error) throw preferences.error;
      return jsonResponse(
        { subscription: data, delivery_preferences: preferences.data },
        200,
        req,
      );
    }
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, req);
    }
    const raw = await req.text();
    if (raw.length > 4000) {
      return jsonResponse({ error: "Request too large" }, 413, req);
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonResponse({ error: "Invalid request" }, 400, req);
    }
    if (body?.action === "request_management") {
      if (
        !user &&
        !await verifyEmailChallenge(body.turnstileToken, "email-manage")
      ) return jsonResponse({ error: "Verification required" }, 400, req);
      const email = user?.email ?? body.email;
      if (
        typeof email !== "string" || email.length > 254 ||
        !/^([^\s<>@]+)@([^\s<>@]+)\.([^\s<>@]+)$/.test(email)
      ) return jsonResponse({ error: "Invalid email" }, 400, req);
      const token = newEmailToken();
      const link = new URL(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-subscriptions`,
      );
      link.search = new URLSearchParams({ action: "manage", token }).toString();
      const branding = await getEmailBranding();
      const r = await db.rpc("email_management_request", {
        p_email: email,
        p_hash: await tokenHash(token),
        p_key: await tokenHash(`subscription-management:${token}`),
        p_payload: {
          category: "transactional",
          from: fromHeader(branding),
          to: email.trim().toLowerCase(),
          subject: "Your Queer Guide email preferences",
          html: wrapHtml(
            `<p>You requested a private email preference link.</p><p><a href="${
              link.href.replaceAll("&", "&amp;")
            }">Manage email preferences</a></p><p>This link works once and expires in one hour. Ignore this email if you did not request it.</p>`,
            branding,
          ),
          text:
            `Manage your Queer Guide email preferences: ${link.href}. This private link works once and expires in one hour. Ignore this email if you did not request it.`,
          headers: {},
        },
      });
      if (r.error) throw r.error;
      return jsonResponse(
        {
          success: true,
          message:
            "If this mailbox has a confirmed subscription, a private link will be sent. Please allow an hour before requesting another.",
        },
        202,
        req,
      );
    }
    if (body?.action === "delivery_preferences") {
      if (!user) {
        return jsonResponse({ error: "Authentication required" }, 401, req);
      }
      if (
        typeof body.dm_digest_enabled !== "boolean" ||
        (body.trip_invites_enabled !== undefined &&
          typeof body.trip_invites_enabled !== "boolean") ||
        (body.group_mentions_enabled !== undefined &&
          typeof body.group_mentions_enabled !== "boolean") ||
        (body.operational_topics !== undefined &&
          (!Array.isArray(body.operational_topics) ||
            body.operational_topics.length > 9 ||
            new Set(body.operational_topics).size !==
              body.operational_topics.length ||
            body.operational_topics.some((topic: unknown) =>
              typeof topic !== "string" ||
              ![
                "event_updates",
                "trip_updates",
                "group_requests",
                "contributions",
                "payments",
                "group_invitations",
                "group_comments",
                "community_comments",
                "business_updates",
              ].includes(topic)
            ))) ||
        typeof body.quiet_hours_enabled !== "boolean" ||
        typeof body.timezone !== "string" || body.timezone.length > 100 ||
        !Number.isInteger(body.quiet_start) ||
        !Number.isInteger(body.quiet_end) ||
        !Number.isInteger(body.version) || body.version < 0
      ) {
        return jsonResponse(
          { error: "Invalid delivery preferences" },
          400,
          req,
        );
      }
      const saved = await db.rpc("email_delivery_preferences_save", {
        p_user: user.id,
        p_enabled: body.dm_digest_enabled,
        p_group_enabled: body.group_mentions_enabled ?? null,
        p_trip_enabled: body.trip_invites_enabled ?? null,
        p_operational_topics: body.operational_topics ?? null,
        p_timezone: body.timezone,
        p_quiet: body.quiet_hours_enabled,
        p_start: body.quiet_start,
        p_end: body.quiet_end,
        p_version: body.version,
      });
      if (saved.error?.code === "40001") {
        return jsonResponse(
          { error: "Preferences changed. Reload and retry." },
          409,
          req,
        );
      }
      if (saved.error?.code === "22023") {
        return jsonResponse(
          { error: "Invalid delivery preferences" },
          400,
          req,
        );
      }
      if (saved.error) throw saved.error;
      return jsonResponse({ delivery_preferences: saved.data }, 200, req);
    }
    if (
      !body || !validTopics(body.topics) || typeof body.locale !== "string" ||
      !/^[a-z]{2}(?:-[A-Za-z]{2,8})?$/.test(body.locale)
    ) return jsonResponse({ error: "Invalid preferences" }, 400, req);
    if (body.action === "preferences") {
      if (!user) {
        return jsonResponse({ error: "Authentication required" }, 401, req);
      }
      const { error } = await db.rpc("email_subscription_preferences", {
        p_user: user.id,
        p_topics: body.topics,
        p_locale: body.locale,
        p_unsubscribe: body.unsubscribe === true,
      });
      if (error) throw error;
      return jsonResponse({ success: true }, 200, req);
    }
    if (
      body.action !== "subscribe" || body.consent !== true ||
      !body.topics.length
    ) {
      return jsonResponse(
        { error: "Explicit subscription consent required" },
        400,
        req,
      );
    }
    let email = user?.email;
    if (!user) {
      const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
      if (!secret) {
        return jsonResponse(
          { error: "Public subscriptions are not configured" },
          503,
          req,
        );
      }
      if (
        typeof body.turnstileToken !== "string" ||
        body.turnstileToken.length > 2048
      ) return jsonResponse({ error: "Verification required" }, 400, req);
      if (!await verifyEmailChallenge(body.turnstileToken, "email-subscribe")) {
        return jsonResponse({ error: "Verification failed" }, 400, req);
      }
      email = body.email;
    }
    if (
      typeof email !== "string" || email.length > 254 ||
      !/^([^\s<>@]+)@([^\s<>@]+)\.([^\s<>@]+)$/.test(email)
    ) return jsonResponse({ error: "Invalid email" }, 400, req);
    const token = newEmailToken();
    const confirmation = new URL(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-subscriptions`,
    );
    confirmation.search = new URLSearchParams({ action: "confirm", token })
      .toString();
    const branding = await getEmailBranding();
    const payload = {
      category: "transactional",
      from: fromHeader(branding),
      to: email.trim().toLowerCase(),
      subject: "Confirm your Queer Guide email subscription",
      html: wrapHtml(
        `<p>You requested email updates from Queer Guide.</p><p><a href="${
          confirmation.href.replace(/&/g, "&amp;")
        }">Confirm your subscription</a></p><p>This link expires in 24 hours. If you did not request this, you can ignore this email.</p>`,
        branding,
      ),
      text:
        `Confirm your Queer Guide email subscription: ${confirmation.href}\nThis link expires in 24 hours. Ignore this email if you did not request it.`,
      headers: {},
    };
    // Token, consent event and mail outbox entry commit together. Do not wait
    // for provider delivery here or disclose subscriber status via send timing.
    const { error } = await db.rpc("email_subscription_request", {
      p_email: email,
      p_user: user?.id ?? null,
      p_locale: body.locale,
      p_topics: body.topics,
      p_source: user ? "account_settings" : "website",
      p_version: "2026-10-20",
      p_hash: await tokenHash(token),
      p_confirmation: payload,
      p_confirmation_key: await tokenHash(`subscription-confirm:${token}`),
    });
    if (error) throw error;
    return jsonResponse(
      {
        success: true,
        message: "If confirmation is needed, an email will be sent.",
      },
      202,
      req,
    );
  } catch {
    return jsonResponse(
      { error: "Subscription service unavailable" },
      503,
      req,
    );
  }
});
