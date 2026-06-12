import { LegalPageLayout } from 'queer-guide';

const sections = [
  { id: 'data-we-collect', title: 'Data we collect' },
  { id: 'how-we-use-it', title: 'How we use it' },
  { id: 'safety-by-design', title: 'Safety by design' },
  { id: 'your-rights', title: 'Your rights' },
];

const Section = ({ id, title, children }: { id: string; title: string; children: string }) => (
  <section id={id} className="mb-8">
    <h2 className="mb-2 text-title font-semibold">{title}</h2>
    <p className="text-15 text-muted-foreground">{children}</p>
  </section>
);

export const PrivacyPolicyPage = () => (
  <LegalPageLayout
    title="Privacy Policy"
    subtitle="How Queer Guide handles your data — written for humans, not lawyers."
    lastUpdated="June 2026"
    sections={sections}
  >
    <Section id="data-we-collect" title="Data we collect">
      We store your account email, saved places, and trip plans. We never collect or infer
      sexual orientation or gender identity — your saved content stays yours.
    </Section>
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
