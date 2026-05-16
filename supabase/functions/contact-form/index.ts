import { corsResponse, jsonResponse, errorResponse, getServiceClient } from "../_shared/supabase-client.ts";
import { sendEmail, isEmailConfigured } from "../_shared/email.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse(req);
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, req);

  try {
    const { name, email, category, message } = await req.json();

    if (!name || typeof name !== "string" || name.length < 2) {
      return errorResponse("Name is required", 400, req);
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return errorResponse("Valid email is required", 400, req);
    }
    if (!category || typeof category !== "string") {
      return errorResponse("Category is required", 400, req);
    }
    if (!message || typeof message !== "string" || message.length < 10) {
      return errorResponse("Message must be at least 10 characters", 400, req);
    }

    const serviceClient = getServiceClient();

    // Rate limit: max 3 submissions per email per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await serviceClient
      .from("contact_submissions")
      .select("*", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", oneHourAgo);

    if (count && count >= 3) {
      return errorResponse("Too many submissions. Please try again later.", 429, req);
    }

    // Get user_id from auth header if present
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data } = await serviceClient.auth.getUser(token);
      userId = data.user?.id ?? null;
    }

    // Insert submission
    const { error: insertError } = await serviceClient
      .from("contact_submissions")
      .insert({ name, email, category, message, user_id: userId });

    if (insertError) throw insertError;

    // Send email notification
    if (isEmailConfigured()) {
      await sendEmail({
        from: "Queer Guide <noreply@queer.guide>",
        to: ["support@queer.guide"],
        subject: `[Contact] ${category}: ${name}`.replace(/[\r\n]/g, " "),
        html: `
          <h2>New Contact Submission</h2>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Category:</strong> ${escapeHtml(category)}</p>
          <p><strong>Message:</strong></p>
          <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
        `,
        text: `New contact submission\n\nName: ${name}\nEmail: ${email}\nCategory: ${category}\n\nMessage:\n${message}`,
      }).catch(() => {
        // Email failure shouldn't block the submission
      });
    }

    return jsonResponse({ success: true }, 200, req);
  } catch (err) {
    return errorResponse(err.message ?? "Internal error", 500, req);
  }
});
