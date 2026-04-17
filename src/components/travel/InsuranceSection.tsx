import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
        <Shield style={{ height: 20, width: 20, color: 'var(--primary)', flexShrink: 0 }} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Travel Insurance</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>LGBTQ+ friendly providers with partner coverage</Typography>
        </Box>
        <Button size="sm" onClick={() => window.open(PROVIDERS[0].url, '_blank', 'noopener')}>
          Compare
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Shield style={{ height: 18, width: 18, color: 'var(--primary)' }} />
        <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>Travel Insurance</Typography>
      </Box>
      <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', mb: 2 }}>
        LGBTQ+ friendly providers that cover same-sex partners, gender-affirming care, and HIV medication.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
        {PROVIDERS.map((p) => (
          <Card key={p.name} className="hover:shadow-sm transition-shadow">
            <CardContent style={{ padding: 16 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.name}</Typography>
                <Badge variant="outline">{p.badge}</Badge>
              </Box>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1 }}>
                {p.description}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
                <Heart style={{ height: 12, width: 12, color: 'var(--primary)' }} />
                <Typography sx={{ fontSize: '0.7rem', color: 'primary.main', fontWeight: 500 }}>
                  {p.lgbtqNote}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>{p.price}</Typography>
                <Button size="sm" onClick={() => window.open(p.url, '_blank', 'noopener')}>
                  <ExternalLink style={{ height: 12, width: 12, marginRight: 4 }} />
                  Get Quote
                </Button>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
