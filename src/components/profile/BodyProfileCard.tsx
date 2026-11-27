import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useBodyProfile } from '@/hooks/useBodyProfile';
import type { ProfileLens } from '@/lib/profileLens';

/**
 * Body & about on the profile Overview. Members-only: anon never queries it, and
 * RLS returns another member's row only when they set visibility to members.
 */
export function BodyProfileCard({
  userId,
  ownerLens,
}: {
  userId: string;
  /** Set on your own profile: the audience being previewed. */
  ownerLens?: ProfileLens;
}) {
  const { user } = useAuth();
  const { data } = useBodyProfile(user ? userId : undefined);
  if (!data) return null;
  if (ownerLens && ownerLens !== 'you' && (ownerLens === 'public' || data.visibility !== 'members'))
    return null;

  const rows: [string, string | null][] = [
    ['Build', data.body_type],
    ['Height', data.height_cm ? `${data.height_cm} cm` : null],
    ['Weight', data.weight_kg ? `${data.weight_kg} kg` : null],
    ['Top', data.size_top],
    ['Trousers', data.size_bottom],
    ['Shoes', data.size_shoe],
    ['Underwear', data.size_underwear],
  ];
  const shown = rows.filter((r): r is [string, string] => !!r[1]);
  if (!shown.length) return null;

  return (
    <Card className="flex flex-col gap-2 p-4">
      <h2 className="text-title font-bold">Body & sizes</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
        {shown.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="capitalize">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
