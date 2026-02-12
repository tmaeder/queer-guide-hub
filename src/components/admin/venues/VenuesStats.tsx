import { Building, Star, MapPin, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface VenuesStatsProps {
  venues: any[];
}

export function VenuesStats({ venues }: VenuesStatsProps) {
  const stats = [
    {
      icon: Building,
      label: "Total Venues",
      value: venues.length,
      color: "#f59e0b"
    },
    {
      icon: Star,
      label: "Featured",
      value: venues.filter(v => v.featured).length,
      color: "#eab308"
    },
    {
      icon: MapPin,
      label: "Verified",
      value: venues.filter(v => v.verified).length,
      color: "#22c55e"
    },
    {
      icon: Globe,
      label: "Cities",
      value: new Set(venues.map(v => v.city)).size,
      color: "#3b82f6"
    }
  ];

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, '@media (min-width: 768px)': { gridTemplateColumns: 'repeat(4, 1fr)' } }}>
      {stats.map((stat, index) => (
        <Card key={index} sx={{ '&:hover': { boxShadow: 2 }, transition: 'box-shadow 0.3s' }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'action.hover' }}>
                <stat.icon style={{ height: 20, width: 20, color: stat.color }} />
              </Box>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>{stat.value}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{stat.label}</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}