import { useEffect, useState } from 'react';
import { useWishlists, type Wishlist } from '@/hooks/useWishlists';
import { useAuth } from '@/hooks/useAuth';
import { useMeta } from '@/hooks/useMeta';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Heart, Plus, Lock, Globe, Link2 } from 'lucide-react';
import { Input } from '@/components/ui/input';

const VISIBILITY_ICON = {
  private: Lock,
  unlisted: Link2,
  public: Globe,
} as const;

const Wishlists = () => {
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const { wishlists, items, loading, createWishlist } = useWishlists();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  useMeta({
    title: 'Your wishlists',
    description: 'Your saved wishlists on Queer Guide.',
    canonicalPath: '/wishlists',
  });

  // Need to be logged in to view this page; bounce anon users to auth.
  useEffect(() => {
    if (!loading && !user) navigate('/auth');
  }, [loading, user, navigate]);

  const itemCounts = wishlists.reduce<Record<string, number>>((acc, w) => {
    acc[w.id] = items.filter((i) => i.wishlist_id === w.id).length;
    return acc;
  }, {});

  const handleCreate = async () => {
    const t = title.trim();
    if (!t) return;
    setCreating(true);
    const list = await createWishlist(t);
    setCreating(false);
    if (list) {
      setTitle('');
      navigate(`/wishlists/${list.slug}`);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="container mx-auto py-12 md:py-16 px-4">
        <header className="mb-10">
          <p className="text-13 uppercase tracking-wide text-muted-foreground mb-2">Saved</p>
          <h1 className="text-headline-lg md:text-display font-semibold">Your wishlists</h1>
        </header>

        <div className="flex gap-2 mb-10 max-w-md">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name a new list (e.g. Berlin Pride 2026)…"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <Button onClick={handleCreate} disabled={!title.trim() || creating}>
            <Plus size={16} />
            Create
          </Button>
        </div>

        {wishlists.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="No wishlists yet."
            description="Save items from the marketplace or create a named list above."
            mood="neutral"
            primaryAction={{ label: 'Browse marketplace', onClick: () => navigate('/marketplace') }}
          />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {wishlists.map((w: Wishlist) => {
              const Icon = VISIBILITY_ICON[w.visibility];
              return (
                <li key={w.id}>
                  <LocalizedLink
                    to={`/wishlists/${w.slug}`}
                    className="block border border-border rounded-container p-6 hover:border-foreground/40 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <Icon size={14} className="text-muted-foreground" aria-hidden="true" />
                      <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                        {w.visibility}
                      </span>
                    </div>
                    <h2 className="text-title font-semibold mb-2">{w.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {itemCounts[w.id] ?? 0} item{(itemCounts[w.id] ?? 0) === 1 ? '' : 's'}
                    </p>
                  </LocalizedLink>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Wishlists;
