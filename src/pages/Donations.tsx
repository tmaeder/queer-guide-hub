import React, { useEffect, useMemo, useState } from "react";
import { loadStripe, StripeElementsOptions } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

function usePublishableKey() {
  const [key, setKey] = useState<string | null>(() => localStorage.getItem("STRIPE_PUBLISHABLE_KEY"));
  const [temp, setTemp] = useState("");
  const save = () => {
    if (temp) {
      localStorage.setItem("STRIPE_PUBLISHABLE_KEY", temp);
      setKey(temp);
    }
  };
  const clear = () => {
    localStorage.removeItem("STRIPE_PUBLISHABLE_KEY");
    setKey(null);
    setTemp("");
  };
  return { key, temp, setTemp, save, clear };
}

function SEO() {
  useEffect(() => {
    const title = "Donate to Queer Guide | Support LGBTQ+ Mapping";
    const description = "Make a secure donation to Queer Guide via Stripe to support queer-friendly maps, events, and resources.";
    document.title = title;
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `${window.location.origin}/donate`;
  }, []);
  return null;
}

function AmountStep({ onClientSecret, defaultEmail }: { onClientSecret: (cs: string) => void; defaultEmail?: string | null }) {
  const [amount, setAmount] = useState<number>(25);
  const [email, setEmail] = useState<string>(defaultEmail || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = [5, 10, 25, 50, 100];

  const handleContinue = async () => {
    setLoading(true);
    setError(null);
    try {
      const amountCents = Math.round(amount * 100);
      const { data, error } = await supabase.functions.invoke("create-donation-intent", {
        body: { amount: amountCents, currency: "usd", donor_email: email }
      });
      if (error) throw new Error(error.message || "Failed to create intent");
      if (!data?.client_secret) throw new Error("No client secret returned");
      onClientSecret(data.client_secret);
    } catch (e: any) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-card border border-border">
      <CardHeader>
        <CardTitle className="text-xl">Choose your donation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {preset.map((p) => (
            <Button key={p} variant={p === amount ? "default" : "outline"} onClick={() => setAmount(p)}>
              ${'{'}p{'}'}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Custom amount (USD)</label>
            <Input type="number" min={1} step="1" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Email (for receipt)</label>
            <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleContinue} disabled={loading}>
          {loading ? "Preparing secure payment..." : "Continue to payment"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PaymentStep({ clientSecret }: { clientSecret: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/donation-success`
      }
    });
    if (error) setError(error.message || "Payment failed");
    setSubmitting(false);
  };

  return (
    <Card className="bg-card border border-border">
      <CardHeader>
        <CardTitle className="text-xl">Secure payment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <PaymentElement options={{ layout: "tabs" }} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={onSubmit} disabled={submitting || !stripe || !elements}>
          {submitting ? "Processing..." : "Donate securely"}
        </Button>
        <p className="text-xs text-muted-foreground">Powered by Stripe Payment Elements</p>
      </CardContent>
    </Card>
  );
}

export default function Donations() {
  const { user } = useAuth();
  const { key, temp, setTemp, save, clear } = usePublishableKey();
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const stripePromise = useMemo(() => (key ? loadStripe(key) : null), [key]);

  const options: StripeElementsOptions | undefined = clientSecret
    ? {
        clientSecret,
        appearance: { theme: "stripe" },
      }
    : undefined;

  return (
    <div className="py-8 space-y-6">
      <SEO />
      <h1 className="text-3xl font-bold">Donate to Queer Guide</h1>
      <p className="text-muted-foreground max-w-2xl">Your support helps us maintain a free, community-driven map of queer-friendly places, events, and resources worldwide.</p>

      {!key && (
        <Card className="bg-card border border-border">
          <CardHeader>
            <CardTitle>Connect Stripe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter your Stripe Publishable Key to enable the Payment Element. You can find it in your Stripe Dashboard (starts with pk_...).</p>
            <Input placeholder="pk_live_... or pk_test_..." value={temp} onChange={(e) => setTemp(e.target.value)} />
            <div className="flex gap-2">
              <Button onClick={save} disabled={!temp}>Save key</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {key && !clientSecret && (
        <AmountStep onClientSecret={setClientSecret} defaultEmail={user?.email} />
      )}

      {key && clientSecret && stripePromise && options && (
        <Elements stripe={stripePromise} options={options}>
          <PaymentStep clientSecret={clientSecret} />
          <div className="text-xs text-muted-foreground mt-2">
            Not seeing payment methods? <button className="underline" onClick={clear}>Reset key</button>
          </div>
        </Elements>
      )}
    </div>
  );
}
