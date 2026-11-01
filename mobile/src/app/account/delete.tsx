import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { Alert, Button, Card, Field, StateMessage, Text } from '@/components/ui';
import {
  authErrorKey,
  confirmationMatches,
  deleteAccount,
  deletionConfirmationTarget,
} from '@/features/auth/api';
import { useSession } from '@/features/auth/useSession';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const session = useSession();
  const qc = useQueryClient();
  const email = session?.user.email ?? null;
  const target = useQuery({
    queryKey: ['account', 'deletionTarget', session?.user.id],
    queryFn: () => deletionConfirmationTarget(email),
    enabled: !!session,
  });
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session === null) return <StateMessage kind="empty" message={t('account.signedOut')} />;
  if (session === undefined || target.isPending)
    return <StateMessage kind="loading" message={t('account.loading')} />;
  if (target.isError || !target.data)
    return (
      <StateMessage
        kind="error"
        message={t('account.loadError')}
        action={{ label: t('explore.retry'), onPress: () => void target.refetch() }}
      />
    );

  const expected = target.data;
  const ready = confirmationMatches(typed, expected);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(typed.trim());
      // Nothing cached from the deleted account may outlive it on screen.
      qc.clear();
      router.dismissAll();
      router.replace('/');
    } catch (e) {
      const key = authErrorKey(e);
      setError(key === 'unknown' ? t('account.deleteFailed') : t(`auth.errors.${key}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('account.deleteTitle') }} />
      <Card>
        <Text variant="title">{t('account.deleteTitle')}</Text>
        <Text>{t('account.deleteBody')}</Text>
        <Text>{t('account.deleteLocal')}</Text>
      </Card>
      <Field
        label={t('account.typeToConfirm', { value: expected })}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error ? (
        <Alert message={error} />
      ) : null}
      <Button
        tone="destructive"
        label={t('account.deleteConfirm')}
        disabled={!ready}
        busy={busy}
        onPress={() => void confirm()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space[4], gap: space[4] },
});
