export function AffiliateDisclosure({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
        Some links are affiliate links. We may earn a commission at no extra cost to you.
      </p>
    );
  }
  return (
    <aside
      role="note"
      aria-label="Affiliate disclosure"
      className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground leading-relaxed"
    >
      <p className="font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1">
        Affiliate disclosure
      </p>
      <p>
        Some product links on this page are affiliate links. When you buy through them we may earn a
        commission at no extra cost to you. We only list products that pass our LGBTQ+ relevance
        review. Commissions help keep Queer Guide free and independent.
      </p>
    </aside>
  );
}
