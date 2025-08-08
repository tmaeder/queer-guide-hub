import React from 'react';
import { useMedusaCart } from '@/hooks/useMedusaCart';
import { Button } from '@/components/ui/button';

const Cart: React.FC = () => {
  const { cart, loading, removeItem, updateItem } = useMedusaCart();

  if (loading || !cart) return <div className="container mx-auto px-4 py-8">Loading cart...</div>;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Your Cart</h1>
      {cart.items.length === 0 ? (
        <p className="text-muted-foreground">Your cart is empty.</p>
      ) : (
        <div className="space-y-4">
          {cart.items.map((item: any) => (
            <div key={item.id} className="flex items-center justify-between border rounded p-4">
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => updateItem(item.id, Math.max(1, item.quantity - 1))}>-</Button>
                <Button variant="outline" onClick={() => updateItem(item.id, item.quantity + 1)}>+</Button>
                <Button variant="destructive" onClick={() => removeItem(item.id)}>Remove</Button>
              </div>
            </div>
          ))}
          <div className="text-right mt-6">
            <a href="/checkout">
              <Button size="lg">Proceed to Checkout</Button>
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cart;
