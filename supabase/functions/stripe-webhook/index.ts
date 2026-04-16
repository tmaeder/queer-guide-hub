import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { getServiceClient } from "../_shared/supabase-client.ts";
import { reportApiError } from "../_shared/report-api-error.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-12-18.acacia" });
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const supabase = getServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const update: Record<string, unknown> = {
          status: "completed",
          updated_at: new Date().toISOString(),
        };

        if (session.customer) {
          update.stripe_customer_id = typeof session.customer === "string"
            ? session.customer
            : session.customer.id;
        }
        if (session.subscription) {
          update.stripe_subscription_id = typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        }

        const { error } = await supabase
          .from("donations")
          .update(update)
          .eq("stripe_session_id", session.id);

        if (error) console.error("Failed to update donation:", error);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;

        const subscriptionId = typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription.id;

        // Find original donation for this subscription
        const { data: original } = await supabase
          .from("donations")
          .select("user_id, email, donor_name, message, is_anonymous, currency, recurring_interval")
          .eq("stripe_subscription_id", subscriptionId)
          .order("created_at", { ascending: true })
          .limit(1)
          .single();

        if (!original) {
          console.warn("No original donation found for subscription:", subscriptionId);
          break;
        }

        // Skip if this is the first invoice (already handled by checkout.session.completed)
        if (invoice.billing_reason === "subscription_create") break;

        // Insert new donation row for renewal
        const { error } = await supabase.from("donations").insert({
          user_id: original.user_id,
          email: original.email,
          amount: invoice.amount_paid,
          currency: original.currency,
          stripe_session_id: invoice.id,
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id,
          donor_name: original.donor_name,
          message: original.message,
          is_anonymous: original.is_anonymous,
          status: "completed",
          donation_type: "recurring",
          recurring_interval: original.recurring_interval,
        });

        if (error) console.error("Failed to insert renewal donation:", error);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const { error } = await supabase
          .from("donations")
          .update({
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);

        if (error) console.error("Failed to mark subscription canceled:", error);
        break;
      }

      default:
        console.log("Unhandled event type:", event.type);
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
    reportApiError("stripe-webhook", err, { endpoint: "/functions/v1/stripe-webhook" });
    return new Response("Webhook processing failed", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
