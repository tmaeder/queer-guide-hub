import React, { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";

function usePublishableKey() {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    setKey(localStorage.getItem("STRIPE_PUBLISHABLE_KEY"));
  }, []);
  return key;
}

export default function DonationSuccess() {
  const [status, setStatus] = useState<string>("processing");
  const [amount, setAmount] = useState<number | null>(null);
  const key = usePublishableKey();

  useEffect(() => {
    document.title = "Thank you for your donation | Queer Guide";
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    meta.content = "Your donation helps us keep queer-friendly maps and resources free for everyone.";
  }, []);

  useEffect(() => {
    const clientSecret = new URLSearchParams(window.location.search).get("payment_intent_client_secret");
    if (!clientSecret || !key) { setStatus("succeeded"); return; }

    (async () => {
      const stripe = await loadStripe(key);
      if (!stripe) return;
      const { paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);
      if (paymentIntent) {
        setStatus(paymentIntent.status);
        if (paymentIntent.amount) setAmount(paymentIntent.amount);
      }
    })();
  }, [key]);

  return (
    <div className="py-12 space-y-4">
      <h1 className="text-3xl font-bold">Thank you for your support</h1>
      {status === "succeeded" && <p className="text-muted-foreground">Your donation was successful. We appreciate you.</p>}
      {status !== "succeeded" && <p className="text-muted-foreground">Your donation is {status}. If required, you may be prompted to complete verification.</p>}
      {typeof amount === 'number' && <p className="text-sm">Amount: ${(amount/100).toFixed(2)} USD</p>}
      <a className="underline" href="/">Back to home</a>
    </div>
  );
}
