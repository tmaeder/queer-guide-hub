/**
 * news-keyword-alerts — sends email digests for saved news search alerts.
 *
 * Invoked by pg_cron:
 *   daily:  0 7 * * *   → p_frequency = 'daily'
 *   weekly: 0 8 * * 1   → p_frequency = 'weekly'
 *
 * For each enabled saved search due for alert, queries news_articles with
 * the saved filters + published_at > last_alerted_at, then emails a digest.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = Deno.env.get("EMAIL_FROM") ?? "alerts@queer.guide";

Deno.serve(async (req) => {
  const secret = Deno.env.get("NEWS_ALERTS_WEBHOOK_SECRET");
  if (secret) {
    const auth = req.headers.get("x-webhook-secret") ?? req.headers.get("authorization");
    if (auth !== secret && auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let frequency: "daily" | "weekly" = "daily";
  try {
    const body = await req.json() as { frequency?: string };
    if (body.frequency === "weekly") frequency = "weekly";
  } catch { /* default daily */ }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Fetch due alerts — those with alert_enabled=true, matching frequency,
  // where last_alerted_at is null OR older than the cadence window.
  const windowHours = frequency === "daily" ? 23 : 167;
  const { data: savedSearches, error: ssErr } = await db
    .from("news_saved_searches")
    .select("*, auth_users:user_id(email)")
    .eq("alert_enabled", true)
    .eq("alert_frequency", frequency)
    .or(
      `last_alerted_at.is.null,last_alerted_at.lt.${new Date(Date.now() - windowHours * 3600 * 1000).toISOString()}`,
    )
    .limit(50) as { data: Array<{
      id: string;
      user_id: string;
      name: string;
      query: string | null;
      filters: Record<string, unknown>;
      last_alerted_at: string | null;
      auth_users: { email: string } | null;
    }> | null; error: unknown };

  if (ssErr || !savedSearches?.length) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let processed = 0;
  for (const ss of savedSearches) {
    const email = ss.auth_users?.email;
    if (!email) continue;

    // Build news_articles query from saved filters
    const since = ss.last_alerted_at ?? new Date(0).toISOString();
    let q = db
      .from("news_articles")
      .select("id, slug, title, excerpt, publisher_name, published_at, category")
      .gte("published_at", since)
      .eq("quality_status", "passed")
      .is("duplicate_of_id", null)
      .order("published_at", { ascending: false })
      .limit(10);

    const f = ss.filters ?? {};
    if (ss.query?.trim()) {
      const esc = ss.query.replace(/[%_]/g, (m) => `\\${m}`);
      q = q.or(`title.ilike.%${esc}%,content.ilike.%${esc}%`);
    }
    if (Array.isArray(f.tags) && f.tags.length) q = q.overlaps("tags", f.tags as string[]);
    if (f.category) q = q.or(`category_canonical.eq.${f.category},category.eq.${f.category}`);
    if (f.language) q = q.eq("content_language", f.language);
    if (f.sourceId) q = q.eq("source_id", f.sourceId as string);
    if (Array.isArray(f.sourceIds) && f.sourceIds.length) q = q.in("source_id", f.sourceIds as string[]);
    if (f.featured) q = q.eq("is_featured", true);

    const { data: articles } = await q;
    if (!articles?.length) continue;

    const articleHtml = articles
      .map(
        (a: { slug?: string; title?: string; excerpt?: string; publisher_name?: string; published_at?: string }) =>
          `<li style="margin-bottom:12px">
            <a href="https://queer.guide/news/${a.slug ?? ""}" style="font-weight:600;color:#1a1a1a;text-decoration:none">${a.title ?? "Untitled"}</a>
            ${a.publisher_name ? `<span style="color:#666;font-size:13px"> · ${a.publisher_name}</span>` : ""}
            ${a.excerpt ? `<p style="margin:4px 0 0;color:#444;font-size:13px">${a.excerpt.slice(0, 150)}…</p>` : ""}
          </li>`,
      )
      .join("");

    const html = `
      <h2 style="font-family:sans-serif;font-size:18px;margin-bottom:8px">
        New articles for "${ss.name}"
      </h2>
      <ul style="list-style:none;padding:0;font-family:sans-serif">
        ${articleHtml}
      </ul>
      <p style="font-family:sans-serif;font-size:12px;color:#999;margin-top:16px">
        <a href="https://queer.guide/news/all">Browse all news</a> ·
        You're receiving this because you set up a keyword alert on Queer Guide.
      </p>
    `;

    try {
      await sendEmail({
        from: FROM,
        to: [email],
        subject: `[Queer Guide] ${articles.length} new article${articles.length !== 1 ? "s" : ""} for "${ss.name}"`,
        html,
      });

      await db
        .from("news_saved_searches")
        .update({ last_alerted_at: new Date().toISOString() })
        .eq("id", ss.id);

      processed++;
    } catch (err) {
      console.error("Failed to send alert for", ss.id, err);
    }
  }

  return new Response(JSON.stringify({ processed, frequency }), {
    headers: { "Content-Type": "application/json" },
  });
});
