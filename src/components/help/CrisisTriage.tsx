/**
 * CrisisTriage — the page's actual product.
 *
 * One panel answering "what can I do in the next 60 seconds", with three
 * answers at equal weight: call, write, or steady yourself. Everything a
 * browser needs lives below the seam; nothing above it asks the reader to
 * make a decision. The guarantee is ordinal, not fold arithmetic — after the
 * safety controls, the next interactive element is a dialable number, and no
 * filter, search or dropdown precedes it. (At 320px nothing fits "above the
 * fold" anyway, and the page has to clear a 320px reflow gate.)
 *
 * This is the ONE ink-flooded surface on /help, matching the `tone="ink"`
 * variant the design system reserves for report and safety blocks. It is also
 * the only weight tool available: track colours are banned here, so emphasis
 * comes from inversion and rules, never from hue.
 *
 * The <h1> lives in here rather than in a PageHeader above it — partly to buy
 * back ~140px of the first screen, and partly because PageHeader hardcodes
 * `.content-enter`, a 300ms staggered opacity entrance, which would animate
 * the crisis heading in on a page the design system requires to be static.
 */

import { useTranslation } from 'react-i18next';
import { Phone, MessageSquare, MessageCircle, Mail, Globe } from 'lucide-react';
import type { Hotline, HotlineChannel } from '@/types/cms';
import {
  channelHref,
  isAlwaysOpen,
  isOpenNow,
  nonVoiceChannels,
  selectOpenAlternative,
} from './helpData';
import { CountryScope } from './CountryScope';
import { SelfHelpDrawer } from './SelfHelpDrawer';

const CHANNEL_ICON: Record<HotlineChannel['kind'], typeof Phone> = {
  phone: Phone,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  chat: Globe,
  email: Mail,
};

/** Paper-on-ink action. The panel is inverted, so the strongest fill is paper. */
const PRIMARY =
  'flex w-full items-center justify-between gap-4 border-[3px] border-background bg-background px-6 py-6 text-foreground no-underline transition-opacity hover:opacity-90';
const SECONDARY =
  'flex items-center justify-center gap-2 border-2 border-background px-4 py-4 text-13 font-bold text-background no-underline transition-colors hover:bg-background hover:text-foreground';
/** Same paper-on-ink logic as SECONDARY, tightened for a row of kept lines. */
const KEPT =
  'flex items-center gap-2 border-2 border-background px-4 py-2 text-13 font-bold text-background no-underline transition-colors hover:bg-background hover:text-foreground';

function Availability({ hotline }: { hotline: Hotline }) {
  const { t } = useTranslation();
  const open = isOpenNow(hotline);

  // Unknown renders as silence. Labelling a line "Closed" when we simply could
  // not structure its hours is the harmful direction — someone would not call.
  if (open === null) return <span className="text-13 opacity-70">{hotline.hours}</span>;

  if (isAlwaysOpen(hotline)) {
    return <span className="text-13 font-bold">{t('help.open_always', 'Open 24/7')}</span>;
  }
  return open ? (
    <span className="text-13 font-bold">
      {t('help.open_now', 'Open now')} · {hotline.hours}
    </span>
  ) : (
    <span className="text-13 opacity-70">
      {t('help.closed_now', 'Closed right now')} · {hotline.hours}
    </span>
  );
}

