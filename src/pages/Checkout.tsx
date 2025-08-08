import React, { useEffect, useState } from 'react';
import { useMedusaCart } from '@/hooks/useMedusaCart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const Checkout: React.FC = () => {
  const { cart, loading, setEmail, setAddresses, listShippingOptions, setShippingMethod, preparePayment, complete } = useMedusaCart();
  const [email, setEmailState] = useState('');
  const [shipping, setShipping] = useState<any>({ first_name: '', last_name: '', address_1: '', city: '', postal_code: '', country_code: 'us' });
  const [options, setOptions] = useState<any[]>([]);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const opts = await listShippingOptions();
      setOptions(opts);
    })();
  }, [listShippingOptions]);

  if (loading || !cart) return <div className="container mx-auto px-4 py-8">Loading checkout...</div>;

  const handleContinue = async () => {
    setBusy(true);
    if (email) await setEmail(email);
    await setAddresses(shipping);
    if (optionId) await setShippingMethod(optionId);
    const updated = await preparePayment();
    // Attempt complete (Stripe Elements not integrated yet)
    await complete();
    setBusy(false);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Checkout</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmailState(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>First name</Label>
              <Input value={shipping.first_name} onChange={(e) => setShipping({ ...shipping, first_name: e.target.value })} />
            </div>
            <div>
              <Label>Last name</Label>
              <Input value={shipping.last_name} onChange={(e) => setShipping({ ...shipping, last_name: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Address</Label>
              <Input value={shipping.address_1} onChange={(e) => setShipping({ ...shipping, address_1: e.target.value })} />
            </div>
            <div>
              <Label>City</Label>
              <Input value={shipping.city} onChange={(e) => setShipping({ ...shipping, city: e.target.value })} />
            </div>
            <div>
              <Label>Postal code</Label>
              <Input value={shipping.postal_code} onChange={(e) => setShipping({ ...shipping, postal_code: e.target.value })} />
            </div>
            <div>
              <Label>Country</Label>
              <Select value={shipping.country_code} onValueChange={(v) => setShipping({ ...shipping, country_code: v })}>
                <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="us">United States</SelectItem>
                  <SelectItem value="gb">United Kingdom</SelectItem>
                  <SelectItem value="de">Germany</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Shipping Method</Label>
            <Select onValueChange={(v) => setOptionId(v)}>
              <SelectTrigger><SelectValue placeholder="Select a shipping option" /></SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <div className="border rounded p-4">
            <h2 className="font-medium mb-2">Summary</h2>
            <p className="text-sm text-muted-foreground">Items: {cart.items.length}</p>
            <Button className="w-full mt-4" disabled={busy} onClick={handleContinue}>
              {busy ? 'Processing…' : 'Proceed to Payment'}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">Stripe Elements integration required for final payment confirmation.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
