import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { MEETUP_ACTIVITY_CHOICES } from '@/config/meetupActivities';
import type { TravelActivity } from '@/lib/travelMeet';

/** The existing button and accent variants, with no custom selection treatment. */
export function MeetupActivities({
  value,
  onChange,
}: {
  value: TravelActivity | '';
  onChange: (activity: TravelActivity | '') => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-4 text-lg font-semibold">
        {t('meetCompany.activity', 'What would you like to do?')}
      </legend>
      <div className="flex flex-wrap gap-2">
        {MEETUP_ACTIVITY_CHOICES.filter(({ id }) => id).map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={value === id ? 'accent' : 'outline'}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            <Icon aria-hidden />
            {t(`travelMeet.activities.${id}`, label)}
          </Button>
        ))}
        <Button
          type="button"
          variant={value === '' ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={value === ''}
          onClick={() => onChange('')}
        >
          {t('travelMeet.anyActivity', 'Open to anything')}
        </Button>
      </div>
    </fieldset>
  );
}
