import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldCheck, Map as MapIcon, Users, Luggage, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { useTripTemplates } from '@/hooks/useTripTemplates';

interface ValueBullet {
  icon: typeof ShieldCheck;
  titleKey: string;
  bodyKey: string;
}

const bullets: ValueBullet[] = [
  {
    icon: ShieldCheck,
    titleKey: 'trips.signedOut.bullets.safety.title',
    bodyKey: 'trips.signedOut.bullets.safety.body',
  },
  {
    icon: MapIcon,
    titleKey: 'trips.signedOut.bullets.itinerary.title',
    bodyKey: 'trips.signedOut.bullets.itinerary.body',
  },
  {
    icon: Users,
    titleKey: 'trips.signedOut.bullets.collaborate.title',
    bodyKey: 'trips.signedOut.bullets.collaborate.body',
  },
];

export function TripsSignedOutHero() {
  const { t } = useTranslation();
  const [authOpen, setAuthOpen] = useState(false);
  const brand = 'hsl(var(--brand))';
  const accent = '#F59E0B';
  const { data: templates, isLoading } = useTripTemplates();
  const previewTemplates = (templates ?? []).slice(0, 3);

  return (
    <div className="container mx-auto py-8 md:py-16 px-4">
      <div className="hero-gradient overflow-hidden px-6 md:px-12 py-10 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-10 md:gap-12 items-center">
          {/* Copy column */}
          <div>
            <Badge variant="outline">
              <span className="inline-flex items-center gap-1">
                <Luggage style={{ width: 12, height: 12 }} />
                {t('trips.signedOut.badge')}
              </span>
            </Badge>

            <h2 className="text-[2rem] sm:text-[2.5rem] md:text-[3rem] leading-[1.1] mb-4">
              {t('trips.signedOut.title')}
            </h2>

            <p className="mb-8 max-w-[480px] md:text-[1.0625rem] text-muted-foreground">
              {t('trips.signedOut.subtitle')}
            </p>

            <div className="flex flex-wrap gap-3 mb-8">
              <Button
                size="lg"
                variant="brand"
                onClick={() => setAuthOpen(true)}
                style={{ paddingLeft: 28, paddingRight: 28 }}
              >
                {t('trips.signedOut.primaryCta')}
                <ArrowRight style={{ width: 16, height: 16, marginLeft: 8 }} />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  setAuthOpen(true);
                }}
              >
                {t('trips.signedOut.secondaryCta')}
              </Button>
            </div>

            <ul className="list-none p-0 m-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {bullets.map(({ icon: Icon, titleKey, bodyKey }) => (
                <li key={titleKey} className="flex gap-3 items-start">
                  <div
                    className="flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center"
                    style={{ backgroundColor: `${brand}12` }}
                  >
                    <Icon style={{ width: 18, height: 18, color: brand }} />
                  </div>
                  <div className="min-w-0">
                    <h6 className="font-bold mb-0.5 text-sm">
                      {t(titleKey)}
                    </h6>
                    <span className="text-xs text-muted-foreground">
                      {t(bodyKey)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Preview column */}
          <div className="hidden md:grid grid-cols-1 gap-4 relative">
            {isLoading && previewTemplates.length === 0
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-40 rounded-none"
                    style={{
                      transform: `translateX(${i * 12}px) rotate(${(i - 1) * 0.8}deg)`,
                    }}
                  />
                ))
              : previewTemplates.map((template, i) => (
                  <Card
                    key={template.id}
                    style={{
                      overflow: 'hidden',
                      transform: `translateX(${i * 12}px) rotate(${(i - 1) * 0.8}deg)`,
                      transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                  >
                    <div
                      className="p-5 min-h-[96px] flex flex-col justify-between"
                      style={{
                        backgroundImage: template.coverImageUrl
                          ? `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.55)), url("${template.coverImageUrl}"), ${template.gradient}`
                          : template.gradient,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      <div>
                        <h6
                          className="font-bold leading-tight text-sm text-white"
                          style={{
                            textShadow: template.coverImageUrl
                              ? '0 1px 2px rgba(0,0,0,0.5)'
                              : 'none',
                          }}
                        >
                          {template.title}
                        </h6>
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.85)' }}>
                          {template.cities}
                        </span>
                      </div>
                      <div
                        className="inline-flex items-center gap-1 self-start text-white px-2 py-0.5 rounded text-[0.7rem] font-semibold"
                        style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                      >
                        <ShieldCheck style={{ width: 11, height: 11 }} />
                        {t('trips.signedOut.safeLabel')}
                      </div>
                    </div>
                    <CardContent>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span
                          className="inline-block rounded-full"
                          style={{
                            width: 6,
                            height: 6,
                            backgroundColor: accent,
                          }}
                        />
                        {t('trips.signedOut.daysLabel', { count: template.days })}
                      </span>
                    </CardContent>
                  </Card>
                ))}
          </div>
        </div>
      </div>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
}
