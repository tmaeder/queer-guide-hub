import { toPlainText } from "./branding.ts";
/** Durable application outbox. Cloudflare is the only delivery provider. */
import { tokenHash } from "./email-subscription.ts";
import { getServiceClient } from "./supabase-client.ts";
import { stripEmailEditorMetadata } from "./email-template-content.ts";
import { dispatchEmail, type OutboxRow } from "./email-outbox.ts";
export interface EmailMessage {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  templateKey?: string;
  recipientUserId?: string;
  journey?: { runId: string; leaseId: string; stepId: string };
  category?: "transactional" | "newsletter" | "marketing";
}
export interface EmailResult {
  id: string | null;
  error: string | null;
}
export function isEmailConfigured(): boolean {
  try {
    return new URL(Deno.env.get("EMAIL_GATEWAY_URL") ?? "").protocol ===
        "https:" && !!Deno.env.get("EMAIL_GATEWAY_SECRET");
  } catch {
    return false;
  }
}
export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  if (!isEmailConfigured()) {
    throw new Error("Cloudflare email delivery not configured");
  }
  if (msg.category && msg.category !== "transactional") {
    throw new Error("cloudflare_transactional_only");
  }
  if (!Array.isArray(msg.to) || msg.to.length < 1 || msg.to.length > 50) {
    throw new Error("Invalid recipients");
  }
  const db = getServiceClient();
  const baseKey = msg.idempotencyKey ?? crypto.randomUUID();
  let providerId: string | null = null;
  for (
    const address of [...new Set(msg.to.map((e) => e.trim().toLowerCase()))]
  ) {
    const html = stripEmailEditorMetadata(msg.html);
    const payload = {
      category: "transactional",
      from: msg.from,
      to: address,
      subject: msg.subject,
      html,
      text: msg.text ??
        toPlainText(html),
      headers: msg.headers ?? {},
    };
    const key = await tokenHash(`${baseKey}:${address}`);
    // A retry of an explicit logical event uses its first immutable snapshot,
    // even if branding or unread counts have changed since it was queued.
    const prior = msg.idempotencyKey
      ? await db.from("email_outbox").select("*").eq("idempotency_key", key)
        .maybeSingle()
      : null;
    if (prior?.error) throw new Error("Could not read email identity");
    const queued = msg.journey
      ? await db.rpc("email_journey_enqueue", {
        p_key: key,
        p_recipient: address,
        p_payload: prior?.data?.payload ?? payload,
        p_template: msg.templateKey ?? null,
        p_user: msg.recipientUserId ?? null,
        p_run: msg.journey.runId,
        p_lease: msg.journey.leaseId,
        p_step: msg.journey.stepId,
      }).single()
      : prior?.data
      ? { data: prior.data, error: null }
      : await db.rpc("email_enqueue", {
        p_key: key,
        p_recipient: address,
        p_payload: payload,
        p_template: msg.templateKey ?? null,
        p_user: msg.recipientUserId ?? null,
      }).single();
    if (queued.error || !queued.data) {
      throw new Error(
        "Could not persist email",
      );
    }
    let row = queued.data as OutboxRow;
    if (["queued", "processing"].includes(row.status)) {
      const claimed = await db.rpc("email_claim", { p_id: row.id, p_limit: 1 });
      if (claimed.error) throw new Error("Could not claim email");
      if (claimed.data?.[0]) {
        await dispatchEmail(
          db,
          claimed.data[0] as OutboxRow,
        );
      }
      const refreshed = await db.from("email_outbox").select("*").eq(
        "id",
        row.id,
      ).single();
      if (refreshed.error) throw new Error("Could not read email outcome");
      row = refreshed.data as OutboxRow;
    }
    if (
      !["accepted", "delivered", "deferred"].includes(row.status) ||
      !row.provider_id
    ) {
      throw new Error(
        `Email ${row.status}: ${row.last_error ?? "delivery pending"}`,
      );
    }
    providerId = row.provider_id;
  }
  return { id: providerId, error: null };
}
