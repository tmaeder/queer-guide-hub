import { useTranslation } from 'react-i18next';
import { ToggleChip } from '@/components/ui/ToggleChip';
import { MEETUP_ACTIVITY_CHOICES } from '@/config/meetupActivities';
import type { TravelActivity } from '@/lib/travelMeet';

/** Direct activity choices using the same chips as Groups and other discovery pages. */
export function MeetupActivities({
  value,
  onChange,
}: {
  value: TravelActivity | '';
  onChange: (activity: TravelActivity | '') => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="m-0 min-w-0 space-y-4 border-0 p-0">
      <legend className="mb-4 text-sm font-semibold">
        {t('meetCompany.activity', 'What would you like to do?')}
      </legend>
      <div className="flex flex-wrap gap-2">
        {MEETUP_ACTIVITY_CHOICES.map(({ id, label, icon: Icon }) => (
          <ToggleChip
            key={id}
            pressed={value === id}
            onPressedChange={() => onChange(id)}
            icon={<Icon size={16} aria-hidden />}
          >
            {id ? t(`travelMeet.activities.${id}`, label) : t('travelMeet.anyActivity', label)}
          </ToggleChip>
        ))}
      </div>
    </fieldset>
  );
}
