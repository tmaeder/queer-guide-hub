/**
 * Shared email sending abstraction using Resend.
 * Migrated from supabase/functions/_shared/email.ts
 */

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

export function isEmailConfigured(env: { RESEND_API_KEY?: string }): boolean {
  return !!env.RESEND_API_KEY;
}

export async function sendEmail(
  msg: EmailMessage,
  env: { RESEND_API_KEY?: string },
): Promise<EmailResult> {
  if (!env.RESEND_API_KEY) {
    throw new Error('Email service not configured (RESEND_API_KEY missing)');
  }

  const payload: Record<string, unknown> = {
    from: msg.from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
  };
  if (msg.text) payload.text = msg.text;
  if (msg.headers) payload.headers = msg.headers;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as { id?: string; message?: string };
  if (!res.ok) {
    return { id: null, error: data.message || `Resend error ${res.status}` };
  }
  return { id: data.id || null, error: null };
}
