import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Download,
  Layers,
  PanelLeftOpen,
  Monitor,
  Plane,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  WifiOff,
  Zap,
} from '@/components/icons';
import { usePWA } from '@/components/pwa/PWAProvider';
import { useMeta } from '@/hooks/useMeta';

/**
 * What the installable web app is, how to add it on each platform, and what to
 * expect. Linked from the install card ("Learn more"). Claims stay factual: the
 * service worker gives an offline page and saved trips, not offline browsing,
 * so the page says what is NOT available offline.
 */
export default function AppInstall() {
  const { t } = useTranslation();
  const { canInstall, isInstalled, promptInstall } = usePWA();

  useMeta({
    title: t('appPage.metaTitle', 'Queer Guide as an app'),
    description: t(
      'appPage.metaDescription',
      'Add Queer Guide to your home screen. It opens full screen like an app, with no app store needed.',
    ),
    canonicalPath: '/app',
  });

  const platforms = [
    {
      icon: Smartphone,
      title: t('appPage.ios.title', 'iPhone and iPad'),
      steps: [
        t('appPage.ios.step1', 'Open queer.guide in Safari.'),
        t('appPage.ios.step2', 'Tap Share in the toolbar.'),
        t('appPage.ios.step3', 'Choose “Add to Home Screen”, then tap Add.'),
      ],
    },
    {
      icon: Smartphone,
      title: t('appPage.android.title', 'Android'),
      steps: [
        t('appPage.android.step1', 'Open queer.guide in Chrome.'),
        t('appPage.android.step2', 'Tap the ⋮ menu.'),
        t('appPage.android.step3', 'Choose “Install app” or “Add to Home screen”.'),
      ],
    },
    {
      icon: Monitor,
      title: t('appPage.desktop.title', 'Computer'),
      steps: [
        t('appPage.desktop.step1', 'Open queer.guide in Chrome or Edge.'),
        t('appPage.desktop.step2', 'Click the install icon at the right end of the address bar.'),
        t('appPage.desktop.step3', 'On a Mac with Safari, choose File → Add to Dock.'),
      ],
    },
  ];

  // Each advantage must be true of THIS app today. Push notifications are
  // deliberately absent: the production build ships no VAPID key, so the
  // subscribe path reports unsupported.
  const advantages = [
    {
      icon: Zap,
      title: t('appPage.why.tap.title', 'One tap away'),
      text: t(
        'appPage.why.tap.text',
        'An icon on your home screen or dock. No typing the address, no hunting through browser tabs.',
      ),
    },
    {
      icon: PanelLeftOpen,
      title: t('appPage.why.screen.title', 'More room on screen'),
      text: t(
        'appPage.why.screen.text',
        'It opens full screen without the browser bars, so maps, guides and news get the whole display.',
      ),
    },
    {
      icon: Layers,
      title: t('appPage.why.window.title', 'Its own window'),
      text: t(
        'appPage.why.window.text',
        'It shows up in your app switcher like any other app and does not get lost or closed with your tabs.',
      ),
    },
    {
      icon: Plane,
      title: t('appPage.why.offline.title', 'Trips without a connection'),
      text: t(
        'appPage.why.offline.text',
        'Save a trip for offline use and its day plan and reservations stay readable on a plane or abroad without data.',
      ),
    },
    {
      icon: RefreshCw,
      title: t('appPage.why.updates.title', 'Always up to date'),
      text: t(
        'appPage.why.updates.text',
        'It updates itself in the background. Nothing to download, no app store, no store account.',
      ),
    },
    {
      icon: ShieldCheck,
      title: t('appPage.why.light.title', 'Light and private'),
      text: t(
        'appPage.why.light.text',
        'It takes a fraction of the space of a store app and asks for no extra permissions. Your account is the same as on the website.',
      ),
    },
  ];

  const limits = [
    {
      icon: WifiOff,
      title: t('appPage.limits.offline.title', 'Most pages need the internet'),
      text: t(
        'appPage.limits.offline.text',
        'Offline you see a notice, plus any trips you saved for offline use.',
      ),
    },
    {
      icon: Trash2,
      title: t('appPage.limits.remove.title', 'Removing it'),
      text: t(
        'appPage.limits.remove.text',
        'Like any other app: on a phone, press and hold the icon and choose Remove. On a computer, open the app menu and choose Uninstall. Your account is not affected.',
      ),
    },
  ];

  return (
    <PageContainer className="space-y-12">
      <header className="max-w-reading space-y-4">
        <span
          aria-hidden
          className="grid size-14 place-items-center rounded-full bg-foreground text-background"
        >
          <Smartphone size={24} />
        </span>
        <h1 className="font-display text-display leading-none">
          {t('appPage.title', 'Queer Guide as an app')}
        </h1>
        <p className="text-body-lg leading-relaxed text-muted-foreground">
          {t(
            'appPage.intro',
            'Queer Guide is a web app. Add it to your home screen and it opens like any other app.',
          )}
        </p>
        {isInstalled ? (
          <p className="flex items-center gap-2 text-15 font-bold">
            <CheckCircle2 size={18} aria-hidden />
            {t('appPage.installed', 'You are using the app version.')}
          </p>
        ) : (
          canInstall && (
            <Button onClick={() => void promptInstall()} className="font-bold">
              <Download size={16} className="me-2" aria-hidden />
              {t('pwa.install.action')}
            </Button>
          )
        )}
      </header>

      <section aria-labelledby="app-why" className="space-y-4">
        <h2 id="app-why" className="text-headline font-bold">
          {t('appPage.whyTitle', 'Why add it')}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {advantages.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-container bg-card p-6 shadow-soft">
              <span aria-hidden className="grid size-10 place-items-center rounded-full bg-muted">
                <Icon size={18} />
              </span>
              <h3 className="mt-4 text-title font-bold">{title}</h3>
              <p className="mt-2 text-15 leading-relaxed text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="app-how" className="space-y-4">
        <h2 id="app-how" className="text-headline font-bold">
          {t('appPage.howTitle', 'How to add it')}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {platforms.map(({ icon: Icon, title, steps }) => (
            <div key={title} className="rounded-container bg-card p-6 shadow-soft">
              <h3 className="flex items-center gap-2 text-title font-bold">
                <Icon size={18} aria-hidden />
                {title}
              </h3>
              <ol className="mt-4 space-y-2">
                {steps.map((step, n) => (
                  <li key={step} className="flex gap-2 text-15 leading-relaxed">
                    <span
                      aria-hidden
                      className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs2 font-bold"
                    >
                      {n + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="app-limits" className="max-w-reading space-y-4">
        <h2 id="app-limits" className="text-headline font-bold">
          {t('appPage.limitsTitle', 'Good to know')}
        </h2>
        <ul className="space-y-4">
          {limits.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-4">
              <span
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-full bg-muted"
              >
                <Icon size={18} />
              </span>
              <span>
                <span className="block text-15 font-bold">{title}</span>
                <span className="mt-1 block text-15 leading-relaxed text-muted-foreground">
                  {text}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  );
}
