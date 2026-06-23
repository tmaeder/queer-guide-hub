import { Globe, Music, BadgeCheck, ShieldCheck } from 'lucide-react';
import { Twitter, Instagram, Linkedin, Github, Facebook, Youtube } from '@/components/icons/brand';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { displayHandle, readAccounts, type SocialAccount } from '@/lib/socialAccounts';

interface SocialAccountsDisplayProps {
  /** profile.social_accounts (jsonb array) — preferred source. */
  socialAccounts?: unknown;
  /** Legacy profile.social_links map — fallback when no accounts exist. */
  socialLinks?: Record<string, unknown> | null;
}

const ICONS: Record<string, React.ComponentType<{ style?: React.CSSProperties }>> = {
  Instagram,
  Facebook,
  YouTube: Youtube,
  GitHub: Github,
  LinkedIn: Linkedin,
  'X (Twitter)': Twitter,
  TikTok: Music,
  SoundCloud: Music,
  Spotify: Music,
  Bandcamp: Music,
};

function PlatformIcon({ platform }: { platform: string }) {
  const Icon = ICONS[platform] ?? Globe;
  return <Icon style={{ width: 16, height: 16 }} />;
}

function VerifiedMarker({ status }: { status: SocialAccount['verified'] }) {
  if (status === 'verified') {
    return <BadgeCheck size={14} className="text-foreground" aria-label="Verified account" />;
  }
  if (status === 'linked') {
    return <ShieldCheck size={14} className="text-muted-foreground" aria-label="Self-linked account" />;
  }
  return null;
}

function AccountCard({ account, featured }: { account: SocialAccount; featured?: boolean }) {
  const handle = displayHandle(account);
  const name = account.display_name || handle;
  return (
    <a
      href={account.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 rounded-element border border-border bg-background px-2 py-2 hover:bg-muted no-underline ${
        featured ? 'sm:col-span-2' : ''
      }`}
    >
      <Avatar style={{ width: featured ? 40 : 32, height: featured ? 40 : 32 }}>
        {account.avatar_url ? <AvatarImage src={account.avatar_url} alt={name} /> : null}
        <AvatarFallback className="bg-muted">
          <PlatformIcon platform={account.platform} />
        </AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1 text-sm font-medium text-foreground truncate">
          {name}
          <VerifiedMarker status={account.verified} />
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
          <PlatformIcon platform={account.platform} />
          {account.platform}
        </span>
      </span>
    </a>
  );
}

export function SocialAccountsDisplay({ socialAccounts, socialLinks }: SocialAccountsDisplayProps) {
  const accounts = readAccounts(socialAccounts, socialLinks);
  if (accounts.length === 0) return null;

  // Featured first, otherwise preserve stored order.
  const ordered = [...accounts].sort((a, b) => Number(!!b.featured) - Number(!!a.featured));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {ordered.map((account, i) => (
        <AccountCard key={`${account.platform}-${account.url}-${i}`} account={account} featured={account.featured} />
      ))}
    </div>
  );
}
