import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMedusaCart } from '@/hooks/useMedusaCart';

interface Props {
  product: any; // Medusa product
}

export const AddToCartSection: React.FC<Props> = ({ product }) => {
  const { addItem } = useMedusaCart();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const variants = useMemo(() => product?.variants || [], [product]);

  const handleAdd = async () => {
    if (!variantId) return;
    setAdding(true);
    await addItem(variantId, 1);
    setAdding(false);
  };

  return (
    <div className="space-y-3">
      <div>
        <Select onValueChange={(v) => setVariantId(v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a variant" />
          </SelectTrigger>
          <SelectContent>
            {variants.map((v: any) => (
              <SelectItem key={v.id} value={v.id}>
                {v.title || v.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button className="w-full" disabled={!variantId || adding} onClick={handleAdd}>
        {adding ? 'Adding...' : 'Add to cart'}
      </Button>
    </div>
  );
};
