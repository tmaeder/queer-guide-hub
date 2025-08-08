import { useCallback, useEffect, useMemo, useState } from "react";
import { medusa } from "@/integrations/medusa/client";

export interface CartState {
  id: string;
  email?: string | null;
  region_id?: string | null;
  items: Array<any>;
  total?: number | null;
  subtotal?: number | null;
  shipping_total?: number | null;
  tax_total?: number | null;
  payment_session?: any;
  shipping_address?: any;
  billing_address?: any;
  currency_code?: string | null;
}

const CART_ID_KEY = "MEDUSA_CART_ID";

export function useMedusaCart() {
  const [cart, setCart] = useState<CartState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regions, setRegions] = useState<any[]>([]);
  const cartId = useMemo(() => (typeof window !== 'undefined' ? window.localStorage.getItem(CART_ID_KEY) : null), []);

  const loadRegions = useCallback(async () => {
    try {
      const res: any = await medusa.regions.list();
      setRegions(res?.regions || []);
      return res?.regions || [];
    } catch (e) {
      return [];
    }
  }, []);

  const retrieveCart = useCallback(async (id: string) => {
    try {
      const res: any = await medusa.carts.retrieve(id);
      setCart(res.cart);
      return res.cart;
    } catch (e) {
      setCart(null);
      return null;
    }
  }, []);

  const createCart = useCallback(async () => {
    const regs = regions.length ? regions : await loadRegions();
    const region = regs[0];
    const payload: any = region ? { region_id: region.id } : {};
    const res: any = await medusa.carts.create(payload);
    const newCart = res.cart;
    if (typeof window !== 'undefined') window.localStorage.setItem(CART_ID_KEY, newCart.id);
    setCart(newCart);
    return newCart;
  }, [regions, loadRegions]);

  const ensureCart = useCallback(async () => {
    setLoading(true);
    try {
      if (cartId) {
        const existing = await retrieveCart(cartId);
        if (existing) return existing;
      }
      return await createCart();
    } catch (e: any) {
      setError(e?.message || 'Failed to initialize cart');
      return null;
    } finally {
      setLoading(false);
    }
  }, [cartId, retrieveCart, createCart]);

  useEffect(() => {
    ensureCart();
  }, [ensureCart]);

  const refresh = useCallback(async () => {
    if (!cart?.id) return;
    await retrieveCart(cart.id);
  }, [cart?.id, retrieveCart]);

  const addItem = useCallback(async (variantId: string, quantity = 1) => {
    const c = cart?.id ? cart : await ensureCart();
    if (!c) return;
    await medusa.carts.lineItems.create(c.id, { variant_id: variantId, quantity });
    await refresh();
  }, [cart, ensureCart, refresh]);

  const updateItem = useCallback(async (lineId: string, quantity: number) => {
    if (!cart?.id) return;
    await medusa.carts.lineItems.update(cart.id, lineId, { quantity });
    await refresh();
  }, [cart?.id, refresh]);

  const removeItem = useCallback(async (lineId: string) => {
    if (!cart?.id) return;
    await medusa.carts.lineItems.delete(cart.id, lineId);
    await refresh();
  }, [cart?.id, refresh]);

  const setEmail = useCallback(async (email: string) => {
    if (!cart?.id) return;
    await medusa.carts.update(cart.id, { email });
    await refresh();
  }, [cart?.id, refresh]);

  const setAddresses = useCallback(async (shipping: any, billing?: any) => {
    if (!cart?.id) return;
    await medusa.carts.update(cart.id, { shipping_address: shipping, billing_address: billing || shipping });
    await refresh();
  }, [cart?.id, refresh]);

  const listShippingOptions = useCallback(async () => {
    if (!cart?.id) return [] as any[];
    try {
      // Preferred in medusa-js v6
      const res: any = await (medusa as any).shippingOptions.listCartOptions(cart.id);
      return res?.shipping_options || [];
    } catch {
      try {
        const res2: any = await (medusa as any).shippingOptions.list({ region_id: cart.region_id });
        return res2?.shipping_options || [];
      } catch {
        return [] as any[];
      }
    }
  }, [cart?.id, cart?.region_id]);

  const setShippingMethod = useCallback(async (optionId: string) => {
    if (!cart?.id) return;
    await medusa.carts.addShippingMethod(cart.id, { option_id: optionId });
    await refresh();
  }, [cart?.id, refresh]);

  const preparePayment = useCallback(async () => {
    if (!cart?.id) return null;
    await medusa.carts.createPaymentSessions(cart.id);
    await medusa.carts.setPaymentSession(cart.id, { provider_id: 'stripe' });
    const res: any = await medusa.carts.retrieve(cart.id);
    setCart(res.cart);
    return res.cart;
  }, [cart?.id]);

  const complete = useCallback(async () => {
    if (!cart?.id) return null;
    try {
      const res: any = await medusa.carts.complete(cart.id);
      return res;
    } catch (e) {
      setError('Payment requires Stripe Elements integration; please configure publishable key.');
      return null;
    }
  }, [cart?.id]);

  return {
    cart,
    loading,
    error,
    regions,
    ensureCart,
    refresh,
    addItem,
    updateItem,
    removeItem,
    setEmail,
    setAddresses,
    listShippingOptions,
    setShippingMethod,
    preparePayment,
    complete,
  };
}
