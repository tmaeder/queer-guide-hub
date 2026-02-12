import { Building } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VenueCard } from "./VenueCard";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface VenuesListProps {
  venues: any[];
  onEdit: (venue: any) => void;
  onDelete: (venue: any) => void;
}

export function VenuesList({ venues, onEdit, onDelete }: VenuesListProps) {
  if (venues.length === 0) {
    return (
      <Card>
        <CardContent sx={{ py: 6 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Building style={{ height: 48, width: 48, margin: '0 auto', color: 'var(--muted-foreground)', marginBottom: 16 }} />
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>No venues found</Typography>
            <Typography sx={{ color: 'text.secondary' }}>
              Try adjusting your search criteria or add a new venue to get started.
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Building style={{ height: 20, width: 20 }} />
          Venues ({venues.length})
        </CardTitle>
      </CardHeader>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {venues.map((venue) => (
            <VenueCard
              key={venue.id}
              venue={venue}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}