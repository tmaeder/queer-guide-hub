import { useState, useEffect } from 'react';
import { Landmark, Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { VillageCard } from '@/components/villages/VillageCard';
import { useQueerVillages } from '@/hooks/useQueerVillages';

export default function QueerVillages() {
  const { villages, loading, fetchVillages } = useQueerVillages(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchVillages(search ? { search } : undefined);
  }, [search, fetchVillages]);

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h4 className="text-3xl font-bold">Queer Villages</h4>
        <p className="text-muted-foreground mt-1">
          LGBTQ+ neighborhoods and districts around the world
        </p>
      </div>

      <div className="relative max-w-xs mb-6">
        <Search
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 16,
            height: 16,
            color: 'hsl(var(--muted-foreground))',
          }}
        />
        <Input
          placeholder="Search villages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ paddingLeft: 32 }}
        />
      </div>

      {loading && villages.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin" aria-label="Loading" />
        </div>
      ) : villages.length === 0 ? (
        <div className="text-center py-16">
          <Landmark
            style={{
              width: 48,
              height: 48,
              color: 'hsl(var(--muted-foreground))',
              margin: '0 auto 16px',
            }}
          />
          <h6 className="text-base font-semibold text-muted-foreground">No queer villages found</h6>
          <p className="text-sm text-muted-foreground mt-2">
            Check back later as we continue to add neighborhoods.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {villages.map((village) => (
            <VillageCard key={village.id} village={village} />
          ))}
        </div>
      )}
    </div>
  );
}
