import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { getCorsHeaders, corsResponse, jsonResponse, errorResponse, getServiceClient } from "../_shared/supabase-client.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-12-18.acacia" });

serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse(req);
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, req);

  try {
    const {
      amount,
      currency = "usd",
      donation_type = "one_time",
      interval,
      donor_name,
      email,
      message,
      is_anonymous = false,
    } = await req.json();

    // Validate required fields
    if (!email || typeof email !== "string") {
      return errorResponse("Email is required", 400, req);
    }
    if (!amount || typeof amount !== "number" || amount < 100) {
      return errorResponse("Amount must be at least 100 cents ($1.00)", 400, req);
    }
    if (amount > 99999900) {
      return errorResponse("Amount exceeds maximum", 400, req);
    }
    if (!["one_time", "recurring"].includes(donation_type)) {
      return errorResponse("Invalid donation_type", 400, req);
    }
    if (donation_type === "recurring" && !["month", "year"].includes(interval)) {
      return errorResponse("Recurring donations require interval: month or year", 400, req);
    }

    // Optionally extract authenticated user
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const supabase = getServiceClient();
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabase.auth.getUser(token);
      if (data?.user) userId = data.user.id;
    }

    const origin = req.headers.get("Origin") || "https://queer.guide";
    const successUrl = `${origin}/donate?status=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/donate?status=cancel`;

    const metadata: Record<string, string> = {
      donor_name: donor_name || "",
      message: message || "",
      is_anonymous: String(is_anonymous),
      ...(userId ? { user_id: userId } : {}),
    };

    let session: Stripe.Checkout.Session;

    if (donation_type === "recurring") {
      // Recurring: create a subscription via Checkout
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: email,
        line_items: [
          {
            price_data: {
              currency,
              product_data: { name: "Queer Guide Monthly Support" },
              unit_amount: amount,
              recurring: { interval: interval as "month" | "year" },
            },
            quantity: 1,
          },
        ],
        metadata,
        subscription_data: { metadata },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } else {
      // One-time payment via Checkout
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: email,
        line_items: [
          {
            price_data: {
              currency,
              product_data: { name: "Queer Guide Donation" },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        metadata,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    }

    // Insert pending donation record
    const supabase = getServiceClient();
    await supabase.from("donations").insert({
      user_id: userId,
      email,
      amount,
      currency,
      stripe_session_id: session.id,
      donor_name: donor_name || null,
      message: message || null,
      is_anonymous,
      status: "pending",
      donation_type,
      recurring_interval: donation_type === "recurring" ? interval : null,
    });

    return jsonResponse({ url: session.url }, 200, req);
  } catch (err) {
    console.error("create-checkout-session error:", err);
    if (err instanceof Stripe.errors.StripeError) {
      return errorResponse(err.message, 400, req);
    }
    return errorResponse("Internal server error", 500, req);
  }
});
