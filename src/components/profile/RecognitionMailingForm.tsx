import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  useMailingAddress,
  useMailingAddressMutations,
  type MailingAddressRow,
} from '@/hooks/useRecognitions';

const EMPTY: MailingAddressRow = {
  recipient: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postal_code: '',
  country_code: '',
  notes: '',
  opted_in_zine: true,
};

export function RecognitionMailingForm() {
  const { user } = useAuth();
  const { data, isLoading } = useMailingAddress(user?.id);
  const { upsert, remove } = useMailingAddressMutations(user?.id);
  const [form, setForm] = useState<MailingAddressRow>(EMPTY);

  useEffect(() => {
    if (data?.row) {
      setForm({
        recipient: data.row.recipient ?? '',
        line1: data.row.line1 ?? '',
        line2: data.row.line2 ?? '',
        city: data.row.city ?? '',
        region: data.row.region ?? '',
        postal_code: data.row.postal_code ?? '',
        country_code: data.row.country_code ?? '',
        notes: data.row.notes ?? '',
        opted_in_zine: data.row.opted_in_zine ?? true,
      });
    }
  }, [data?.row]);

  if (!user) return null;
  if (data?.missingTable) return null;

  const hasRow = !!data?.row;
  const saving = upsert.isPending || remove.isPending;

  const set = <K extends keyof MailingAddressRow>(k: K, v: MailingAddressRow[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.recipient || !form.line1 || !form.city || !form.country_code) {
      toast.error('Recipient, address line 1, city and country code required');
      return;
    }
    if (form.country_code.length !== 2) {
      toast.error('Country code must be 2 letters (ISO 3166-1 alpha-2)');
      return;
    }
    try {
      await upsert.mutateAsync(form);
      toast.success('Mailing address saved');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Remove your mailing address?')) return;
    try {
      await remove.mutateAsync();
      setForm(EMPTY);
      toast.success('Address removed');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Print zine mailing address (optional)</CardTitle>
        <p className="text-xs text-muted-foreground">
          If you appear on a Recognition Wall and we mail a print zine that year, we'll send a copy here. Used only for the zine. Admin-readable, never public.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="opted_in_zine">
                <span className="text-sm font-medium">Send me the print zine</span>
              </Label>
              <Switch
                id="opted_in_zine"
                checked={form.opted_in_zine}
                onCheckedChange={(v) => set('opted_in_zine', v)}
              />
            </div>
            <div>
              <Label htmlFor="recipient">Recipient name</Label>
              <Input
                id="recipient"
                value={form.recipient}
                onChange={(e) => set('recipient', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="line1">Address line 1</Label>
              <Input
                id="line1"
                value={form.line1}
                onChange={(e) => set('line1', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="line2">Address line 2 (optional)</Label>
              <Input
                id="line2"
                value={form.line2 ?? ''}
                onChange={(e) => set('line2', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">City</Label>
                <Input id="city" value={form.city} onChange={(e) => set('city', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="region">Region / state (optional)</Label>
                <Input
                  id="region"
                  value={form.region ?? ''}
                  onChange={(e) => set('region', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="postal_code">Postal code</Label>
                <Input
                  id="postal_code"
                  value={form.postal_code ?? ''}
                  onChange={(e) => set('postal_code', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="country_code">Country code (ISO 2)</Label>
                <Input
                  id="country_code"
                  maxLength={2}
                  value={form.country_code}
                  onChange={(e) => set('country_code', e.target.value.toUpperCase())}
                  placeholder="DE"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Delivery notes (optional)</Label>
              <Textarea
                id="notes"
                rows={2}
                value={form.notes ?? ''}
                onChange={(e) => set('notes', e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              {hasRow && (
                <Button variant="ghost" onClick={handleDelete} disabled={saving}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              )}
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {hasRow ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
