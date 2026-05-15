import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMyIntimateProfile, useIntimateDiscovery } from '@/hooks/useIntimateProfile';
import { Button } from '@/components/ui/button';
import { AGE_BANDS, BODY_TYPES, INTO_TAGS, ROLES } from '@/assets/intimate/options';

export default function IntimateDiscovery() {
  const { data: me, isLoading } = useMyIntimateProfile();
  const navigate = useNavigate();
  const [roles, setRoles] = useState<string[]>([]);
  const [into, setInto] = useState<string[]>([]);
  const [ages, setAges] = useState<string[]>([]);
  const [bodies, setBodies] = useState<string[]>([]);

  const cityId = me?.discovery_city_id ?? null;
  const { data: cards, isLoading: loadingDisc } = useIntimateDiscovery({
    cityId, roles, intoTags: into, ageBands: ages, bodyTypes: bodies,
  });

  if (isLoading) return <div className="p-8">Loading…</div>;

  if (!me?.opted_in_at) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="mb-4 text-2xl">Intimate</h1>
        <p className="mb-6 text-muted-foreground">
          You haven&apos;t opted into the intimate profile yet.
        </p>
        <Button onClick={() => navigate('/intimate/onboard')}>Get started</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl">Intimate</h1>
        <Link to="/settings/profile?tab=intimate" className="text-sm underline">
          Edit my profile
        </Link>
      </header>

      <section className="mb-6 space-y-3 border-b pb-4">
        <FilterRow label="Role" options={ROLES as readonly string[]} selected={roles} onToggle={(v) => setRoles(toggle(roles, v))} />
        <FilterRow label="Into" options={INTO_TAGS as readonly string[]} selected={into} onToggle={(v) => setInto(toggle(into, v))} />
        <FilterRow label="Age" options={AGE_BANDS as readonly string[]} selected={ages} onToggle={(v) => setAges(toggle(ages, v))} />
        <FilterRow label="Body" options={BODY_TYPES as readonly string[]} selected={bodies} onToggle={(v) => setBodies(toggle(bodies, v))} />
      </section>

      {loadingDisc ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !cards?.length ? (
        <p className="text-muted-foreground">No matches yet. Try widening filters.</p>
      ) : (
        <ul className="border-t border-border">
          {cards.map((c) => (
            <li key={c.user_id} className="border-b border-border">
              <Link
                to={`/intimate/u/${c.user_id}`}
                className="flex items-center gap-4 py-4 transition-colors hover:bg-muted/40"
              >
                {c.avatar_url ? (
                  <img
                    src={c.avatar_url}
                    alt=""
                    className="h-12 w-12 object-cover rounded-element"
                  />
                ) : (
                  <div className="h-12 w-12 bg-muted rounded-element" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {c.display_name ?? 'Anon'}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[c.age_band, c.body_type, c.height_cm ? `${c.height_cm}cm` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {c.role?.length ? (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {c.role.join(', ')}
                    </div>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function toggle(arr: string[], v: string) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function FilterRow({
  label, options, selected, onToggle,
}: {
  label: string; options: readonly string[]; selected: string[]; onToggle: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <Button
              key={o}
              size="sm"
              variant={on ? 'default' : 'outline'}
              onClick={() => onToggle(o)}
              className="rounded-element"
            >{o.replace(/_/g, ' ')}</Button>
          );
        })}
      </div>
    </div>
  );
}
