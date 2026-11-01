import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Card, Text } from '@/components/ui';
import { space } from '@/theme/tokens';
import { signOut } from './api';
import { useSession } from './useSession';

export function AccountSection() {
  const { t } = useTranslation();
  const session = useSession();
  const [busy, setBusy] = useState(false);

  if (session === undefined) return null;

  if (!session) {
    return (
      <Card>
        <Text variant="title" accessibilityRole="header">
          {t('account.title')}
        </Text>
        <Text>{t('account.signedOutBody')}</Text>
        <Button label={t('account.signInOrUp')} onPress={() => router.push('/auth')} />
      </Card>
    );
  }

  return (
    <Card>
      <Text variant="title" accessibilityRole="header">
        {t('account.title')}
      </Text>
      <Text>{t('account.signedInAs', { email: session.user.email ?? '' })}</Text>
      <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
        <Button
          tone="secondary"
          label={t('account.signOut')}
          busy={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await signOut();
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button tone="secondary" label={t('account.delete')} onPress={() => router.push('/account/delete')} />
      </View>
    </Card>
  );
}
