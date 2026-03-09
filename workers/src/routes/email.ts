/**
 * Email routes — send-mailbox, send-templated, send-bulk, send-group-notification.
 * Migrated from Supabase Edge Functions.
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { sendEmail, isEmailConfigured } from '../lib/email';

const email = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const DEFAULT_FROM = 'Queer Guide <noreply@queer.guide>';

// ── POST /email/send-mailbox ──
email.post('/send-mailbox', requireAuth, async (c) => {
  if (!isEmailConfigured(c.env)) {
    return c.json({ error: 'Email service not configured' }, 503);
  }
  const user = c.get('user');
  const body = await c.req.json<{
    to: string; subject: string; body_html?: string; body_text?: string; in_reply_to_email_id?: string;
  }>();

  if (!body.to || !body.subject) {
    return c.json({ error: 'to and subject are required' }, 400);
  }

  // Load user mailbox config
  const mailbox = await c.env.DB.prepare(
    'SELECT * FROM mailbox_accounts WHERE user_id = ? AND is_active = 1 LIMIT 1'
  ).bind(user.id).first<{ id: string; from_email: string; from_name: string }>();

  const fromAddr = mailbox
    ? `${mailbox.from_name} <${mailbox.from_email}>`
    : DEFAULT_FROM;

  const headers: Record<string, string> = {};
  if (body.in_reply_to_email_id) {
    const orig = await c.env.DB.prepare(
      'SELECT message_id FROM mailbox_emails WHERE id = ?'
    ).bind(body.in_reply_to_email_id).first<{ message_id: string }>();
    if (orig?.message_id) headers['In-Reply-To'] = orig.message_id;
  }

  const result = await sendEmail({
    from: fromAddr, to: [body.to], subject: body.subject,
    html: body.body_html || `<pre>${escapeHtml(body.body_text || '')}</pre>`,
    text: body.body_text, headers,
  }, c.env);

  // Log sent email
  await c.env.DB.prepare(
    `INSERT INTO mailbox_sent_emails (id, user_id, to_email, subject, message_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), user.id, body.to, body.subject, result.id, new Date().toISOString()).run().catch(() => {});

  if (result.error) return c.json({ error: result.error }, 500);
  return c.json({ success: true, id: result.id });
});

// ── POST /email/send-templated ──
email.post('/send-templated', requireAuth, requireAdmin, async (c) => {
  if (!isEmailConfigured(c.env)) {
    return c.json({ error: 'Email service not configured' }, 503);
  }
  const body = await c.req.json<{
    template_key: string; to_email: string; variables: Record<string, string>; is_test?: boolean;
  }>();

  if (!body.template_key || !body.to_email) {
    return c.json({ error: 'template_key and to_email are required' }, 400);
  }

  const tpl = await c.env.DB.prepare(
    'SELECT * FROM email_templates WHERE key = ? AND is_active = 1'
  ).bind(body.template_key).first<{ subject: string; body_html: string; from_email?: string }>();

  if (!tpl) return c.json({ error: `Template '${body.template_key}' not found` }, 404);

  let subject = tpl.subject;
  let html = tpl.body_html;
  for (const [k, v] of Object.entries(body.variables || {})) {
    const safe = escapeHtml(v);
    subject = subject.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
    html = html.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), safe);
  }

  if (body.is_test) {
    return c.json({ success: true, preview: { subject, html }, test: true });
  }

  const result = await sendEmail({
    from: tpl.from_email || DEFAULT_FROM, to: [body.to_email], subject, html,
  }, c.env);

  if (result.error) return c.json({ error: result.error }, 500);
  return c.json({ success: true, id: result.id });
});

// ── POST /email/send-bulk ──
email.post('/send-bulk', requireAuth, requireAdmin, async (c) => {
  if (!isEmailConfigured(c.env)) {
    return c.json({ error: 'Email service not configured' }, 503);
  }
  const body = await c.req.json<{
    template_key: string;
    recipients: Array<{ email: string; variables?: Record<string, string> }>;
    global_variables?: Record<string, string>;
    is_test?: boolean;
  }>();

  const tpl = await c.env.DB.prepare(
    'SELECT * FROM email_templates WHERE key = ? AND is_active = 1'
  ).bind(body.template_key).first<{ subject: string; body_html: string; from_email?: string }>();

  if (!tpl) return c.json({ error: `Template '${body.template_key}' not found` }, 404);

  const results: Array<{ email: string; success: boolean; error?: string }> = [];

  for (const recipient of body.recipients) {
    const vars = { ...(body.global_variables || {}), ...(recipient.variables || {}) };
    let subject = tpl.subject;
    let html = tpl.body_html;
    for (const [k, v] of Object.entries(vars)) {
      subject = subject.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
      html = html.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), escapeHtml(v));
    }

    if (body.is_test) {
      results.push({ email: recipient.email, success: true });
      continue;
    }

    try {
      const r = await sendEmail({
        from: tpl.from_email || DEFAULT_FROM, to: [recipient.email], subject, html,
      }, c.env);
      results.push({ email: recipient.email, success: !r.error, error: r.error || undefined });
    } catch (e: unknown) {
      results.push({ email: recipient.email, success: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const sent = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  return c.json({ success: true, sent, failed, results, test: body.is_test || false });
});

// ── POST /email/send-group-notification ──
email.post('/send-group-notification', requireAuth, requireAdmin, async (c) => {
  if (!isEmailConfigured(c.env)) {
    return c.json({ error: 'Email service not configured' }, 503);
  }
  const body = await c.req.json<{
    notification_type: 'mention' | 'new_post' | 'new_announcement' | 'new_poll';
    group_id: string; group_name: string;
    user_email: string; user_name: string; triggered_by_name: string;
    content: string; post_url?: string;
  }>();

  // Fetch group members with notification prefs
  const members = await c.env.DB.prepare(
    `SELECT u.email, u.raw_user_meta_data, gm.notification_preferences
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = ? AND gm.is_active = 1`
  ).bind(body.group_id).all<{
    email: string; raw_user_meta_data: string; notification_preferences: string;
  }>();

  const subjects: Record<string, string> = {
    mention: `${body.triggered_by_name} mentioned you in ${body.group_name}`,
    new_post: `New post in ${body.group_name} by ${body.triggered_by_name}`,
    new_announcement: `Announcement in ${body.group_name}`,
    new_poll: `New poll in ${body.group_name}`,
  };

  let sent = 0;
  for (const member of members.results || []) {
    if (member.email === body.user_email) continue; // don't notify self
    const prefs = member.notification_preferences ? JSON.parse(member.notification_preferences) : {};
    if (prefs[body.notification_type] === false) continue;

    const html = `<p><strong>${escapeHtml(body.triggered_by_name)}</strong> ${body.notification_type.replace(/_/g, ' ')} in <strong>${escapeHtml(body.group_name)}</strong>:</p>
      <blockquote>${escapeHtml(body.content.slice(0, 500))}</blockquote>
      ${body.post_url ? `<p><a href="${escapeHtml(body.post_url)}">View post</a></p>` : ''}`;

    try {
      await sendEmail({
        from: DEFAULT_FROM, to: [member.email],
        subject: subjects[body.notification_type] || `Notification from ${body.group_name}`,
        html,
      }, c.env);
      sent++;
    } catch { /* best effort */ }
  }

  return c.json({ success: true, sent, total_members: members.results?.length || 0 });
});

export { email };
