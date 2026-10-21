import { checkoutSale, renewalSale } from "../_shared/redirect-stripe.ts";
import type { ConversionInput } from "../_shared/redirect-api.ts";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { getServiceClient } from "../_shared/supabase-client.ts";
import { reportApiError } from "../_shared/report-api-error.ts";
import {
  buildCheckoutCompletedUpdate,
  buildRenewalDonation,
  isRenewalInvoice,
} from "./helpers.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-12-18.acacia",
});
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
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
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const supabase = getServiceClient();

  const track = async (conversion: ConversionInput | null) => {
    if (!conversion) return;
    const { error } = await supabase.rpc("record_redirect_conversion", {
      p_event: conversion,
    });
    // Deleting a campaign clears its attribution FK; an already-issued Stripe
    // event may still carry that former click. Never recreate deleted history.
    if (error && error.code !== "P0002") {
      throw new Error("Conversion recording failed: " + error.message);
    }
  };
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (!["paid", "no_payment_required"].includes(session.payment_status)) {
          break;
        }
        const update = buildCheckoutCompletedUpdate(
          session,
          new Date().toISOString(),
        );

        const { data: paidDonations, error } = await supabase
          .from("donations")
          .update(update)
          .eq("stripe_session_id", session.id).select("id");

        if (error) throw new Error("Failed to persist verified donation");
        for (const donation of paidDonations ?? []) {
          const notice = await supabase.rpc("email_notice_verified_payment", {
            p_donation: donation.id,
            p_event: event.id,
          });
          if (notice.error) {
            throw new Error("Failed to record payment notification provenance");
          }
        }
        await track(
          checkoutSale(session, new Date(event.created * 1000).toISOString()),
        );
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
          .select(
            "user_id, email, donor_name, message, is_anonymous, currency, recurring_interval, redirect_click_id",
          )
          .eq("stripe_subscription_id", subscriptionId)
          .order("created_at", { ascending: true })
          .limit(1)
          .single();

        if (!original) {
          console.warn(
            "No original donation found for subscription:",
            subscriptionId,
          );
          break;
        }

        // Skip if this is the first invoice (handled by checkout.session.completed)
        if (!isRenewalInvoice(invoice)) break;

        const { data: renewals, error } = await supabase
          .from("donations")
          .upsert(buildRenewalDonation(original, invoice, subscriptionId), {
            onConflict: "stripe_session_id",
          }).select("id");

        if (error) throw new Error("Failed to persist verified renewal");
        for (const donation of renewals ?? []) {
          const notice = await supabase.rpc("email_notice_verified_payment", {
            p_donation: donation.id,
            p_event: event.id,
          });
          if (notice.error) {
            throw new Error("Failed to record renewal notification provenance");
          }
        }
        await track(
          renewalSale(
            original,
            invoice,
            new Date(event.created * 1000).toISOString(),
          ),
        );
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

        if (error) {
          console.error("Failed to mark subscription canceled:", error);
        }
        break;
      }

      default:
        console.log("Unhandled event type:", event.type);
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
    reportApiError("stripe-webhook", err, {
      endpoint: "/functions/v1/stripe-webhook",
    });
    return new Response("Webhook processing failed", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
