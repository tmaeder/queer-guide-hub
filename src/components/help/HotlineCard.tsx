/**
 * HotlineCard — one call-now line.
 *
 * Deliberately NOT `.card-lift`: the card carries a Call button, channel
 * buttons, a website link, a keep toggle and a report dialog, so it is not a
 * single click target and a lift would promise whole-card clickability that
 * does not exist. Hover lives on the children.
 *
 * The `reports_to_police` warning is a full-width bordered strip in a fixed
 * position, not a fourth chip in the chip row. As a chip it inherited the
 * visual grammar of "24/7" and "Free" — which are REASSURANCES — and that is
 * precisely how you make an outing signal missable.
 */

import { useTranslation } from 'react-i18next';
import {
  Phone,
  MessageSquare,
  MessageCircle,
  Mail,
  Globe,
  ExternalLink,
  Bookmark,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Languages,
  BadgeCheck,
} from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { Hotline, HotlineChannel } from '@/types/cms';
import {
  channelHref,
  countryLabel,
  hotlineChannels,
  isAlwaysOpen,
  isOpenNow,
  TOPIC_TO_RESOURCE,
} from './helpData';
import { ReportHotline } from './ReportHotline';

const CHANNEL_ICON: Record<HotlineChannel['kind'], typeof Phone> = {
  phone: Phone,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  chat: Globe,
  email: Mail,
};

const CHIP = 'border-2 border-foreground px-2 py-1 text-2xs font-bold uppercase tracking-label';

