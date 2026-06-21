/**
 * BookCTA — the one reusable affiliate call-to-action.
 *
 * Wraps: the first-party /go redirect (sub-id attribution + click logging),
 * a compact FTC affiliate disclosure, a viewport-impression beacon, and the
 * load-bearing safety gate. Every Phase-2/3 placement renders this — never a
 * raw affiliate <a>.
 *
 * Posture is balanced: a restrained outline button, never a loud accent CTA.
 * In criminalizing / death-penalty destinations the booking button is
 * suppressed in favour of a muted safety note (no cheerful "Book now").
 */

import { useEffect, useRef } from 'react';
import { ExternalLink, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AffiliateDisclosure } from '@/components/marketplace/AffiliateDisclosure';
import { goHref, beaconImpression, AFFILIATE_REL, type GoLinkParams } from '@/lib/affiliate/links';
import { cn } from '@/lib/utils';

export interface BookCTASafety {
  countryName?: string | null;
  criminalized?: boolean;
  deathPenalty?: boolean;
}

interface BookCTAProps {
  link: GoLinkParams;
  label: string;
  /** Compact affiliate disclosure under the CTA. Default true. */
  disclose?: boolean;
  /** Country legal context — drives the safety gate. */
  safety?: BookCTASafety;
  className?: string;
}

export function BookCTA({ link, label, disclose = true, safety, className }: BookCTAProps) {
  const ref = useRef<HTMLDivElement>(null);
  const href = goHref(link);

  // Fire a single viewport impression for CTR.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let fired = false;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !fired) {
            fired = true;
            beaconImpression(link);
            io.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
    // link identity is stable per render site; re-running on prop change is fine.
  }, [link]);

  // Safety gate — high-risk destinations get a caution, not a CTA.
  if (safety?.deathPenalty || safety?.criminalized) {
    return (
      <div ref={ref} className={cn('text-13 leading-relaxed', className)}>
        <p className="flex items-start gap-2 text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0 mt-0.5" aria-hidden />
          <span>
            Same-sex activity is {safety.deathPenalty ? 'punishable by death' : 'criminalized'}
            {safety.countryName ? ` in ${safety.countryName}` : ''}. Review the safety briefing before
            planning travel.
          </span>
        </p>
        {/* Death-penalty: no booking link at all. Criminalizing: a quiet, de-emphasised exit only. */}
        {!safety.deathPenalty && (
          <a
            href={href}
            target="_blank"
            rel={AFFILIATE_REL}
            className="no-underline mt-2 inline-flex items-center gap-1 text-muted-foreground/80 hover:text-foreground"
          >
            {label}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className={className}>
      <Button asChild variant="outline" className="gap-2">
        <a href={href} target="_blank" rel={AFFILIATE_REL}>
          {label}
          <ExternalLink className="size-4" aria-hidden />
        </a>
      </Button>
      {disclose && (
        <div className="mt-2">
          <AffiliateDisclosure compact />
        </div>
      )}
    </div>
  );
}
