import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { usePlacesPassport } from '@/hooks/usePlacesPassport';
import { useMyTier } from '@/hooks/useTrustTier';
import { Compass, MapPin, Building2 } from 'lucide-react';

export function PassportStrip() {
  const { user } = useAuth();
  const { data: passport, isLoading } = usePlacesPassport();
  const { data: tierData } = useMyTier();
  const tier = tierData?.tier;

  if (!user) {
    return (
      <section
        aria-label="Your queer.guide passport"
        className="rounded-container border border-border/60 bg-card p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <div className="flex items-start gap-4">
          <div className="rounded-element bg-muted p-2">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <p className="text-title font-semibold leading-tight">Track places you've been</p>
            <p className="text-15 text-muted-foreground mt-1">
              Sign in to stamp cities and countries on your queer.guide passport.
            </p>
          </div>
        </div>
        <Button asChild variant="default" size="default">
          <LocalizedLink to="/auth">Sign in</LocalizedLink>
        </Button>
      </section>
    );
  }

  const stats = passport?.stats;

  return (
    <section
      aria-label="Your queer.guide passport"
      className="rounded-container border border-border/60 bg-card p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6"
    >
      <div className="flex items-center gap-4">
        <div className="rounded-element bg-muted p-2">
          <Compass className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-title font-semibold leading-tight">Your passport</p>
            {tier && (
              <Badge variant="outline" className="text-2xs uppercase tracking-wide">
                {tier}
              </Badge>
            )}
          </div>
          <p className="text-15 text-muted-foreground mt-1">
            Stamped places, kept private until you choose to share them.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-6 md:gap-8">
        <PassportCount
          icon={<MapPin className="h-4 w-4" />}
          value={stats?.countries_visited ?? 0}
          total={stats?.total_countries}
          label="countries"
          loading={isLoading}
        />
        <PassportCount
          icon={<Building2 className="h-4 w-4" />}
          value={stats?.cities_visited ?? 0}
          label="cities"
          loading={isLoading}
        />
      </div>
    </section>
  );
}

function PassportCount({
  icon,
  value,
  total,
  label,
  loading,
}: {
  icon: React.ReactNode;
  value: number;
  total?: number;
  label: string;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground" aria-hidden>
        {icon}
      </span>
      <div>
        <p className="text-headline font-semibold leading-none tabular-nums">
          {loading ? '—' : value.toLocaleString()}
          {total !== undefined && (
            <span className="text-15 text-muted-foreground font-normal"> / {total.toLocaleString()}</span>
          )}
        </p>
        <p className="text-2xs uppercase tracking-wide text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  );
}
