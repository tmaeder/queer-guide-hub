import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleChip } from '@/components/ui/ToggleChip';
import { USER_MODES } from '@/config/navigation';

/** What you're here for. Biases recommendations; Dating also unlocks dating surfaces. */
export function UserModePicker({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (mode: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle id="settings-user-mode">What you're here for</CardTitle>
        <p className="text-sm text-muted-foreground">
          Shapes what we suggest to you. Change it any time.
        </p>
      </CardHeader>
      <CardContent>
        <div role="group" aria-labelledby="settings-user-mode" className="flex flex-wrap gap-1.5">
          {USER_MODES.map(({ value: mode, icon: Icon, labelKey }) => (
            <ToggleChip
              key={mode}
              pressed={value === mode}
              onPressedChange={() => onChange(mode)}
              icon={<Icon size={16} aria-hidden />}
            >
              {t(labelKey)}
            </ToggleChip>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
