import { sendEmail } from "../_shared/email.ts";
import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts';

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

interface NotificationRequest {
  notification_type: 'mention' | 'new_post' | 'new_announcement' | 'new_poll';
  group_id: string;
  group_name: string;
  user_email: string;
  user_name: string;
  triggered_by_name: string;
  content: string;
  post_url?: string;
}

const handler = async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response('ok', { headers: cors });
  }

  try {
    const serviceClient = getServiceClient();
    const authResult = await requireAdmin(req, serviceClient);
    if (authResult instanceof Response) return authResult;

    const {
      notification_type,
      group_name,
      user_email,
      user_name,
      triggered_by_name,
      content,
      post_url
    }: NotificationRequest = await req.json();

    const safeTriggeredByName = escapeHtml(triggered_by_name);
    const safeUserName = escapeHtml(user_name);
    const safeGroupName = escapeHtml(group_name);
    const safeContent = escapeHtml(content);
    const safePostUrl = post_url ? escapeHtml(post_url) : '';

    let subject = '';
    let htmlContent = '';

    switch (notification_type) {
      case 'mention':
        subject = `${safeTriggeredByName} mentioned you in ${safeGroupName}`;
        htmlContent = `
          <h2>You were mentioned in ${safeGroupName}</h2>
          <p>Hi ${safeUserName},</p>
          <p><strong>${safeTriggeredByName}</strong> mentioned you in a post:</p>
          <blockquote style="border-left:3px solid #111111;padding-left:16px;margin:16px 0;color:#3f3f3a;">
            ${safeContent}
          </blockquote>
          ${post_url ? `<p><a href="${safePostUrl}" style="background:#111111;color:#FAFAF5;padding:12px 20px;text-decoration:none;border-radius:12px;display:inline-block;font-weight:700;">View Post</a></p>` : ''}
          <p>Best regards,<br>The ${safeGroupName} Group</p>
        `;
        break;

      case 'new_announcement':
        subject = `New announcement in ${safeGroupName}`;
        htmlContent = `
          <h2>New announcement in ${safeGroupName}</h2>
          <p>Hi ${safeUserName},</p>
          <p><strong>${safeTriggeredByName}</strong> made an important announcement:</p>
          <div style="background:#EAEADE;border-radius:12px;padding:16px;margin:16px 0;">
            <h3 style="margin:0 0 8px 0;color:#111111;font-size:15px;">Announcement</h3>
            <p style="margin:0;color:#111111;">${safeContent}</p>
          </div>
          ${post_url ? `<p><a href="${safePostUrl}" style="background:#111111;color:#FAFAF5;padding:12px 20px;text-decoration:none;border-radius:12px;display:inline-block;font-weight:700;">View Announcement</a></p>` : ''}
          <p>Best regards,<br>The ${safeGroupName} Group</p>
        `;
        break;

      case 'new_poll':
        subject = `New poll in ${safeGroupName} - Your input needed!`;
        htmlContent = `
          <h2>🗳️ New Poll in ${safeGroupName}</h2>
          <p>Hi ${safeUserName},</p>
          <p><strong>${safeTriggeredByName}</strong> created a new poll and wants your input:</p>
          <div style="background:#EAEADE;border-radius:12px;padding:16px;margin:16px 0;">
            <h3 style="margin:0 0 8px 0;color:#111111;font-size:15px;">Poll question</h3>
            <p style="margin:0;color:#111111;">${safeContent}</p>
          </div>
          ${post_url ? `<p><a href="${safePostUrl}" style="background:#111111;color:#FAFAF5;padding:12px 20px;text-decoration:none;border-radius:12px;display:inline-block;font-weight:700;">Vote Now</a></p>` : ''}
          <p>Your vote matters! Join the discussion and share your opinion.</p>
          <p>Best regards,<br>The ${safeGroupName} Group</p>
        `;
        break;

      default:
        subject = `New activity in ${safeGroupName}`;
        htmlContent = `
          <h2>New Activity in ${safeGroupName}</h2>
          <p>Hi ${safeUserName},</p>
          <p>There's new activity in your group:</p>
          <p>${safeContent}</p>
          ${post_url ? `<p><a href="${safePostUrl}" style="background:#111111;color:#FAFAF5;padding:12px 20px;text-decoration:none;border-radius:12px;display:inline-block;font-weight:700;">View Post</a></p>` : ''}
          <p>Best regards,<br>The ${safeGroupName} Group</p>
        `;
    }

    const emailResult = await sendEmail({
      from: "Community Groups <noreply@resend.dev>",
      to: [user_email],
      subject,
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; line-height: 1.6; color: #374151;">
          ${htmlContent}
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0;">
          <div style="text-align: center; color: #6B7280; font-size: 14px;">
            <p>You're receiving this because you're a member of ${safeGroupName}.</p>
            <p>To manage your notification preferences, visit your group settings.</p>
          </div>
        </div>
      `,
    });

    if (emailResult.error) {
      throw new Error(emailResult.error);
    }

    console.log("Group notification email sent successfully:", emailResult.id);

    return new Response(JSON.stringify({ data: { id: emailResult.id } }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...cors,
      },
    });
  } catch (error: unknown) {
    console.error("Error in send-group-notifications function:", error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...cors },
      }
    );
  }
};

Deno.serve(handler);
