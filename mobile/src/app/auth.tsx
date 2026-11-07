import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Alert, Button, Field, Text } from '@/components/ui';
import {
  authErrorKey,
  exchangeRecoveryCode,
  MIN_PASSWORD_LEN,
  OTP_LEN,
  resetPassword,
  sendOtp,
  signIn,
  signUp,
  updatePassword,
  validateCredentials,
  validateEmail,
  verifyOtp,
  WEB_ORIGIN,
} from '@/features/auth/api';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

type Mode = 'signIn' | 'signUp';
/** code = email → 6-digit code (default); password = the old form; newPassword = after a reset link. */
type Method = 'code' | 'password' | 'newPassword';

export default function AuthScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ code?: string; reset?: string }>();
  const exchangedCode = useRef<string | undefined>(undefined);
  const [mode, setMode] = useState<Mode>('signIn');
  const [method, setMethod] = useState<Method>('code');
  const [codeSent, setCodeSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<'email' | 'password' | 'otp' | null>(null);

  // Only a recovery callback should open the password replacement form.
  useEffect(() => {
    const code = params.code;
    if (params.reset !== '1' || typeof code !== 'string' || !code || exchangedCode.current === code) return;
    exchangedCode.current = code;
    exchangeRecoveryCode(code)
      .then(() => setMethod('newPassword'))
      .catch((e) => setError(t(`auth.errors.${authErrorKey(e)}`)));
  }, [params.code, params.reset, t]);

  async function run(action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(t(`auth.errors.${authErrorKey(e)}`));
    } finally {
      setBusy(false);
    }
  }

  function needsConsent() {
    if (mode === 'signUp' && !consent) {
      setError(t('auth.consentRequired'));
      return true;
    }
    return false;
  }

  async function submit() {
    setError(null);
    if (method === 'newPassword') {
      const tooShort = password.length < MIN_PASSWORD_LEN;
      setFieldError(tooShort ? 'password' : null);
      if (tooShort) return;
      return run(async () => {
        await updatePassword(password);
        router.replace('/');
      });
    }
    if (method === 'password') {
      const invalid = validateCredentials(email, password);
      setFieldError(invalid);
      if (invalid || needsConsent()) return;
      return run(async () => {
        if (mode === 'signIn') await signIn(email, password);
        else await signUp(email, password);
        router.back();
      });
    }
    if (!codeSent) {
      const invalid = !validateEmail(email);
      setFieldError(invalid ? 'email' : null);
      if (invalid || needsConsent()) return;
      return run(async () => {
        await sendOtp(email, mode === 'signUp' ? new Date() : undefined);
        setCodeSent(true);
      });
    }
    const invalid = !new RegExp(`^\\d{${OTP_LEN}}$`).test(otp.trim());
    setFieldError(invalid ? 'otp' : null);
    if (invalid) return;
    return run(async () => {
      await verifyOtp(email, otp);
      router.back();
    });
  }

  async function forgot() {
    const invalid = !validateEmail(email);
    setFieldError(invalid ? 'email' : null);
    if (invalid) return;
    await run(async () => {
      await resetPassword(email);
      setNotice(t('auth.resetSent'));
    });
  }

  const reset = () => {
    setError(null);
    setNotice(null);
    setFieldError(null);
    setCodeSent(false);
    setOtp('');
  };
  const switchMode = (next: Mode) => {
    setMode(next);
    reset();
  };
  const switchMethod = (next: Method) => {
    setMethod(next);
    reset();
  };

  const submitLabel =
    method === 'newPassword'
      ? t('auth.setPassword')
      : method === 'code'
        ? codeSent
          ? t('auth.verifyCode')
          : t('auth.sendCode')
        : t(`auth.${mode}`);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{ title: method === 'newPassword' ? t('auth.setPassword') : t(`auth.${mode}`) }}
      />

      {method !== 'newPassword' ? (
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
      ) : null}

      {method !== 'newPassword' ? (
        <Field
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          editable={!codeSent}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType={mode === 'signUp' ? 'username' : 'emailAddress'}
          error={fieldError === 'email' ? t('auth.emailInvalid') : null}
        />
      ) : null}

      {method === 'code' && codeSent ? (
        <>
          <Text variant="small">{t('auth.codeSent', { email: email.trim() })}</Text>
          <Field
            label={t('auth.code')}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={OTP_LEN}
            autoFocus
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            error={fieldError === 'otp' ? t('auth.codeInvalid', { n: OTP_LEN }) : null}
          />
        </>
      ) : null}

      {method === 'password' || method === 'newPassword' ? (
        <Field
          label={method === 'newPassword' ? t('auth.newPassword') : t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={method === 'password' && mode === 'signIn' ? 'current-password' : 'new-password'}
          textContentType={method === 'password' && mode === 'signIn' ? 'password' : 'newPassword'}
          error={fieldError === 'password' ? t('auth.passwordTooShort', { n: MIN_PASSWORD_LEN }) : null}
        />
      ) : null}

      {mode === 'signUp' && method !== 'newPassword' && !codeSent ? (
        <View style={styles.consent}>
          <Switch value={consent} onValueChange={setConsent} accessibilityLabel={t('auth.consentLabel')} />
          <View style={{ flex: 1, gap: space[1] }}>
            <Text>{t('auth.consentLabel')}</Text>
            <View style={styles.links}>
              <LinkText label={t('auth.terms')} url={`${WEB_ORIGIN}/terms`} />
              <LinkText label={t('auth.privacy')} url={`${WEB_ORIGIN}/privacy`} />
            </View>
          </View>
        </View>
      ) : null}

      {error ? <Alert message={error} /> : null}
      {notice ? <Text accessibilityLiveRegion="polite">{notice}</Text> : null}

      <Button label={submitLabel} busy={busy} onPress={() => void submit()} />

      {method === 'code' && codeSent ? (
        <ActionText label={t('auth.changeEmail')} onPress={reset} />
      ) : null}
      {method === 'code' ? (
        <ActionText label={t('auth.usePassword')} onPress={() => switchMethod('password')} />
      ) : null}
      {method === 'password' ? (
        <ActionText label={t('auth.useCode')} onPress={() => switchMethod('code')} />
      ) : null}
      {method === 'password' && mode === 'signIn' ? (
        <ActionText label={t('auth.forgot')} onPress={() => void forgot()} />
      ) : null}
    </ScrollView>
  );
}

function ActionText({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text variant="small" style={{ textDecorationLine: 'underline' }}>
        {label}
      </Text>
    </Pressable>
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
