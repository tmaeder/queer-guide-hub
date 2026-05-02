import { Shield, Heart, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface InsuranceSectionProps {
  compact?: boolean;
}

const PROVIDERS = [
  {
    name: 'SafetyWing',
    url: 'https://safetywing.com/?referenceID=queerguide',
    description: 'Nomad insurance. Covers 180+ countries, ongoing trips, pre-existing conditions after 364 days.',
    lgbtqNote: 'Covers same-sex partners as dependents',
    price: 'From $42/month',
    badge: 'Digital Nomads',
  },
  {
    name: 'World Nomads',
    url: 'https://worldnomads.com/?affiliate=travelpayouts',
    description: 'Adventure travel insurance. Covers 200+ activities including extreme sports.',
    lgbtqNote: 'Partner coverage available regardless of gender',
    price: 'From $5/day',
    badge: 'Adventure',
  },
  {
    name: 'Heymondo',
    url: 'https://heymondo.com/?utm_source=travelpayouts&utm_medium=affiliate',
    description: 'Comprehensive coverage with 24/7 medical assistance app and telemedicine.',
    lgbtqNote: 'No discrimination clause, covers all medical needs',
    price: 'From $3/day',
    badge: 'Best Value',
  },
];

export function InsuranceSection({ compact = false }: InsuranceSectionProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 p-4 bg-muted">
        <Shield style={{ height: 20, width: 20, color: 'var(--primary)', flexShrink: 0 }} />
        <div className="flex-1">
          <p className="font-semibold text-sm">Travel Insurance</p>
          <p className="text-xs text-muted-foreground">LGBTQ+ friendly providers with partner coverage</p>
        </div>
        <Button size="sm" onClick={() => window.open(PROVIDERS[0].url, '_blank', 'noopener')}>
          Compare
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Shield style={{ height: 18, width: 18, color: 'var(--primary)' }} />
        <p className="font-semibold text-base">Travel Insurance</p>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        LGBTQ+ friendly providers that cover same-sex partners, gender-affirming care, and HIV medication.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PROVIDERS.map((p) => (
          <Card key={p.name} className="hover:shadow-sm transition-shadow">
            <CardContent style={{ padding: 16 }}>
              <div className="flex justify-between items-start mb-2">
                <p className="font-bold text-base">{p.name}</p>
                <Badge variant="outline">{p.badge}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                {p.description}
              </p>
              <div className="flex items-center gap-1 mb-3">
                <Heart style={{ height: 12, width: 12, color: 'var(--primary)' }} />
                <p className="text-xs text-primary font-medium">
                  {p.lgbtqNote}
                </p>
              </div>
              <div className="flex justify-between items-center">
                <p className="font-bold text-sm">{p.price}</p>
                <Button size="sm" onClick={() => window.open(p.url, '_blank', 'noopener')}>
                  <ExternalLink style={{ height: 12, width: 12, marginRight: 4 }} />
                  Get Quote
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
