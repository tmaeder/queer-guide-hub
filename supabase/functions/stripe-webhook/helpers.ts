// Pure helpers extracted from stripe-webhook/index.ts so the data-shaping
// logic can be unit-tested without booting Deno.serve or stripe SDK.
//
// Keep these functions side-effect-free. The handler in index.ts wraps them
// around the supabase client and stripe event verification.

export function buildCheckoutCompletedUpdate(session: {
  customer?: string | { id: string } | null;
  subscription?: string | { id: string } | null;
}, now: string): Record<string, unknown> {
  const update: Record<string, unknown> = {
    status: "completed",
    updated_at: now,
  };
  if (session.customer) {
    update.stripe_customer_id =
      typeof session.customer === "string" ? session.customer : session.customer.id;
  }
  if (session.subscription) {
    update.stripe_subscription_id =
      typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  }
  return update;
}

export interface OriginalDonationFields {
  user_id: string | null;
  email: string;
  donor_name: string | null;
  message: string | null;
  is_anonymous: boolean;
  currency: string;
  recurring_interval: string | null;
}

export function buildRenewalDonation(
  original: OriginalDonationFields,
  invoice: {
    id: string;
    amount_paid: number;
    customer?: string | { id: string } | null;
  },
  subscriptionId: string,
): Record<string, unknown> {
  return {
    user_id: original.user_id,
    email: original.email,
    amount: invoice.amount_paid,
    currency: original.currency,
    stripe_session_id: invoice.id,
    stripe_subscription_id: subscriptionId,
    stripe_customer_id:
      typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null,
    donor_name: original.donor_name,
    message: original.message,
    is_anonymous: original.is_anonymous,
    status: "completed",
    donation_type: "recurring",
    recurring_interval: original.recurring_interval,
  };
}

// Returns true if this invoice represents a subscription renewal (not the
// initial checkout, which is handled by checkout.session.completed).
export function isRenewalInvoice(invoice: { billing_reason?: string | null }): boolean {
  return invoice.billing_reason !== "subscription_create";
}