export function CrisisTriage({
  hotlines,
  hero,
  country,
  availableCountries,
  onCountryChange,
  savedLines,
}: {
  /** Unfiltered list — used only to decide whether we have anything at all. */
  hotlines: Hotline[];
  /** Chosen by selectPrimaryLine in the page, so JSON-LD and UI cannot diverge. */
  hero: Hotline | null;
  country: string;
  availableCountries: string[];
  onCountryChange: (code: string) => void;
  savedLines: Hotline[];
}) {
  const { t } = useTranslation();
  const alt = hero ? nonVoiceChannels(hero) : [];
  const phone = hero ? (hero.channels?.find((c) => c.kind === 'phone')?.value ?? hero.phone) : null;

  // A known-closed recommendation is the one case where the strongest line is
  // the wrong thing to act on. `null` — hours we could not structure — is
  // deliberately excluded: we do not know it is shut, so we do not second-guess
  // it. Only a hard `false` earns the fallback.
  const heroClosed = hero ? isOpenNow(hero) === false : false;
  const openAlt = heroClosed ? selectOpenAlternative(hotlines, country, hero) : null;
  const altPhone = openAlt
    ? (openAlt.channels?.find((c) => c.kind === 'phone')?.value ?? openAlt.phone)
    : null;
  const altChannel = openAlt ? nonVoiceChannels(openAlt)[0] : null;
  // The phone-bill reassurance is factually scoped to three countries and
  // reads as noise anywhere else.
  const showBillNote = ['DE', 'AT', 'CH'].includes(country);

  return (
    <section className="border-[3px] border-foreground bg-foreground p-6 text-background md:p-8">
      <h1 className="font-display text-display leading-tight md:text-hero">
        {t('help.title', 'Help & Crisis Hotlines')}
      </h1>

      <div className="mt-4">
        <CountryScope country={country} available={availableCountries} onChange={onCountryChange} />
      </div>

      {hero ? (
        <div className="mt-8">
          <p className="text-2xs font-bold uppercase tracking-label text-background/70">
            {t('help.hero_label', 'Recommended right now')}
          </p>
          <h2 className="mt-2 font-display text-headline leading-tight">{hero.name}</h2>
          <p className="mt-1 text-15 leading-relaxed text-background/80">{hero.description}</p>
          <p className="mt-2">
            <Availability hotline={hero} />
          </p>

          {phone && (
            <a
              href={channelHref({ kind: 'phone', value: phone })}
              className={`mt-6 ${PRIMARY}`}
              aria-label={t('help.call_aria', 'Call {{name}} {{phone}}', {
                name: hero.name,
                phone,
              })}
            >
              <span className="flex items-center gap-2 text-15 font-bold">
                <Phone size={20} aria-hidden />
                {t('help.call_now', 'Call now')}
              </span>
              <span className="text-title font-bold tabular-nums">{phone}</span>
            </a>
          )}

          {/* A closed line is not an action. When the recommendation is shut
              and something else is demonstrably open, offer it here — directly
              beside the button that would otherwise ring out. */}
          {openAlt && (
            <div className="mt-6 border-2 border-background/40 p-4">
              <p className="text-2xs font-bold uppercase tracking-label text-background/70">
                {t('help.open_instead', 'Open right now instead')}
              </p>
              <p className="mt-2 text-15 font-bold">{openAlt.name}</p>
              <p className="mt-1">
                <Availability hotline={openAlt} />
              </p>
              {altPhone ? (
                <a
                  href={channelHref({ kind: 'phone', value: altPhone })}
                  className={`mt-4 ${SECONDARY}`}
                  aria-label={t('help.call_aria', 'Call {{name}} {{phone}}', {
                    name: openAlt.name,
                    phone: altPhone,
                  })}
                >
                  <Phone size={16} aria-hidden />
                  <span className="tabular-nums">{altPhone}</span>
                </a>
              ) : altChannel ? (
                <a
                  href={channelHref(altChannel)}
                  target={altChannel.kind === 'chat' ? '_blank' : undefined}
                  rel={altChannel.kind === 'chat' ? 'noopener noreferrer' : undefined}
                  className={`mt-4 ${SECONDARY}`}
                  aria-label={`${openAlt.name} — ${altChannel.label ?? altChannel.kind}`}
                >
                  {altChannel.label ?? t(`help.channel.${altChannel.kind}`, altChannel.kind)}
                </a>
              ) : null}
            </div>
          )}

          {/* The commoner case, and the one the fallback above cannot reach.
              Measured on production 2026-08-12: CA, FR, IE and NL each carry
              exactly ONE line, and both INT entries are directories — so when
              that single line shuts, there is nothing open to offer and the
              reader is left holding a number that rings out. Four of the ten
              covered countries were in that state at the time of writing.
              Naming the closure and pointing somewhere is the minimum; the
              real remedy is more lines in the corpus. */}
          {heroClosed && !openAlt && (
            <p className="mt-6 border-2 border-background/40 p-4 text-13 leading-relaxed text-background/80">
              {t(
                'help.closed_no_alt',
                'This line is closed right now and we have no other line open for this country. In acute danger, use the emergency number above.',
              )}{' '}
              <a
                href="#help-browse"
                className="font-bold text-background underline underline-offset-4"
              >
                {t('help.see_all_lines', 'See every line we have')}
              </a>
            </p>
          )}

          {/* Non-voice routes at equal weight — many readers cannot safely make
              a voice call. When a line publishes none, say so rather than
              rendering an empty region that reads as "not offered here". */}
          <div className="mt-6">
            <p className="text-2xs font-bold uppercase tracking-label text-background/70">
              {t('help.cant_speak', 'Can’t speak?')}
            </p>
            {alt.length > 0 ? (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {alt.map((c) => {
                  const Icon = CHANNEL_ICON[c.kind];
                  return (
                    <a
                      key={`${c.kind}-${c.value}`}
                      href={channelHref(c)}
                      target={c.kind === 'chat' ? '_blank' : undefined}
                      rel={c.kind === 'chat' ? 'noopener noreferrer' : undefined}
                      className={SECONDARY}
                      aria-label={`${hero.name} — ${c.label ?? c.kind}`}
                    >
                      <Icon size={16} aria-hidden />
                      {c.label ?? t(`help.channel.${c.kind}`, c.kind)}
                    </a>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-13 text-background/80">
                {hero.url
                  ? t(
                      'help.phone_only_with_site',
                      'This line is phone-only in our records. Their website may offer chat or email.',
                    )
                  : t('help.phone_only', 'This line is phone-only in our records.')}{' '}
                {hero.url && (
                  <a
                    href={hero.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-background underline underline-offset-4"
                  >
                    {t('help.visit_site', 'Open their website')}
                  </a>
                )}
              </p>
            )}
          </div>
        </div>
      ) : (
        // The geo-failure default used to render nothing at all here.
        <div className="mt-8 border-2 border-background/40 p-4">
          <h2 className="text-title font-bold leading-tight">
            {hotlines.length === 0
              ? t('help.no_lines_title', 'We could not load the directory')
              : t('help.no_country_title', 'We could not work out where you are')}
          </h2>
          <p className="mt-2 text-15 leading-relaxed text-background/80">
            {hotlines.length === 0
              ? t(
                  'help.no_lines_body',
                  'If you are in danger right now, call your local emergency number: 112 (EU) or 911 (US/CA).',
                )
              : t(
                  'help.no_country_body',
                  'Pick a country above and we will show the best line for it. Every line we have is listed below.',
                )}
          </p>
        </div>
      )}

      {/* You keep a line so you can reach it fast under pressure. Rendering the
          names as a joined string made the feature decorative — the one moment
          it exists for is the one moment you cannot act on it. */}
      {savedLines.length > 0 && (
        <div className="mt-6">
          <p className="text-2xs font-bold uppercase tracking-label text-background/70">
            {t('help.saved_lines', 'Kept lines')}
          </p>
          <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
            {savedLines.map((h) => {
              const keptPhone = h.channels?.find((c) => c.kind === 'phone')?.value ?? h.phone;
              const keptChannel = keptPhone ? null : nonVoiceChannels(h)[0];
              const href = keptPhone
                ? channelHref({ kind: 'phone', value: keptPhone })
                : keptChannel
                  ? channelHref(keptChannel)
                  : h.url;
              // A kept line we cannot route anywhere is not worth a dead chip.
              if (!href) return null;
              const offsite = !keptPhone && (!keptChannel || keptChannel.kind === 'chat');
              return (
                <li key={h.id}>
                  <a
                    href={href}
                    target={offsite ? '_blank' : undefined}
                    rel={offsite ? 'noopener noreferrer' : undefined}
                    className={KEPT}
                    aria-label={
                      keptPhone
                        ? t('help.call_aria', 'Call {{name}} {{phone}}', {
                            name: h.name,
                            phone: keptPhone,
                          })
                        : h.name
                    }
                  >
                    {keptPhone && <Phone size={14} aria-hidden />}
                    {h.name}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-8 border-t-2 border-background/30 pt-6">
        <p className="text-2xs font-bold uppercase tracking-label text-background/70">
          {t('help.expect_title', 'What happens when you call')}
        </p>
        <ul className="m-0 mt-2 list-none space-y-1 p-0 text-13 leading-relaxed text-background/80">
          <li>
            {t('help.expect_1', 'You’ll hear a short greeting. You don’t have to give your name.')}
          </li>
          <li>
            {t(
              'help.expect_2',
              'You can hang up at any time. You can call back as often as you need.',
            )}
          </li>
          <li>
            {t(
              'help.expect_4',
              'If you can’t speak, ask for text or chat — most hotlines offer it.',
            )}
          </li>
          {showBillNote && (
            <li>
              {t(
                'help.expect_3',
                'Free hotlines in DE/AT/CH don’t appear on itemized phone bills.',
              )}
            </li>
          )}
        </ul>
        <div className="mt-4">
          <SelfHelpDrawer />
        </div>
      </div>
    </section>
  );
}
