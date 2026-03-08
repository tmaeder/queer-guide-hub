/**
 * Shared email sending abstraction.
 * Currently backed by Resend; swap implementation to AWS SES
 * by changing only this file.
 */

import { Resend } from "npm:resend@2.0.0";

export interface EmailMessage {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}

export interface EmailResult {
  id: string | null;
  error: string | null;
}

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

/**
 * Send a single email. Returns a normalized result regardless of provider.
 * Throws if the email service is not configured.
 */
export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const resend = getResend();
  if (!resend) {
    throw new Error("Email service not configured (RESEND_API_KEY missing)");
  }

  const payload: any = {
    from: msg.from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
  };
  if (msg.text) payload.text = msg.text;
  if (msg.headers) payload.headers = msg.headers;

  const result = await resend.emails.send(payload);

  return {
    id: result.data?.id ?? null,
    error: result.error?.message ?? null,
  };
}

/** Check if the email provider is configured. */
export function isEmailConfigured(): boolean {
  return !!Deno.env.get("RESEND_API_KEY");
}
