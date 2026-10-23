import {
  corsResponse,
  getServiceClient,
  jsonResponse,
} from "../_shared/supabase-client.ts";
import { isEmailConfigured } from "../_shared/email.ts";
import { dispatchEmail, type OutboxRow } from "../_shared/email-outbox.ts";
import { stripEmailEditorMetadata } from "../_shared/email-template-content.ts";
import { toPlainText } from "../_shared/branding.ts";

type Database = ReturnType<typeof getServiceClient>;
interface Dependencies {
  db: Database;
  configured?: () => boolean;
  dispatch?: typeof dispatchEmail;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const deliveryStates = new Set([
  "queued",
  "processing",
  "accepted",
  "deferred",
  "uncertain",
  "delivered",
  "failed",
  "bounced",
  "suppressed",
  "complained",
]);
function privateResponse(body: unknown, status: number, req: Request) {
  const response = jsonResponse(body, status, req);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
async function readBody(req: Request): Promise<Record<string, unknown>> {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("invalid_message");
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 128000) {
      await reader.cancel();
      throw new Error("message_too_large");
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  const body = JSON.parse(new TextDecoder().decode(bytes));
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("invalid_message");
  }
  return body;
}

/** Reads never send; every submission persists before crossing the provider boundary. */
export async function handleMailboxSend(
  req: Request,
  dependencies?: Dependencies,
): Promise<Response> {
  if (req.method === "OPTIONS") return corsResponse(req);
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }
  const token = /^Bearer (.+)$/i.exec(req.headers.get("Authorization") ?? "")
    ?.[1];
  if (!token) return jsonResponse({ error: "Unauthorized" }, 401, req);
  try {
    const db = dependencies?.db ?? getServiceClient();
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) {
      return jsonResponse({ error: "Unauthorized" }, 401, req);
    }
    if (req.method === "GET") {
      const params = new URL(req.url).searchParams;
      const emailId = params.get("email_id")?.toLowerCase();
      if (
        !emailId || !uuid.test(emailId) ||
        params.getAll("email_id").length !== 1 ||
        [...params.keys()].some((key) => key !== "email_id")
      ) {
        return privateResponse(
          { error: "Invalid message reference." },
          400,
          req,
        );
      }
      // Private proof binds the visible copy to the authenticated sender. Legacy
      // mailbox.status values alone cannot establish that a message was delivered.
      const source = await db.from("email_mailbox_sends")
        .select("request_id")
        .eq("owner_id", data.user.id)
        .eq("mailbox_email_id", emailId)
        .maybeSingle();
      if (source.error) {
        return privateResponse(
          { error: "Delivery status could not be read." },
          503,
          req,
        );
      }
      if (!source.data) {
        return privateResponse({ delivery_status: null }, 200, req);
      }
      const receipt = await db.rpc("email_mailbox_status", {
        p_user: data.user.id,
        p_request: source.data.request_id,
      });
      if (receipt.error) {
        return privateResponse(
          { error: "Delivery status could not be read." },
          receipt.error.message === "operator_account_disabled" ? 403 : 503,
          req,
        );
      }
      // Erasure/copy removal can race the two reads; reveal no stale identity.
      if (!receipt.data || receipt.data.email_id !== emailId) {
        return privateResponse({ delivery_status: null }, 200, req);
      }
      if (!deliveryStates.has(receipt.data.status)) {
        return privateResponse(
          { error: "Delivery status could not be read." },
          503,
          req,
        );
      }
      return privateResponse(
        { delivery_status: receipt.data.status },
        200,
        req,
      );
    }
    if (!(dependencies?.configured ?? isEmailConfigured)()) {
      return jsonResponse({ error: "Email service not configured" }, 503, req);
    }
    const body = await readBody(req);
    if (
      Object.keys(body).some((k) =>
        ![
          "request_id",
          "to",
          "subject",
          "body_html",
          "body_text",
          "in_reply_to_email_id",
        ].includes(k)
      ) ||
      typeof body.request_id !== "string" || !uuid.test(body.request_id) ||
      typeof body.to !== "string" || typeof body.subject !== "string" ||
      (body.body_html !== undefined && typeof body.body_html !== "string") ||
      (body.body_text !== undefined && typeof body.body_text !== "string") ||
      (body.in_reply_to_email_id !== undefined &&
        (typeof body.in_reply_to_email_id !== "string" ||
          !uuid.test(body.in_reply_to_email_id)))
    ) {
      return jsonResponse(
        {
          error:
            "Invalid message. Refresh the page before retrying older drafts.",
        },
        400,
        req,
      );
    }
    const html = stripEmailEditorMetadata(body.body_html as string ?? "");
    const message = {
      to: body.to.trim().toLowerCase(),
      subject: body.subject.trim(),
      body_html: html,
      body_text: body.body_text ?? toPlainText(html),
      ...(body.in_reply_to_email_id
        ? { in_reply_to_email_id: body.in_reply_to_email_id }
        : {}),
    };
    const prepared = await db.rpc("email_mailbox_prepare", {
      p_user: data.user.id,
      p_request: body.request_id,
      p_message: message,
    });
    if (prepared.error || !prepared.data) {
      const reason = prepared.error?.message;
      const known: Record<string, [number, string]> = {
        mailbox_request_conflict: [
          409,
          "This request already belongs to a different message.",
        ],
        mailbox_required: [
          400,
          "Claim a mailbox address before sending email.",
        ],
        reply_not_owned: [403, "The reply message is unavailable."],
        operator_account_disabled: [403, "Email is disabled for this account."],
        invalid_message: [400, "Invalid recipient, subject or message."],
      };
      const [status, error] = known[reason ?? ""] ??
        [503, "Message could not be saved. Retry this same message."];
      return jsonResponse({ error }, status, req);
    }
    let current = prepared.data;
    try {
      if (["queued", "processing"].includes(current.status)) {
        const claim = await db.rpc("email_claim", {
          p_limit: 1,
          p_id: current.outbox_id,
        });
        if (claim.error) throw new Error("claim_failed");
        if (claim.data?.[0]) {
          await (dependencies?.dispatch ?? dispatchEmail)(
            db,
            claim.data[0] as OutboxRow,
          );
        }
      }
      const latest = await db.rpc("email_mailbox_status", {
        p_user: data.user.id,
        p_request: body.request_id,
      });
      if (latest.error || !latest.data) throw new Error("status_unavailable");
      current = latest.data;
    } catch {
      // The immutable message exists even if the response or receipt read failed.
      // Never invite a fresh send or claim that acceptance means delivery.
      current = { ...current, status: "pending", provider_id: null };
    }
    const failed = ["failed", "bounced", "suppressed", "complained"].includes(
      current.status,
    );
    const response = jsonResponse(
      {
        success: !failed,
        email_id: current.email_id,
        outbox_id: current.outbox_id,
        provider_id: current.provider_id,
        resend_id: current.provider_id,
        delivery_status: current.status,
        ...(failed
          ? {
            error:
              "Message was not delivered. Check its saved status before starting another send.",
          }
          : {}),
      },
      failed
        ? 422
        : ["accepted", "delivered"].includes(current.status)
        ? 200
        : 202,
      req,
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (req.method === "GET") {
      return privateResponse(
        { error: "Delivery status could not be read." },
        503,
        req,
      );
    }
    const large = error instanceof Error &&
      error.message === "message_too_large";
    const invalid = error instanceof SyntaxError ||
      (error instanceof Error && error.message === "invalid_message");
    return jsonResponse(
      {
        error: large
          ? "Message is too large."
          : invalid
          ? "Invalid message."
          : "Message could not be saved. Retry this same message.",
      },
      large ? 413 : invalid ? 400 : 503,
      req,
    );
  }
}
