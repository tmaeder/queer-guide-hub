import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  getServiceClient,
  requireAdmin,
  corsResponse,
  jsonResponse,
  errorResponse,
} from "../_shared/supabase-client.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsResponse(req);
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, req);
  }

  const supabase = getServiceClient();

  const auth = await requireAdmin(req, supabase);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json();
    const { email, password, display_name, first_name, last_name, pronouns, location } = body;

    if (!email || !password) {
      return errorResponse("email and password are required", 400, req);
    }

    if (password.length < 8) {
      return errorResponse("Password must be at least 8 characters", 400, req);
    }

    // Create auth user — handle_new_user() trigger auto-creates profile row
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: display_name || email,
      },
    });

    if (createError) {
      return errorResponse(createError.message, 400, req);
    }

    const newUserId = createData.user.id;

    // Update profile with extra fields (trigger only sets display_name)
    const profileUpdates: Record<string, unknown> = {};
    if (first_name) profileUpdates.first_name = first_name;
    if (last_name) profileUpdates.last_name = last_name;
    if (pronouns) profileUpdates.pronouns = pronouns;
    if (location) profileUpdates.location = location;
    if (display_name) profileUpdates.display_name = display_name;

    if (Object.keys(profileUpdates).length > 0) {
      profileUpdates.updated_at = new Date().toISOString();
      const { error: profileError } = await supabase
        .from("profiles")
        .update(profileUpdates)
        .eq("user_id", newUserId);

      if (profileError) {
        console.error("Profile update failed (user still created):", profileError.message);
      }
    }

    // Audit log
    await supabase.rpc("log_security_event", {
      p_event_type: "USER_CREATED_BY_ADMIN",
      p_user_id: auth.userId,
      p_metadata: {
        created_user_id: newUserId,
        created_email: email,
      },
      p_severity: "info",
    });

    return jsonResponse(
      {
        success: true,
        user: {
          id: newUserId,
          email: createData.user.email,
          display_name: display_name || email,
        },
      },
      201,
      req
    );
  } catch (err) {
    console.error("admin-create-user error:", err);
    return errorResponse("Internal server error", 500, req);
  }
});
