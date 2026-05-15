/**
 * HeroCTA — single, country-aware primary CTA above the directory.
 *
 * Picks the user's country's best 24/7 free hotline and renders a large
 * call-to-action plus equal-weight Text / Chat / WhatsApp / Email secondary
 * buttons so non-voice channels are not second-class.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, MessageSquare, MessageCircle, Mail, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Hotline, HotlineChannel } from '@/types/cms';

const CHANNEL_ICON: Record<HotlineChannel['kind'], typeof Phone> = {
  phone: Phone,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  chat: Globe,
  email: Mail,
};

function channelHref(c: HotlineChannel): string {
  switch (c.kind) {
    case 'phone':
    case 'sms':
      return `${c.kind === 'phone' ? 'tel' : 'sms'}:${c.value.replace(/\s+/g, '')}`;
    case 'email':
      return `mailto:${c.value}`;
    case 'whatsapp':
      return c.value.startsWith('http')
        ? c.value
        : `https://wa.me/${c.value.replace(/[^\d]/g, '')}`;
    case 'chat':
      return c.value;
  }
}

function is247(hours: string): boolean {
  const h = hours.toLowerCase();
  return h.includes('24/7') || h.includes('24 h') || h.includes('rund um die uhr');
}

function score(h: Hotline): number {
  // Higher = better hero candidate.
  let s = 0;
  if (is247(h.hours)) s += 10;
  if (h.free) s += 4;
  if (h.anonymous) s += 2;
  if (h.reports_to_police) s -= 5;
  s += Math.min(h.topics.length, 5);
  return s;
}

export function HeroCTA({ hotlines, country }: { hotlines: Hotline[]; country: string }) {
  const { t } = useTranslation();

  const hero = useMemo(() => {
    if (country === 'ALL' || hotlines.length === 0) return null;
    const inCountry = hotlines.filter((h) => h.country === country);
    if (inCountry.length === 0) return null;
    return [...inCountry].sort((a, b) => score(b) - score(a))[0];
  }, [hotlines, country]);

  if (!hero) return null;

  const phoneChannel: HotlineChannel | null = hero.phone
    ? { kind: 'phone', value: hero.phone }
    : null;
  const explicitPhone = hero.channels?.find((c) => c.kind === 'phone');
  const primary = explicitPhone ?? phoneChannel;
  const secondary = (hero.channels ?? []).filter((c) => c.kind !== 'phone');

  return (
    <div className="mb-6 rounded-container border bg-card p-5 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('help.hero_label', 'Recommended right now')}
        </span>
        {is247(hero.hours) && (
          <Badge variant="default" className="text-[10px]">
            {t('help.badge_24_7', '24/7')}
          </Badge>
        )}
        {hero.free && (
          <Badge variant="outline" className="text-[10px]">
            {t('help.badge_free', 'Free')}
          </Badge>
        )}
        {hero.anonymous && (
          <Badge variant="outline" className="text-[10px]">
            {t('help.badge_anonymous', 'Anonymous')}
          </Badge>
        )}
      </div>
      <h2 className="mb-1 text-xl font-bold leading-tight">{hero.name}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{hero.description}</p>

      {primary && (
        <Button asChild size="lg" className="mb-3 h-14 w-full justify-between text-base">
          <a href={channelHref(primary)}>
            <span className="flex items-center gap-2">
              <Phone size={20} />
              {t('help.call_now', 'Call now')}
            </span>
            <span className="font-mono">{primary.value}</span>
          </a>
        </Button>
      )}

      {secondary.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {secondary.map((c) => {
            const Icon = CHANNEL_ICON[c.kind];
            return (
              <Button
                key={`${c.kind}-${c.value}`}
                asChild
                variant="outline"
                size="lg"
                className="h-12"
              >
                <a
                  href={channelHref(c)}
                  target={c.kind === 'chat' ? '_blank' : undefined}
                  rel={c.kind === 'chat' ? 'noopener noreferrer' : undefined}
                >
                  <Icon size={16} className="mr-1.5" />
                  {c.label ?? t(`help.channel.${c.kind}`, c.kind)}
                </a>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
