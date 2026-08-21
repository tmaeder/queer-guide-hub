/**
 * HotlineRow — one call-now line, as a row instead of a card.
 *
 * The 2026-08-11 card stacked ten zones and rendered 2–6 lines as the tallest
 * possible grid. A row keeps everything a reader in crisis acts on ALWAYS
 * visible — name, open state, call button, the first non-voice channel — and
 * puts the research fields (description, remaining channels, topics,
 * provenance, report) behind an expander.
 *
 * Two things never go behind the expander:
 * - The `reports_to_police === true` strip. It is danger to the reader; a
 *   collapsed warning is a missable warning.
 * - The open state / raw hours. Unknown availability renders the raw hours
 *   only — never "Closed" (see helpData.isOpenNow).
 *
 * The row is deliberately NOT one click target (call, channel, keep, expand),
 * so no `.card-lift` and no whole-row link — same reasoning as the old card.
 */

import { useId, useState } from 'react';
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
  BadgeCheck,
  ChevronDown,
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

/** Text-and-icon action, ink hover fill — same idiom as the old card's channel row. */
const CHANNEL_BTN =
  'flex items-center justify-center gap-2 rounded-element px-4 py-2 text-13 font-bold no-underline transition-colors hover:bg-foreground hover:text-background';

export function HotlineRow({
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
  const detailsId = useId();
  const [expanded, setExpanded] = useState(false);

  const channels = hotlineChannels(hotline);
  const primaryPhone = channels.find((c) => c.kind === 'phone');
  const secondary = channels.filter((c) => c.kind !== 'phone');
  // The first non-voice channel stays visible without expanding — a reader who
  // cannot safely make a voice call must never have to open a drawer to learn
  // that chat exists.
  const quickAlt = secondary[0];
  const restChannels = secondary.slice(1);
  const open = isOpenNow(hotline);
  const verified = hotline.verified_at ? new Date(hotline.verified_at) : null;
  const QuickAltIcon = quickAlt ? CHANNEL_ICON[quickAlt.kind] : null;

  const metaBits: string[] = [
    ...(hotline.free ? [t('help.badge_free', 'Free')] : []),
    ...(hotline.anonymous ? [t('help.badge_anonymous', 'Anonymous')] : []),
    ...(hotline.affiliation && hotline.affiliation !== 'secular'
      ? [t(`help.affiliation.${hotline.affiliation}`, hotline.affiliation)]
      : []),
    ...(showCountry ? [countryLabel(hotline.country)] : []),
    ...(hotline.languages.length > 0
      ? [hotline.languages.map((l) => l.toUpperCase()).join('/')]
      : []),
  ];

  return (
    <article>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <div className="min-w-0 flex-1 basis-56">
          <h3 className="text-title font-bold leading-tight">{hotline.name}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-13">
            <span className="flex items-center gap-2">
              <Clock size={14} aria-hidden className="shrink-0" />
              {/* Unknown availability renders the raw hours only — never "Closed". */}
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
            </span>
            {metaBits.map((bit) => (
              <span key={bit} className="text-muted-foreground">
                <span aria-hidden>· </span>
                {bit}
              </span>
            ))}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {primaryPhone && (
            <a
              href={channelHref(primaryPhone)}
              className="flex items-center gap-2 rounded-element bg-foreground px-4 py-2 text-background no-underline transition-opacity hover:opacity-90"
              aria-label={t('help.call_aria', 'Call {{name}} {{phone}}', {
                name: hotline.name,
                phone: primaryPhone.value,
              })}
            >
              <Phone size={14} aria-hidden />
              <span className="text-13 font-bold">{t('help.call_now', 'Call now')}</span>
              <span className="text-15 font-bold tabular-nums">{primaryPhone.value}</span>
            </a>
          )}
          {quickAlt && QuickAltIcon && (
            <a
              href={channelHref(quickAlt)}
              target={quickAlt.kind === 'chat' ? '_blank' : undefined}
              rel={quickAlt.kind === 'chat' ? 'noopener noreferrer' : undefined}
              className={CHANNEL_BTN}
              aria-label={`${hotline.name} — ${quickAlt.label ?? quickAlt.kind}`}
            >
              <QuickAltIcon size={14} aria-hidden />
              {quickAlt.label ?? t(`help.channel.${quickAlt.kind}`, quickAlt.kind)}
            </a>
          )}
          <button
            type="button"
            onClick={() => toggleKeep(hotline.id)}
            aria-pressed={isKept}
            aria-label={
              isKept ? t('help.unkeep', 'Stop keeping this line') : t('help.keep', 'Keep this line')
            }
            className="rounded-element p-2 transition-colors hover:bg-foreground hover:text-background"
          >
            <Bookmark size={14} fill={isKept ? 'currentColor' : 'none'} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={t('help.details_aria', 'Details for {{name}}', { name: hotline.name })}
            className="rounded-element p-2 transition-colors hover:bg-foreground hover:text-background"
          >
            {/* Static flip, no transition — the crisis pages are animation-free. */}
            <ChevronDown size={16} aria-hidden className={expanded ? 'rotate-180' : undefined} />
          </button>
        </div>
      </div>

      {/* Three-state. `true` is red because it is danger TO THE READER, so it can
          NEVER go behind the expander; `false` is an ink reassurance and lives in
          the details. Absent renders nothing at all — we do not imply either. */}
      {hotline.reports_to_police === true && (
        <p className="border mx-4 mb-4 flex items-start gap-2 rounded-element border-destructive bg-destructive p-4 text-13 font-bold leading-relaxed text-destructive-foreground">
          <ShieldAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
          {t(
            'help.reports_police_warning',
            'This line may contact police or emergency services without your consent.',
          )}
        </p>
      )}

      {expanded && (
        <div id={detailsId} className="flex flex-col gap-4 border-t border-border-hairline p-4">
          <p className="text-13 leading-relaxed text-muted-foreground">{hotline.description}</p>

          {hotline.reports_to_police === false && (
            <p className="flex items-start gap-2 rounded-element bg-muted p-4 text-13 font-bold leading-relaxed">
              <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0" />
              {t(
                'help.no_police_policy',
                'This line publishes a policy of never contacting police or emergency services without your explicit request.',
              )}
            </p>
          )}

          {(restChannels.length > 0 || (hotline.url && hotline.link_status !== 'broken')) && (
            <div className="flex flex-wrap gap-2">
              {restChannels.map((c) => {
                const Icon = CHANNEL_ICON[c.kind];
                return (
                  <a
                    key={`${c.kind}-${c.value}`}
                    href={channelHref(c)}
                    target={c.kind === 'chat' ? '_blank' : undefined}
                    rel={c.kind === 'chat' ? 'noopener noreferrer' : undefined}
                    className={CHANNEL_BTN}
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
                  className={CHANNEL_BTN}
                  aria-label={`${hotline.name} — ${t('help.visit_site', 'Website')}`}
                >
                  <ExternalLink size={14} aria-hidden />
                  {t('help.website', 'Website')}
                </a>
              )}
            </div>
          )}

          {hotline.topics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {hotline.topics.map((tp) => {
                const cat = TOPIC_TO_RESOURCE[tp];
                const label = t(`help.topic.${tp}`, tp);
                return cat ? (
                  <LocalizedLink
                    key={tp}
                    to={`/resources?category=${encodeURIComponent(cat)}`}
                    className="rounded-badge border border-foreground/20 px-2 py-1 text-2xs font-bold no-underline transition-colors hover:border-border-hairline"
                  >
                    {label}
                  </LocalizedLink>
                ) : (
                  <span
                    key={tp}
                    className="rounded-badge border border-foreground/20 px-2 py-1 text-2xs font-bold"
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {hotline.operator || verified ? (
              <p className="flex items-center gap-2 text-13 text-muted-foreground">
                <BadgeCheck size={14} aria-hidden />
                <span>
                  {hotline.operator && `${t('help.operator', 'Operated by')}: ${hotline.operator}`}
                  {hotline.operator && verified && ' · '}
                  {verified &&
                    `${t('help.verified_on', 'Verified')} ${verified.toISOString().slice(0, 10)}`}
                </span>
              </p>
            ) : (
              <span />
            )}
            <ReportHotline hotlineId={hotline.id} />
          </div>
        </div>
      )}
    </article>
  );
}
