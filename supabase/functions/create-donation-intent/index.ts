import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Missing STRIPE_SECRET_KEY. Please set this secret in Supabase." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const { amount, currency = "usd", donor_email, donor_name, message } = await req.json().catch(() => ({}));

    const amountInt = Number(amount);
    if (!Number.isFinite(amountInt) || amountInt < 100) {
      return new Response(
        JSON.stringify({ error: "Invalid amount. Minimum is 100 (i.e. $1.00)." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const intent = await stripe.paymentIntents.create({
      amount: amountInt,
      currency,
      automatic_payment_methods: { enabled: true },
      receipt_email: donor_email,
      description: `Donation to Queer Guide`,
      metadata: {
        donor_email: donor_email || "",
        donor_name: donor_name || "",
        message: message || "",
        source: "queer-guide"
      }
    });

    return new Response(JSON.stringify({ client_secret: intent.client_secret }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
