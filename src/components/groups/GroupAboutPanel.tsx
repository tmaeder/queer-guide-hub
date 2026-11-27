import { useTranslation } from 'react-i18next';

interface GroupAboutPanelProps {
  isPrivate: boolean;
  rules: string | null | undefined;
  lastActivityAt?: string | null;
  createdAt: string;
  /** Organisers we could read; null when the visitor cannot see members. */
  organisers: { name: string; role: string }[] | null;
}

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * What a visitor needs before joining: who runs the group, whether it is
 * active, what joining makes visible, and the rules. The visibility lines
 * restate the database policies (group_memberships / group_posts RLS):
 * a public group's member list is readable by anyone; a private group's only
 * by its organisers; posts by members only.
 */
export function GroupAboutPanel({
  isPrivate,
  rules,
  lastActivityAt,
  createdAt,
  organisers,
}: GroupAboutPanelProps) {
  const { t } = useTranslation();
  const activity = lastActivityAt || createdAt;

  return (
    <section
      aria-labelledby="group-about"
      className="grid max-w-reading gap-4 rounded-container bg-muted/55 p-4 sm:p-6"
    >
      <h2 id="group-about" className="font-sans text-title font-bold">
        {t('pages.groupDetail.about.title', 'Before you join')}
      </h2>
      <dl className="grid gap-2 text-sm">
        {organisers && (
          <div>
            <dt className="font-bold">{t('pages.groupDetail.about.organisers', 'Organisers')}</dt>
            <dd className="text-muted-foreground">
              {organisers.length > 0
                ? organisers.map((o) => o.name).join(', ')
                : t('pages.groupDetail.about.noOrganisers', 'No organisers are listed.')}
            </dd>
          </div>
        )}
        <div>
          <dt className="font-bold">{t('pages.groupDetail.about.activity', 'Last activity')}</dt>
          <dd className="text-muted-foreground">
            <time dateTime={activity}>{longDate(activity)}</time>
          </dd>
        </div>
        <div>
          <dt className="font-bold">
            {t('pages.groupDetail.about.visibility', 'What joining shows')}
          </dt>
          <dd className="text-muted-foreground">
            {isPrivate
              ? t(
                  'pages.groupDetail.about.privateVisibility',
                  'Only the organisers can see who is a member. Posts, meetups and chat are for members.',
                )
              : t(
                  'pages.groupDetail.about.publicVisibility',
                  'Anyone can see that you are a member. Posts and chat are for members.',
                )}
          </dd>
        </div>
      </dl>
      <div>
        <h3 className="text-sm font-bold">{t('pages.groupDetail.about.rules', 'Group rules')}</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
          {rules?.trim() ||
            t('pages.groupDetail.about.noRules', 'This group has not set any rules.')}
        </p>
      </div>
    </section>
  );
}
