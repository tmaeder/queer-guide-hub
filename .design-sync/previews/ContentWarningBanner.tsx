import { ContentWarningBanner, SensitivityBadges } from 'queer-guide';

// src/index.css ships an UNLAYERED *{border-width:0} reset (leftover of the
// reverted MUI migration) that beats every @layer utilities border-width —
// re-assert utility widths so the banner frame / badge outlines render as
// designed. Root-cause fix tracked separately (see learnings/wave-overlays.md).
const BorderFix = () => (
  <style>{`.border{border-width:1px}.border-2{border-width:2px}.border-b{border-bottom-width:1px}.border-t{border-top-width:1px}.border-l{border-left-width:1px}.border-r{border-right-width:1px}`}</style>
);

export const FullBanner = () => (
  <div className="max-w-xl">
    <BorderFix />
    <ContentWarningBanner
      warnings={{
        legal: true,
        medical: true,
        warnings: [
          'Local laws restrict public LGBTQ+ events in this region; check current guidance before attending.',
        ],
      }}
    />
  </div>
);

export const CompactFlags = () => (
  <>
    <BorderFix />
    <ContentWarningBanner compact warnings={{ legal: true, nsfw: true }} />
  </>
);

export const AdminSensitivityBadges = () => (
  <>
    <BorderFix />
    <SensitivityBadges
      relevanceScore={0.92}
      sensitivityFlags={[
        { category: 'medical', severity: 'medium' },
        { category: 'nsfw', severity: 'high' },
      ]}
    />
  </>
);
