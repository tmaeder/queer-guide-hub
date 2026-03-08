import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { CookieSettingsButton } from '@/components/privacy/CookieSettingsButton';
import { LegalPageLayout } from '@/components/ui/LegalPageLayout';

const sections = [
  { id: 'what-are-cookies', title: 'What Are Cookies' },
  { id: 'how-we-use', title: 'How We Use Cookies' },
  { id: 'types', title: 'Types of Cookies We Use' },
  { id: 'third-party', title: 'Third-Party Cookies' },
  { id: 'duration', title: 'Cookie Duration' },
  { id: 'managing', title: 'Managing Cookies' },
  { id: 'disabling-impact', title: 'Impact of Disabling Cookies' },
  { id: 'local-storage', title: 'Local Storage' },
  { id: 'updates', title: 'Updates to Cookie Policy' },
  { id: 'preferences', title: 'Manage Your Cookie Preferences' },
  { id: 'contact', title: 'Contact Us' },
];

export default function CookiePolicy() {
  return (
    <LegalPageLayout
      title="Cookie Policy"
      lastUpdated={new Date().toLocaleDateString()}
      sections={sections}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <section id="what-are-cookies">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            1. What Are Cookies
          </Typography>
          <Typography>
            Cookies are small text files that are stored on your device when you visit our website.
            They help us provide you with a better experience by remembering your preferences and
            analyzing how you use our service.
          </Typography>
        </section>

        <section id="how-we-use">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            2. How We Use Cookies
          </Typography>
          <Typography>We use cookies for several purposes:</Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>
              <strong>Essential Cookies:</strong> Required for the website to function properly
            </li>
            <li>
              <strong>Authentication Cookies:</strong> To keep you logged in
            </li>
            <li>
              <strong>Preference Cookies:</strong> To remember your settings and preferences
            </li>
            <li>
              <strong>Analytics Cookies:</strong> To understand how visitors use our website
            </li>
            <li>
              <strong>Performance Cookies:</strong> To improve website speed and functionality
            </li>
          </Box>
        </section>

        <section id="types">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            3. Types of Cookies We Use
          </Typography>

          <Typography variant="h6" sx={{ fontWeight: 500, mb: 1 }}>
            Essential Cookies
          </Typography>
          <Typography>
            These cookies are necessary for the website to function and cannot be switched off. They
            include:
          </Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>Session management cookies</li>
            <li>Security cookies</li>
            <li>Authentication tokens</li>
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 500, mb: 1, mt: 2 }}>
            Functional Cookies
          </Typography>
          <Typography>These cookies enable enhanced functionality and personalization:</Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>Language preferences</li>
            <li>Theme settings (dark/light mode)</li>
            <li>User interface preferences</li>
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 500, mb: 1, mt: 2 }}>
            Analytics Cookies
          </Typography>
          <Typography>
            We use analytics cookies to understand how visitors interact with our website:
          </Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>Page views and navigation patterns</li>
            <li>Time spent on pages</li>
            <li>Popular content and features</li>
            <li>Error tracking and performance metrics</li>
          </Box>
        </section>

        <section id="third-party">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            4. Third-Party Cookies
          </Typography>
          <Typography>Some cookies are set by third-party services we use:</Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>
              <strong>Supabase:</strong> For authentication and database services
            </li>
            <li>
              <strong>Analytics providers:</strong> To measure website performance
            </li>
            <li>
              <strong>Content delivery networks:</strong> To improve loading speeds
            </li>
          </Box>
        </section>

        <section id="duration">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            5. Cookie Duration
          </Typography>
          <Typography>Cookies may be:</Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>
              <strong>Session cookies:</strong> Deleted when you close your browser
            </li>
            <li>
              <strong>Persistent cookies:</strong> Remain on your device for a set period or until
              manually deleted
            </li>
          </Box>
        </section>

        <section id="managing">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            6. Managing Cookies
          </Typography>

          <Typography variant="h6" sx={{ fontWeight: 500, mb: 1 }}>
            Browser Settings
          </Typography>
          <Typography>You can control cookies through your browser settings:</Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>Block all cookies</li>
            <li>Block third-party cookies only</li>
            <li>Delete existing cookies</li>
            <li>Receive notifications when cookies are set</li>
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 500, mb: 1, mt: 2 }}>
            Browser-Specific Instructions
          </Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>
              <strong>Chrome:</strong> Settings &rarr; Privacy and security &rarr; Cookies and other
              site data
            </li>
            <li>
              <strong>Firefox:</strong> Settings &rarr; Privacy & Security &rarr; Cookies and Site
              Data
            </li>
            <li>
              <strong>Safari:</strong> Preferences &rarr; Privacy &rarr; Cookies and website data
            </li>
            <li>
              <strong>Edge:</strong> Settings &rarr; Cookies and site permissions &rarr; Cookies and
              site data
            </li>
          </Box>
        </section>

        <section id="disabling-impact">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            7. Impact of Disabling Cookies
          </Typography>
          <Typography>Disabling cookies may affect your experience:</Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>You may need to log in repeatedly</li>
            <li>Personal preferences may not be saved</li>
            <li>Some features may not work properly</li>
            <li>Content may not be personalized</li>
          </Box>
        </section>

        <section id="local-storage">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            8. Local Storage
          </Typography>
          <Typography>In addition to cookies, we may use local storage technologies to:</Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>Store user preferences</li>
            <li>Cache data for better performance</li>
            <li>Maintain session state</li>
          </Box>
        </section>

        <section id="updates">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            9. Updates to Cookie Policy
          </Typography>
          <Typography>
            We may update this Cookie Policy to reflect changes in our practices or for other
            operational, legal, or regulatory reasons. Please review this policy periodically.
          </Typography>
        </section>

        <section id="preferences">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            10. Manage Your Cookie Preferences
          </Typography>
          <Typography>
            You can customize your cookie settings at any time using the button below. This will
            allow you to enable or disable different types of cookies according to your preferences.
          </Typography>
          <Box sx={{ mt: 2 }}>
            <CookieSettingsButton />
          </Box>
        </section>

        <section id="contact">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            11. Contact Us
          </Typography>
          <Typography>
            If you have questions about our use of cookies, please contact us at{' '}
            <a
              href="mailto:privacy@queer.guide"
              style={{ color: 'inherit', textDecoration: 'underline' }}
            >
              privacy@queer.guide
            </a>{' '}
            or through our Contact page.
          </Typography>
        </section>
      </Box>
    </LegalPageLayout>
  );
}
