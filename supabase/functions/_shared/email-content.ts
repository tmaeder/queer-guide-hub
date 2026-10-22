import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
import { renderEmailTemplate } from "./email-render.ts";
export async function loadEmailTemplate(
  db: SupabaseClient,
  key: string,
  locale?: string | null,
) {
  const r = await db.rpc("email_template_resolve", {
    p_key: key,
    p_locale: locale ?? null,
  });
  if (r.error) throw new Error("Email content unavailable");
  if (!r.data) throw new Error("Active email template required");
  return r.data as {
    subject: string;
    html_content: string;
    text_content: string | null;
    variables: unknown;
    resolved_locale: string;
    fallback: boolean;
    version: number | null;
  };
}
export async function recipientEmailLocale(
  db: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const r = await db.from("email_subscribers").select("locale").eq(
    "user_id",
    userId,
  ).not("confirmed_at", "is", null).maybeSingle();
  if (r.error) throw new Error("Email language preference unavailable");
  return r.data?.locale ?? null;
}
export interface CatalogReference {
  kind: "event" | "venue" | "news" | "organization";
  id: string;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function catalogReferences(value: unknown): CatalogReference[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) {
    return null;
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (
      !entry || typeof entry !== "object" || Array.isArray(entry) ||
      Object.keys(entry).some((k) => !["kind", "id"].includes(k)) ||
      !["event", "venue", "news", "organization"].includes(entry.kind) ||
      typeof entry.id !== "string" || !uuid.test(entry.id) ||
      seen.has(`${entry.kind}:${entry.id.toLowerCase()}`)
    ) return null;
    seen.add(`${entry.kind}:${entry.id.toLowerCase()}`);
  }
  return value;
}
// Call with getAnonClient(), never the operator's service client: admin status
// must not make private content eligible for a public email block.
export async function publicCatalogBlocks(
  anonymous: SupabaseClient,
  refs: CatalogReference[],
) {
  const blocks = [];
  for (const ref of refs) {
    const config = {
      event: { table: "events", field: "title", path: "events" },
      venue: { table: "venues", field: "name", path: "venues" },
      news: { table: "news_articles", field: "title", path: "news" },
      organization: {
        table: "organizations",
        field: "name",
        path: "organizations",
      },
    }[ref.kind];
    let q = anonymous.from(config.table).select(`id,slug,${config.field}`).eq(
      "id",
      ref.id,
    ).is("duplicate_of_id", null);
    if (ref.kind === "venue") {
      q = q.neq("data_source", "refuge-restrooms").neq(
        "review_status",
        "archived",
      ).is("closed_at", null);
    }
    if (ref.kind === "event") {
      q = q.eq("status", "active").gt("start_date", new Date().toISOString());
    }
    if (ref.kind === "organization") q = q.eq("status", "active");
    if (ref.kind === "news") {
      q = q.is("archived_at", null).eq("quality_status", "passed").not(
        "published_at",
        "is",
        null,
      ).lte("published_at", new Date().toISOString());
    }
    const r = await q.maybeSingle();
    if (r.error) throw new Error("Public catalog unavailable");
    const row = r.data as unknown as Record<string, unknown> | null;
    if (
      !row || typeof row.slug !== "string" || !row.slug ||
      typeof row[config.field] !== "string" || !row[config.field]
    ) {
      blocks.push({ ...ref, available: false });
      continue;
    }
    const url = new URL(
      `/${config.path}/${encodeURIComponent(row.slug)}`,
      "https://queer.guide",
    ).href;
    const rendered = renderEmailTemplate({
      subject: "Catalog preview",
      html_content: '<h2><a href="{{entity_url}}">{{title}}</a></h2>',
      text_content: "{{title}}: {{entity_url}}",
    }, { title: String(row[config.field]), entity_url: url });
    blocks.push({
      ...ref,
      available: true,
      title: row[config.field],
      url,
      html: rendered.html,
      text: rendered.text,
    });
  }
  return {
    evaluated_at: new Date().toISOString(),
    blocks,
    dispatch_available: false,
  };
}
export function contactsCsv(
  rows: {
    email: string;
    status: string;
    locale: string;
    topics: string[];
    source: string;
    confirmed_at: string | null;
  }[],
) {
  const cell = (value: string) =>
    '"' +
    (/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""') +
    '"';
  return [
    "email,status,locale,topics,source,confirmed_at",
    ...rows.map((row) =>
      [
        row.email,
        row.status,
        row.locale,
        row.topics.join("|"),
        row.source,
        row.confirmed_at ?? "",
      ].map(cell).join(",")
    ),
  ].join("\r\n") + "\r\n";
}
