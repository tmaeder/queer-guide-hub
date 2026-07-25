export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-element border border-border p-4">
      <p className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-headline font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
