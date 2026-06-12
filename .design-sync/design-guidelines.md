# Queer Guide design system — usage guidelines

LGBTQ+ travel & community platform. Audience: LGBTQ+ travelers, locals, activists, researchers, allies. Safety-first, inclusive by default, content is the hero.

## Color — strictly monochrome

- Black `--foreground` (0 0% 4%), white `--background`, grayscale steps (`--muted`, `--accent`, `--border`). Use semantic Tailwind classes: `bg-background`, `text-foreground`, `bg-muted`, `text-muted-foreground`, `border-border`.
- **No chromatic color in public UI.** No brand magenta, no blues, no greens.
- **One exception:** `--destructive` (muted red) for hard-error semantics only — payment declined, pipeline failed, irreversible confirms.
- Black readability scrims over images are allowed (`from-black/15 to-black/65`); no other gradients.
- Full light + dark mode (`.dark` class on root).

## Typography — Inter only

- Single family: Inter (variable 100–900, self-hosted). `font-sans` everywhere.
- Editorial size tokens (always prefer over arbitrary sizes): `text-hero-xl` (88px), `text-hero` (64px), `text-display` (40px), `text-headline-lg` (32px), `text-headline` (28px), `text-title` (22px), `text-body-lg` (17px), `text-15`, `text-13`, `text-xs2` (11px), `text-2xs`, `text-3xs`.
- Uppercase metadata labels use `tracking-label` (+4%). Use the `Eyebrow` component for kicker labels.

## Shape — semantic 3-tier radius

- `rounded-container` (16px): cards, sheets, dialogs, hero blocks.
- `rounded-element` (8px): buttons, inputs, list rows, nested cards, image frames.
- `rounded-badge` (4px): tags, chips, status pills.
- `rounded-full` for avatars/dots only. Never raw `rounded-md`/`rounded-lg`/etc.

## Depth & motion

- **Shadows disabled.** Use `border` or `bg-muted` for depth.
- Motion is functional only: skeleton pulse, dialog/sheet transitions, accordion. No decorative animation. Crisis/safety pages are animation-free.

## Spacing — strict 8pt grid

- Even-step utilities only: `p-2, p-4, p-6, p-8 …`, same for `m-`, `gap-`, `space-*`. No odd steps (`p-3`, `gap-5`). `.5` increments allowed only for icon-level micro-offsets.

## Icons

- lucide-react only; icons inherit color from parent text.

## Copy voice

- Direct, factual. Never "discover / explore / unlock / curated / journey / amazing / tailored / personalized for you".
- Empty states: "No X yet." — use the `EmptyState` component, always with an icon.

## Component conventions

- Buttons: `variant="default"` (solid black) is the primary CTA; `outline`, `ghost`, `soft`, `link` for lower emphasis; `destructive` only for irreversible actions. `secondary`/`brand` are deprecated aliases of `default`.
- Cards: `Card` + `CardImage` (owns the image fallback) + `CardHeader`/`CardContent`/`CardFooter`.
- Status semantics: use `Badge` variants (monochrome).
- Inline links inside text are underlined (the only cue distinguishing them); standalone links (nav, buttons, cards) are not.
