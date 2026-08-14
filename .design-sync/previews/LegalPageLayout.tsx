import { LegalPageLayout } from 'queer-guide';

// A policy is a subway line and each <h2> is a station. `slug` picks the line
// (Privacy = P, green); `depth: 2` renders a sub-station on the rail.
const sections = [
  { id: 'data-we-collect', title: 'Data we collect', depth: 1 as const },
  { id: 'sensitive-fields', title: 'Sensitive fields', depth: 2 as const },
  { id: 'how-we-use-it', title: 'How we use it', depth: 1 as const },
  { id: 'safety-by-design', title: 'Safety by design', depth: 1 as const },
  { id: 'your-rights', title: 'Your rights', depth: 1 as const },
];

const Section = ({ id, title, children }: { id: string; title: string; children: string }) => (
  <section id={id} className="mb-8">
    <h2 className="mb-2 font-display text-headline leading-tight">{title}</h2>
    <p className="text-body-lg text-muted-foreground">{children}</p>
  </section>
);

const SubSection = ({ id, title, children }: { id: string; title: string; children: string }) => (
  <section id={id} className="mb-8">
    <h3 className="mb-2 text-title font-bold">{title}</h3>
    <p className="text-body-lg text-muted-foreground">{children}</p>
  </section>
);

export const PrivacyPolicyPage = () => (
  <LegalPageLayout
    title="Privacy Policy"
    subtitle="How Queer Guide handles your data — written for humans, not lawyers."
    lastUpdated="26 July 2026"
    sections={sections}
    slug="privacy"
  >
    <Section id="data-we-collect" title="Data we collect">
      We store your account email, saved places, and trip plans. We never collect or infer
      sexual orientation or gender identity — your saved content stays yours.
    </Section>
    <SubSection id="sensitive-fields" title="Sensitive fields">
      Anything you add to an identity or dating profile is optional, processed only with
      your explicit consent, and visible to exactly whom you choose.
    </SubSection>
    <Section id="how-we-use-it" title="How we use it">
      Trip plans power your safety briefings and offline access. Aggregated, anonymized
      counts help us spot cities with thin coverage. We do not sell data, ever.
    </Section>
    <Section id="safety-by-design" title="Safety by design">
      Discreet mode strips identifying labels from notifications and lock-screen previews.
      Travel documents are encrypted at rest and removable in one tap.
    </Section>
    <Section id="your-rights" title="Your rights">
      Export or delete everything from account settings. Deletion is immediate for content
      and completes within 30 days for backups.
    </Section>
  </LegalPageLayout>
);
