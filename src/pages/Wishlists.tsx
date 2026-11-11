import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWishlists, type Wishlist } from '@/hooks/useWishlists';
import { useAuth } from '@/hooks/useAuth';
import { useMeta } from '@/hooks/useMeta';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Heart, Plus, Lock, Globe, Link2 } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { PageContainer } from '@/components/layout/PageContainer';

const VISIBILITY_ICON = {
  private: Lock,
  unlisted: Link2,
  public: Globe,
} as const;

const Wishlists = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
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
    if (!authLoading && !loading && !user) navigate('/auth?redirect=/wishlists');
  }, [authLoading, loading, user, navigate]);

  const itemCounts = wishlists.reduce<Record<string, number>>((acc, w) => {
    acc[w.id] = items.filter((i) => i.wishlist_id === w.id).length;
    return acc;
  }, {});

  const handleCreate = async () => {
    const listTitle = title.trim();
    if (!listTitle || creating) return;
    setCreating(true);
    const list = await createWishlist(listTitle);
    setCreating(false);
    if (list) {
      setTitle('');
      navigate(`/wishlists/${list.slug}`);
    }
  };

  if (authLoading || loading) {
    return <PageContainer><PageLoadingState count={3} variant="list" /></PageContainer>;
  }
  if (!user) return null;

  return (
    <div className="min-h-screen">
      <PageContainer>
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="break-words font-display text-headline leading-tight md:text-display">
              {t('wishlists.title', 'Your wishlists')}
            </h1>
            <p className="mt-2 max-w-reading text-muted-foreground">
              {t('wishlists.description', 'Keep the things you love together, ready to revisit or share.')}
            </p>
          </div>
          <Button asChild variant="outline">
            <a href="#new-wishlist"><Plus size={16} aria-hidden="true" />{t('wishlists.new', 'New wishlist')}</a>
          </Button>
        </header>

        {wishlists.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="No wishlists yet."
            description="Save items from the marketplace or create a named list below."
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
                    className="block h-full rounded-container bg-surface-container p-6 text-inherit no-underline transition-colors hover:bg-muted"
                  >
                    <h2 className="mb-2 break-words font-sans text-title font-bold">{w.title}</h2>
                    {w.description && <p className="mb-2 line-clamp-2 text-15 text-muted-foreground">{w.description}</p>}
                    <div className="flex items-center justify-between mb-2">
                      <Icon size={14} className="text-muted-foreground" aria-hidden="true" />
                      <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                        {w.visibility}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {itemCounts[w.id] ?? 0} item{(itemCounts[w.id] ?? 0) === 1 ? '' : 's'}
                    </p>
                  </LocalizedLink>
                </li>
              );
            })}
          </ul>
        )}

        <section id="new-wishlist" aria-labelledby="new-wishlist-title" className="mt-8 border-t border-border-hairline pt-6">
          <h2 id="new-wishlist-title" className="font-sans text-title font-bold">
            {t('wishlists.new', 'New wishlist')}
          </h2>
          <form className="mt-4 max-w-form" onSubmit={(event) => { event.preventDefault(); void handleCreate(); }}>
            <Label htmlFor="wishlist-title">{t('wishlists.name', 'List name')}</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              <Input
                id="wishlist-title"
                className="min-w-0 flex-1 basis-48"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('wishlists.nameExample', 'For example, Pride weekend')}
              />
              <Button type="submit" disabled={!title.trim() || creating}>
                <Plus size={16} aria-hidden="true" />
                {creating ? t('wishlists.creating', 'Creating…') : t('common.create', 'Create')}
              </Button>
            </div>
          </form>
        </section>
      </PageContainer>
    </div>
  );
};

export default Wishlists;
