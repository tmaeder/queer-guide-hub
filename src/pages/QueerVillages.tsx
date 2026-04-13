import { useState, useEffect } from 'react';
import { Landmark, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { VillageCard } from '@/components/villages/VillageCard';
import { useQueerVillages } from '@/hooks/useQueerVillages';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

export default function QueerVillages() {
  const { villages, loading, fetchVillages } = useQueerVillages(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchVillages(search ? { search } : undefined);
  }, [search, fetchVillages]);

  return (
    <Container sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Queer Villages
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          LGBTQ+ neighborhoods and districts around the world
        </Typography>
      </Box>

      <Box sx={{ position: 'relative', maxWidth: 320, mb: 3 }}>
        <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
        <Input placeholder="Search villages..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
      </Box>

      {loading && villages.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : villages.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Landmark style={{ width: 48, height: 48, color: 'hsl(var(--muted-foreground))', margin: '0 auto 16px' }} />
          <Typography variant="h6" color="text.secondary">No queer villages found</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Check back later as we continue to add neighborhoods.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
          {villages.map(village => (
            <VillageCard key={village.id} village={village} />
          ))}
        </Box>
      )}
    </Container>
  );
}
