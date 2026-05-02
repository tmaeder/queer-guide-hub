import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Calendar, MapPin, Music } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardImage } from '@/components/ui/card';
import { format } from 'date-fns';
import type { FestivalWithRelations } from '@/hooks/useFestivals';

const TYPE_LABELS: Record<string, string> = {
  festival: 'Festival',
  pride: 'Pride',
  conference: 'Conference',
  series: 'Series',
  other: 'Other',
};

interface FestivalCardProps {
  festival: FestivalWithRelations;
}

function MetaChip({ icon: Icon, label }: { icon: React.ComponentType<{ style?: React.CSSProperties }>; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-muted-foreground border border-border">
      <Icon style={{ width: 12, height: 12 }} />
      {label}
    </span>
  );
}

export function FestivalCard({ festival }: FestivalCardProps) {
  const location = [festival.cities?.name, festival.countries?.name].filter(Boolean).join(', ');

  const dateRange = (() => {
    if (!festival.start_date) return 'Dates TBA';
    const start = new Date(festival.start_date);
    if (!festival.end_date) return format(start, 'MMM d, yyyy');
    const end = new Date(festival.end_date);
    if (format(start, 'yyyy-MM') === format(end, 'yyyy-MM')) {
      return `${format(start, 'MMM d')} - ${format(end, 'd, yyyy')}`;
    }
    return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
  })();

  const heroImage = festival.images && festival.images.length > 0 ? festival.images[0] : null;

  return (
    <LocalizedLink to={`/festivals/${festival.id}`} style={{ textDecoration: 'none' }}>
      <Card hoverable>
        <CardImage
          src={heroImage}
          alt={festival.name}
          fallbackIcon={Music}
          height={160}
        />
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <p className="flex-1 truncate text-base font-bold">
              {festival.name}
            </p>
            {festival.featured && (
              <Badge style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>Featured</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            <MetaChip icon={Music} label={TYPE_LABELS[festival.festival_type] || festival.festival_type} />
            <MetaChip icon={Calendar} label={dateRange} />
            {location && <MetaChip icon={MapPin} label={location} />}
            {festival.is_recurring && (
              <span className="inline-flex items-center px-2 py-0.5 text-xs border border-border text-muted-foreground">
                Recurring
              </span>
            )}
          </div>
          {festival.description && (
            <p
              className="text-sm text-muted-foreground"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {festival.description}
            </p>
          )}
        </div>
      </Card>
    </LocalizedLink>
  );
}
