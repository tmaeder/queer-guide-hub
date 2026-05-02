import { useState, useEffect } from 'react';
import { Search, Music } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FestivalCard } from '@/components/festivals/FestivalCard';
import { useFestivals } from '@/hooks/useFestivals';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

const FESTIVAL_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'pride', label: 'Pride' },
  { value: 'festival', label: 'Festival' },
  { value: 'conference', label: 'Conference' },
  { value: 'series', label: 'Series' },
  { value: 'other', label: 'Other' },
];

export default function Festivals() {
  const { festivals, loading, fetchFestivals } = useFestivals(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    fetchFestivals({ type: typeFilter !== 'all' ? typeFilter : undefined, search: search || undefined });
  }, [fetchFestivals, typeFilter, search]);

  return (
    <Container sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Music style={{ width: 28, height: 28 }} />
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Festivals & Pride Events</Typography>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Discover LGBTQ+ festivals, Pride parades, conferences, and event series worldwide.
      </Typography>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box sx={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
          <Input
            placeholder="Search festivals..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </Box>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FESTIVAL_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress  aria-label="Loading"/></Box>
      ) : festivals.length === 0 ? (
        <Box sx={{ py: 8, textAlign: 'center' }}>
          <Typography color="text.secondary">No festivals found matching your criteria.</Typography>
        </Box>
      ) : (
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
          gap: 3,
        }}>
          {festivals.map(f => <FestivalCard key={f.id} festival={f} />)}
        </Box>
      )}
    </Container>
  );
}