export function HotlineCard({
  hotline,
  isKept,
  toggleKeep,
  showCountry,
}: {
  hotline: Hotline;
  isKept: boolean;
  toggleKeep: (id: string) => void;
  /** Country is redundant once the page is scoped to one. */
  showCountry: boolean;
}) {
  const { t } = useTranslation();
  const channels = hotlineChannels(hotline);
  const primaryPhone = channels.find((c) => c.kind === 'phone');
  const secondary = channels.filter((c) => c.kind !== 'phone');
  const open = isOpenNow(hotline);
  const verified = hotline.verified_at ? new Date(hotline.verified_at) : null;

  return (
    <article className="flex h-full flex-col border-[3px] border-foreground bg-background">
      <header className="border-b-2 border-foreground/10 p-4">
        <div className="flex items-start justify-between gap-4">
          <h3 className="min-w-0 text-title font-bold leading-tight">{hotline.name}</h3>
          <div className="flex shrink-0 items-center gap-2">
            {showCountry && <span className={CHIP}>{countryLabel(hotline.country)}</span>}
            <button
              type="button"
              onClick={() => toggleKeep(hotline.id)}
              aria-pressed={isKept}
              aria-label={
                isKept
                  ? t('help.unkeep', 'Stop keeping this line')
                  : t('help.keep', 'Keep this line')
              }
              className="border-2 border-foreground p-1 transition-colors hover:bg-foreground hover:text-background"
            >
              <Bookmark size={14} fill={isKept ? 'currentColor' : 'none'} aria-hidden />
            </button>
          </div>
        </div>

        {/* Unknown availability renders the raw hours only — never "Closed". */}
        <p className="mt-2 flex items-center gap-2 text-13">
          <Clock size={14} aria-hidden className="shrink-0" />
          {open === null ? (
            <span className="text-muted-foreground">{hotline.hours}</span>
          ) : isAlwaysOpen(hotline) ? (
            <span className="font-bold">{t('help.open_always', 'Open 24/7')}</span>
          ) : open ? (
            <span>
              <span className="font-bold">{t('help.open_now', 'Open now')}</span>
              <span className="text-muted-foreground"> · {hotline.hours}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              {t('help.closed_now', 'Closed right now')} · {hotline.hours}
            </span>
          )}
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <p className="text-13 leading-relaxed text-muted-foreground">{hotline.description}</p>

        {/* Three-state. `true` is red because it is danger TO THE READER;
            `false` is ink because it is a reassurance and red would flatten the
            difference. Absent renders nothing at all — we do not imply either. */}
        {hotline.reports_to_police === true && (
          <p className="flex items-start gap-2 border-2 border-destructive bg-destructive p-4 text-13 font-bold leading-relaxed text-destructive-foreground">
            <ShieldAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
            {t(
              'help.reports_police_warning',
              'This line may contact police or emergency services without your consent.',
            )}
          </p>
        )}
        {hotline.reports_to_police === false && (
          <p className="flex items-start gap-2 border-2 border-foreground p-4 text-13 font-bold leading-relaxed">
            <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0" />
            {t(
              'help.no_police_policy',
              'This line publishes a policy of never contacting police or emergency services without your explicit request.',
            )}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {isAlwaysOpen(hotline) && <span className={CHIP}>{t('help.badge_24_7', '24/7')}</span>}
          {hotline.free && <span className={CHIP}>{t('help.badge_free', 'Free')}</span>}
          {hotline.anonymous && (
            <span className={CHIP}>{t('help.badge_anonymous', 'Anonymous')}</span>
          )}
          {hotline.affiliation && hotline.affiliation !== 'secular' && (
            <span className={CHIP}>
              {t(`help.affiliation.${hotline.affiliation}`, hotline.affiliation)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {hotline.topics.map((tp) => {
            const cat = TOPIC_TO_RESOURCE[tp];
            const label = t(`help.topic.${tp}`, tp);
            return cat ? (
              <LocalizedLink
                key={tp}
                to={`/resources?category=${encodeURIComponent(cat)}`}
                className="border-2 border-foreground/20 px-2 py-1 text-2xs font-bold no-underline transition-colors hover:border-foreground"
              >
                {label}
              </LocalizedLink>
            ) : (
              <span key={tp} className="border-2 border-foreground/20 px-2 py-1 text-2xs font-bold">
                {label}
              </span>
            );
          })}
        </div>

        <dl className="m-0 flex flex-col gap-1 text-13 text-muted-foreground">
          {hotline.languages.length > 0 && (
            <div className="flex items-center gap-2">
              <dt className="sr-only">{t('help.languages', 'Languages')}</dt>
              <Languages size={14} aria-hidden />
              <dd className="m-0">{hotline.languages.map((l) => l.toUpperCase()).join(' · ')}</dd>
            </div>
          )}
          {(hotline.operator || verified) && (
            <div className="flex items-center gap-2">
              <dt className="sr-only">{t('help.provenance', 'Provenance')}</dt>
              <BadgeCheck size={14} aria-hidden />
              <dd className="m-0">
                {hotline.operator && `${t('help.operator', 'Operated by')}: ${hotline.operator}`}
                {hotline.operator && verified && ' · '}
                {verified &&
                  `${t('help.verified_on', 'Verified')} ${verified.toISOString().slice(0, 10)}`}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-auto flex flex-col gap-2 pt-2">
          {primaryPhone && (
            <a
              href={channelHref(primaryPhone)}
              className="flex items-center justify-between gap-4 border-2 border-foreground bg-foreground px-4 py-4 text-background no-underline transition-opacity hover:opacity-90"
              aria-label={t('help.call_aria', 'Call {{name}} {{phone}}', {
                name: hotline.name,
                phone: primaryPhone.value,
              })}
            >
              <span className="flex items-center gap-2 text-13 font-bold">
                <Phone size={16} aria-hidden />
                {t('help.call_now', 'Call now')}
              </span>
              <span className="text-title font-bold tabular-nums">{primaryPhone.value}</span>
            </a>
          )}

          {(secondary.length > 0 || (hotline.url && hotline.link_status !== 'broken')) && (
            <div className="flex flex-wrap gap-2">
              {secondary.map((c) => {
                const Icon = CHANNEL_ICON[c.kind];
                return (
                  <a
                    key={`${c.kind}-${c.value}`}
                    href={channelHref(c)}
                    target={c.kind === 'chat' ? '_blank' : undefined}
                    rel={c.kind === 'chat' ? 'noopener noreferrer' : undefined}
                    className="flex flex-1 items-center justify-center gap-2 border-2 border-foreground px-4 py-2 text-13 font-bold no-underline transition-colors hover:bg-foreground hover:text-background"
                    aria-label={`${hotline.name} — ${c.label ?? c.kind}`}
                  >
                    <Icon size={14} aria-hidden />
                    {c.label ?? t(`help.channel.${c.kind}`, c.kind)}
                  </a>
                );
              })}
              {hotline.url && hotline.link_status !== 'broken' && (
                <a
                  href={hotline.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 border-2 border-foreground px-4 py-2 text-13 font-bold no-underline transition-colors hover:bg-foreground hover:text-background"
                  aria-label={`${hotline.name} — ${t('help.visit_site', 'Website')}`}
                >
                  <ExternalLink size={14} aria-hidden />
                  {t('help.website', 'Website')}
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="flex justify-end border-t-2 border-foreground/10 px-4 py-2">
        <ReportHotline hotlineId={hotline.id} />
      </footer>
    </article>
  );
}
