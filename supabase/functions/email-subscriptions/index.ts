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
      const { data, error } = await db.from("email_subscribers").select(
        "status,topics,locale,confirmed_at",
      ).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return jsonResponse({ subscription: data }, 200, req);
    }
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, req);
    }
    const raw = await req.text();
    if (raw.length > 4000) {
      return jsonResponse({ error: "Request too large" }, 413, req);
    }
    const body = JSON.parse(raw);
    if (
      !validTopics(body.topics) || typeof body.locale !== "string" ||
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
      const verify = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          signal: AbortSignal.timeout(10000),
          body: new URLSearchParams({ secret, response: body.turnstileToken }),
        },
      );
      const proof = await verify.json();
      if (
        !proof.success ||
        !["queer.guide", "www.queer.guide"].includes(proof.hostname) ||
        proof.action !== "email-subscribe"
      ) return jsonResponse({ error: "Verification failed" }, 400, req);
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
