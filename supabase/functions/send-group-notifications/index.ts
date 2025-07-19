import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      notification_type, 
      group_name, 
      user_email, 
      user_name, 
      triggered_by_name, 
      content,
      post_url
    }: NotificationRequest = await req.json();

    let subject = '';
    let htmlContent = '';

    switch (notification_type) {
      case 'mention':
        subject = `${triggered_by_name} mentioned you in ${group_name}`;
        htmlContent = `
          <h2>You were mentioned in ${group_name}</h2>
          <p>Hi ${user_name},</p>
          <p><strong>${triggered_by_name}</strong> mentioned you in a post:</p>
          <blockquote style="border-left: 4px solid #4F46E5; padding-left: 16px; margin: 16px 0; color: #6B7280;">
            ${content}
          </blockquote>
          ${post_url ? `<p><a href="${post_url}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Post</a></p>` : ''}
          <p>Best regards,<br>The ${group_name} Group</p>
        `;
        break;
      
      case 'new_announcement':
        subject = `New announcement in ${group_name}`;
        htmlContent = `
          <h2>📢 New Announcement in ${group_name}</h2>
          <p>Hi ${user_name},</p>
          <p><strong>${triggered_by_name}</strong> made an important announcement:</p>
          <div style="background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <h3 style="margin: 0 0 8px 0; color: #92400E;">📢 Announcement</h3>
            <p style="margin: 0; color: #92400E;">${content}</p>
          </div>
          ${post_url ? `<p><a href="${post_url}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Announcement</a></p>` : ''}
          <p>Best regards,<br>The ${group_name} Group</p>
        `;
        break;
      
      case 'new_poll':
        subject = `New poll in ${group_name} - Your input needed!`;
        htmlContent = `
          <h2>🗳️ New Poll in ${group_name}</h2>
          <p>Hi ${user_name},</p>
          <p><strong>${triggered_by_name}</strong> created a new poll and wants your input:</p>
          <div style="background: #EEF2FF; border: 1px solid #4F46E5; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <h3 style="margin: 0 0 8px 0; color: #4F46E5;">🗳️ Poll Question</h3>
            <p style="margin: 0; color: #4F46E5;">${content}</p>
          </div>
          ${post_url ? `<p><a href="${post_url}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Vote Now</a></p>` : ''}
          <p>Your vote matters! Join the discussion and share your opinion.</p>
          <p>Best regards,<br>The ${group_name} Group</p>
        `;
        break;
      
      default:
        subject = `New activity in ${group_name}`;
        htmlContent = `
          <h2>New Activity in ${group_name}</h2>
          <p>Hi ${user_name},</p>
          <p>There's new activity in your group:</p>
          <p>${content}</p>
          ${post_url ? `<p><a href="${post_url}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Post</a></p>` : ''}
          <p>Best regards,<br>The ${group_name} Group</p>
        `;
    }

    const emailResponse = await resend.emails.send({
      from: "Community Groups <noreply@resend.dev>",
      to: [user_email],
      subject: subject,
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; line-height: 1.6; color: #374151;">
          ${htmlContent}
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0;">
          <div style="text-align: center; color: #6B7280; font-size: 14px;">
            <p>You're receiving this because you're a member of ${group_name}.</p>
            <p>To manage your notification preferences, visit your group settings.</p>
          </div>
        </div>
      `,
    });

    console.log("Group notification email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-group-notifications function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);