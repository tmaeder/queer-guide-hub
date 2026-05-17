import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp } from 'lucide-react';

const SHOW_AFTER_PX = 600;

export function BackToTopButton() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    handler();
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label={t('search.backToTop', 'Back to top')}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 40,
        width: 40,
        height: 40,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'hsl(var(--foreground))',
        color: 'hsl(var(--background))',
        border: 0,
        cursor: 'pointer',
      }}
    >
      <ArrowUp style={{ width: 18, height: 18 }} />
    </button>
  );
}
