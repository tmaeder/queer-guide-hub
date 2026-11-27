import { useTranslation } from 'react-i18next';
import { CopyableSnippet } from '@/components/ui/copyable-snippet';
import {
  BADGE_PATH,
  BADGE_SNIPPET,
  LINKABLE_PAGES,
  LISTING_SNIPPET,
  ORIGIN,
} from './linkToUsSnippets';

export function LinkToUs() {
  const { t } = useTranslation();
  const copyStrings = {
    copyLabel: t('press.linkToUs.copy', 'Copy'),
    copiedLabel: t('press.linkToUs.copied', 'Copied'),
    failedMessage: t(
      'press.linkToUs.copyFailed',
      'Could not copy automatically. The text is selected; copy it with your keyboard.',
    ),
  };
  return (
    <section aria-labelledby="link-to-us" className="mt-12 flex flex-col gap-8">
      <div className="max-w-prose">
        <h2 id="link-to-us" className="font-display text-headline leading-tight">
          {t('press.linkToUs.title', 'Link to us')}
        </h2>
        <p className="mt-4 text-body-lg">
          {t(
            'press.linkToUs.intro',
            'You are welcome to link to any page on Queer Guide. These are the ones most often cited. Copy a snippet into your page, or write your own link text.',
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {LINKABLE_PAGES.map((page) => (
          <CopyableSnippet
            {...copyStrings}
            key={page.id}
            label={t(`press.linkToUs.page.${page.id}`, page.text)}
            text={`<a href="${ORIGIN}${page.path}">${page.text}</a>`}
          />
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-title font-bold">{t('press.linkToUs.badgeTitle', 'Data badge')}</h3>
        <p className="max-w-prose">
          {t(
            'press.linkToUs.badgeBody',
            'For pages that use our rights data. The badge links to the rights-by-country page.',
          )}
        </p>
        <img src={BADGE_PATH} alt="LGBTQ+ data from queer.guide" width={200} height={56} />
        <CopyableSnippet
          {...copyStrings}
          label={t('press.linkToUs.badgeSnippet', 'Badge HTML')}
          text={BADGE_SNIPPET}
        />
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-title font-bold">
          {t('press.linkToUs.listingTitle', 'If your organization is listed')}
        </h3>
        <p className="max-w-prose">
          {t(
            'press.linkToUs.listingBody',
            'Replace YOUR-LISTING with the last part of your listing’s address on Queer Guide.',
          )}
        </p>
        <CopyableSnippet
          {...copyStrings}
          label={t('press.linkToUs.listingSnippet', 'Listing link HTML')}
          text={LISTING_SNIPPET}
        />
      </div>

      <p className="max-w-prose text-13 text-muted-foreground">
        {t(
          'press.linkToUs.attribution',
          'When you use our rights data, credit Queer Guide and the ILGA World Database, which maintains the underlying legal record.',
        )}
      </p>
    </section>
  );
}
