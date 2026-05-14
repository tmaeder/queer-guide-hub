import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  password: string;
  email?: string;
  onScoreChange?: (score: 0 | 1 | 2 | 3 | 4) => void;
}

const COLORS = ['#dc2626', '#ea580c', '#d97706', '#65a30d', '#16a34a'];

/**
 * Entropy-based password strength meter using zxcvbn-ts.
 * Lazy-loads the dictionary to avoid bloating the initial bundle.
 */
export function PasswordStrengthMeter({ password, email, onScoreChange }: Props) {
  const { t } = useTranslation();
  const [score, setScore] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [feedback, setFeedback] = useState<string>('');
  const onScoreChangeRef = useRef(onScoreChange);
  onScoreChangeRef.current = onScoreChange;

  useEffect(() => {
    if (!password) {
      setScore(0);
      setFeedback('');
      onScoreChangeRef.current?.(0);
      return;
    }

    let cancelled = false;

    (async () => {
      const [{ zxcvbn, zxcvbnOptions }, common, en] = await Promise.all([
        import('@zxcvbn-ts/core'),
        import('@zxcvbn-ts/language-common'),
        import('@zxcvbn-ts/language-en'),
      ]);

      zxcvbnOptions.setOptions({
        translations: en.translations,
        graphs: common.adjacencyGraphs,
        dictionary: { ...common.dictionary, ...en.dictionary },
      });

      const result = zxcvbn(password, email ? [email, email.split('@')[0]] : []);
      if (cancelled) return;
      const s = result.score as 0 | 1 | 2 | 3 | 4;
      setScore(s);
      setFeedback(result.feedback.warning || result.feedback.suggestions[0] || '');
      onScoreChangeRef.current?.(s);
    })();

    return () => {
      cancelled = true;
    };
  }, [password, email]);

  const labels = useMemo(
    () => [
      t('auth.passwordStrength.veryWeak', 'Very weak'),
      t('auth.passwordStrength.weak', 'Weak'),
      t('auth.passwordStrength.fair', 'Fair'),
      t('auth.passwordStrength.good', 'Good'),
      t('auth.passwordStrength.strong', 'Strong'),
    ],
    [t]
  );

  return (
    <div aria-live="polite" className="flex flex-col gap-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex-1 transition-colors"
            style={{
              height: 4,
              backgroundColor: password && score >= i ? COLORS[score] : 'rgba(0,0,0,0.04)',
            }}
          />
        ))}
      </div>
      {password && (
        <span className="text-xs" style={{ color: COLORS[score] }}>
          {labels[score]}
          {feedback ? ` — ${feedback}` : ''}
        </span>
      )}
    </div>
  );
}
