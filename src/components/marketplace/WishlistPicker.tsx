import { useState } from 'react';
import { Heart, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useWishlists } from '@/hooks/useWishlists';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface WishlistPickerProps {
  listingId: string;
  /** Optional: override the trigger button appearance for in-card overlays. */
  size?: 'sm' | 'tap';
}

/**
 * Heart-button + popover picker. Click the heart → opens a small list
 * of the user's wishlists with a checkmark next to ones containing the
 * listing. Tapping a row toggles membership in that list. A "+ New list"
 * input creates a list and adds the listing in one go.
 *
 * For unauthenticated users the heart still renders but redirects to
 * the auth flow via the parent toast.
 */
export function WishlistPicker({ listingId, size = 'tap' }: WishlistPickerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    wishlists,
    isInAnyWishlist,
    isInWishlist,
    addToWishlist,
    removeFromWishlist,
    createWishlist,
    ensureDefaultWishlist,
  } = useWishlists();
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const filled = isInAnyWishlist(listingId);
  const px = size === 'tap' ? 44 : 32;
  const iconPx = size === 'tap' ? 18 : 16;

  const handleOpenChange = async (next: boolean) => {
    if (next && !user) {
      toast({
        title: 'Sign in to save listings',
        description: 'Create a free account to build wishlists.',
        variant: 'default',
      });
      return;
    }
    if (next) {
      // Make sure the default list exists before showing the picker so
      // first-time users see at least one tappable option.
      await ensureDefaultWishlist();
    }
    setOpen(next);
  };

  const handleToggle = async (wishlistId: string) => {
    if (isInWishlist(listingId, wishlistId)) {
      await removeFromWishlist(wishlistId, listingId);
    } else {
      await addToWishlist(wishlistId, listingId);
    }
  };

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    const list = await createWishlist(title);
    if (list) {
      await addToWishlist(list.id, listingId);
      setNewTitle('');
    }
    setCreating(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          style={{
            height: px,
            width: px,
            color: filled ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
            transition: 'color 0.2s',
          }}
          aria-label={filled ? 'Edit wishlists for this item' : 'Save to a wishlist'}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <Heart
            style={{
              height: iconPx,
              width: iconPx,
              fill: filled ? 'currentColor' : 'none',
              transition: 'fill 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-2">
          <p className="text-13 uppercase tracking-wide text-muted-foreground">Save to</p>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {wishlists.length === 0 && (
            <p className="px-4 py-2 text-sm text-muted-foreground">No lists yet — create one below.</p>
          )}
          {wishlists.map((w) => {
            const inList = isInWishlist(listingId, w.id);
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => handleToggle(w.id)}
                className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{w.title}</span>
                  {w.is_default && (
                    <span className="shrink-0 text-2xs uppercase tracking-wide text-muted-foreground">
                      default
                    </span>
                  )}
                </span>
                {inList && <Check size={16} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New list name…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              aria-label="New list name"
            />
            <Button
              variant="default"
              size="icon"
              onClick={handleCreate}
              disabled={!newTitle.trim() || creating}
              aria-label="Create list and save"
            >
              <Plus size={16} />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
