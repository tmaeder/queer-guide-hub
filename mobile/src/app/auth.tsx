import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Button, Field, Text } from '@/components/ui';
import {
  authErrorKey,
  MIN_PASSWORD_LEN,
  signIn,
  signUp,
  validateCredentials,
  WEB_ORIGIN,
} from '@/features/auth/api';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

type Mode = 'signIn' | 'signUp';

export default function AuthScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<'email' | 'password' | null>(null);

  async function submit() {
    setError(null);
    const invalid = validateCredentials(email, password);
    setFieldError(invalid);
    if (invalid) return;
    if (mode === 'signUp' && !consent) {
      setError(t('auth.consentRequired'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signIn') await signIn(email, password);
      else await signUp(email, password);
      router.back();
    } catch (e) {
      setError(t(`auth.errors.${authErrorKey(e)}`));
    } finally {
      setBusy(false);
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setFieldError(null);
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: mode === 'signIn' ? t('auth.signIn') : t('auth.signUp') }} />

      <View style={styles.tabs} accessibilityRole="tablist">
        {(['signIn', 'signUp'] as const).map((m) => (
          <Pressable
            key={m}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === m }}
            onPress={() => switchMode(m)}
            style={[styles.tab, { borderBottomColor: mode === m ? colors.foreground : 'transparent' }]}
          >
            <Text style={{ fontWeight: mode === m ? '700' : '400' }}>{t(`auth.${m}`)}</Text>
          </Pressable>
        ))}
      </View>

      <Field
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType={mode === 'signUp' ? 'username' : 'emailAddress'}
        error={fieldError === 'email' ? t('auth.emailInvalid') : null}
      />
      <Field
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
        textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
        error={fieldError === 'password' ? t('auth.passwordTooShort', { n: MIN_PASSWORD_LEN }) : null}
      />

      {mode === 'signUp' ? (
        <View style={styles.consent}>
          <Switch
            value={consent}
            onValueChange={setConsent}
            accessibilityLabel={t('auth.consentLabel')}
          />
          <View style={{ flex: 1, gap: space[1] }}>
            <Text>{t('auth.consentLabel')}</Text>
            <View style={styles.links}>
              <LinkText label={t('auth.terms')} url={`${WEB_ORIGIN}/terms`} />
              <LinkText label={t('auth.privacy')} url={`${WEB_ORIGIN}/privacy`} />
            </View>
          </View>
        </View>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ color: colors.destructive }}>
          {error}
        </Text>
      ) : null}

      <Button
        label={mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
        busy={busy}
        onPress={() => void submit()}
      />

      {mode === 'signIn' ? (
        <LinkText label={t('auth.forgot')} url={`${WEB_ORIGIN}/auth?reset=1`} />
      ) : null}
    </ScrollView>
  );
}

function LinkText({ label, url }: { label: string; url: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(url)} hitSlop={8}>
      <Text variant="small" style={{ textDecorationLine: 'underline' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: space[4], gap: space[4] },
  tabs: { flexDirection: 'row', gap: space[4] },
  tab: { paddingVertical: space[2], borderBottomWidth: 2, minHeight: 44, justifyContent: 'center' },
  consent: { flexDirection: 'row', gap: space[2], alignItems: 'flex-start' },
  links: { flexDirection: 'row', gap: space[4] },
});
