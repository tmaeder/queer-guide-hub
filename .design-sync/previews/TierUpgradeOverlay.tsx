import { TierUpgradeOverlay } from 'queer-guide';
import { StaticStateAll } from './_static';

export const Open = () => (
  <>
    <StaticStateAll />
    {/* sparkle particles collapse to center under the static override — hide */}
    <style>{`[role="dialog"] > span { display: none }`}</style>
    <TierUpgradeOverlay
      open
      tierName="Trailblazer"
      tagline="You unlocked trip collaboration and offline guides."
      autoDismissMs={0}
      onDismiss={() => {}}
    />
  </>
);
