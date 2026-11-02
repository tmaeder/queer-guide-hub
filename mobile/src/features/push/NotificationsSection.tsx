import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Switch, View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { useSession } from '@/features/auth/useSession';
import { space } from '@/theme/tokens';
import { nativePush } from './native';
import { disablePush, enablePush, readRecord } from './push';

export function NotificationsSection() {
  const { t } = useTranslation();
  const session = useSession();
  const qc = useQueryClient();
  const record = useQuery({ queryKey: ['push', 'record'], queryFn: readRecord });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<'denied' | 'unavailable' | 'failed' | null>(null);

  if (!session) return null;
  const on = !!record.data && record.data.userId === session.user.id;

  async function toggle(next: boolean) {
    setBusy(true);
    setNote(null);
    try {
      if (next) {
        const r = await enablePush(session!.user.id, nativePush);
        if (r !== 'enabled') setNote(r);
      } else {
        await disablePush(nativePush);
      }
    } catch {
      setNote('failed');
    } finally {
      await qc.invalidateQueries({ queryKey: ['push', 'record'] });
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text variant="title" accessibilityRole="header">
        {t('push.title')}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Text style={{ flex: 1 }}>{t('push.toggle')}</Text>
        <Switch
          value={on}
          disabled={busy || record.isPending}
          onValueChange={(v) => void toggle(v)}
          accessibilityLabel={t('push.toggle')}
        />
      </View>
      <Text variant="small" muted>
        {t('push.body')}
      </Text>
      {note ? (
        <Text accessibilityRole="alert" onPress={note === 'denied' ? () => void Linking.openSettings() : undefined}>
          {t(`push.${note}`)}
        </Text>
      ) : null}
    </Card>
  );
}
