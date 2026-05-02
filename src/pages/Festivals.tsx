import { useState, useEffect } from 'react';
import { Search, Music, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FestivalCard } from '@/components/festivals/FestivalCard';
import { useFestivals } from '@/hooks/useFestivals';

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
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-3 mb-2">
        <Music className="w-7 h-7" />
        <h4 className="text-3xl font-bold">Festivals & Pride Events</h4>
      </div>
      <p className="text-muted-foreground mb-6">
        Discover LGBTQ+ festivals, Pride parades, conferences, and event series worldwide.
      </p>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box sx={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 16,
              height: 16,
              color: '#9ca3af',
            }}
          />
          <Input
            placeholder="Search festivals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FESTIVAL_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin" aria-label="Loading" />
        </div>
      ) : festivals.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-muted-foreground">No festivals found matching your criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {festivals.map((f) => <FestivalCard key={f.id} festival={f} />)}
        </div>
      )}
    </div>
  );
}
