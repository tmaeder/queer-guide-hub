import { useSearchParams } from 'react-router';
import { peopleContextHref, readPeopleContext } from '@/lib/peopleContext';
import { NestedEntityCard } from '@/components/transit/NestedEntityCard';
import { useTranslation } from 'react-i18next';
import { useLocalGroups } from '@/hooks/useIntentData';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';

/** Public alternatives, clearly separated from member invitations and local results. */
export function MeetOpportunities() {
  const { t } = useTranslation();
  const groups = useLocalGroups(3);
  const [params] = useSearchParams();
  const context = readPeopleContext(params);
  return (
    <section className="space-y-4" aria-labelledby="meet-opportunities">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 id="meet-opportunities" className="text-xl font-semibold">
          {t('meetCompany.groups', 'Find an ongoing community')}
        </h2>
        <LocalizedLink
          to={peopleContextHref('/meet/groups', context)}
          className="text-sm underline underline-offset-4"
        >
          {t('meetCompany.allGroups', 'All groups')}
        </LocalizedLink>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('meetCompany.worldwide', 'Public interest groups · worldwide.')}
      </p>
      {groups.isLoading ? (
        <p role="status">{t('meetCompany.groupsLoading', 'Loading groups…')}</p>
      ) : groups.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-4">
          <p>{t('meetCompany.groupsError', 'Groups could not be loaded.')}</p>
          <Button variant="ghost" onClick={() => void groups.refetch()}>
            {t('travelMeet.retry', 'Try again')}
          </Button>
        </div>
      ) : groups.data?.length ? (
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {groups.data.map((group) => (
            <li key={group.id}>
              <NestedEntityCard
                type="group"
                name={group.name}
                description={group.description}
                href={peopleContextHref(`/meet/groups/${group.id}`, context)}
                className="h-full"
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('meetCompany.groupsEmpty', 'No public groups are listed yet.')}
        </p>
      )}
    </section>
  );
}
