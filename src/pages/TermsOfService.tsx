import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function TermsOfService() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>Terms of Service</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Typography color="text.secondary">Last updated: {new Date().toLocaleDateString()}</Typography>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>1. Acceptance of Terms</Typography>
          <Typography>By accessing and using The Queer Guide ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>2. Description of Service</Typography>
          <Typography>The Queer Guide is a community platform that provides information about LGBTQ+ friendly venues, events, marketplace listings, and community discussions. We aim to create a safe and inclusive space for the LGBTQ+ community and allies.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>3. User Responsibilities</Typography>
          <Typography>Users are responsible for:</Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>Providing accurate and up-to-date information</li>
            <li>Maintaining the confidentiality of their account credentials</li>
            <li>Complying with all applicable laws and regulations</li>
            <li>Respecting the rights and dignity of other users</li>
            <li>Not posting discriminatory, hateful, or harmful content</li>
          </Box>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>4. Content Guidelines</Typography>
          <Typography>All content posted on The Queer Guide must:</Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>Be respectful and inclusive</li>
            <li>Not contain hate speech, discrimination, or harassment</li>
            <li>Not violate any intellectual property rights</li>
            <li>Be relevant to the LGBTQ+ community or allies</li>
            <li>Not contain spam or commercial solicitation outside designated areas</li>
          </Box>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>5. Privacy and Data Protection</Typography>
          <Typography>We are committed to protecting your privacy. Please review our Privacy Policy to understand how we collect, use, and protect your information.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>6. Intellectual Property</Typography>
          <Typography>The Service and its original content, features, and functionality are owned by The Queer Guide and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>7. Prohibited Activities</Typography>
          <Typography>Users may not:</Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>Use the service for any unlawful purpose</li>
            <li>Attempt to gain unauthorized access to other accounts</li>
            <li>Upload malicious software or code</li>
            <li>Impersonate others or provide false information</li>
            <li>Engage in harassment or bullying</li>
          </Box>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>8. Account Termination</Typography>
          <Typography>We reserve the right to terminate or suspend accounts at our sole discretion, without prior notice, for conduct that we believe violates these Terms of Service or is harmful to other users of the Service.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>9. Disclaimer of Warranties</Typography>
          <Typography>The Service is provided "as is" without any warranties, expressed or implied. We do not warrant that the Service will be uninterrupted or error-free.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>10. Limitation of Liability</Typography>
          <Typography>In no event shall The Queer Guide be liable for any indirect, incidental, special, or consequential damages resulting from the use or inability to use the Service.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>11. Changes to Terms</Typography>
          <Typography>We reserve the right to modify these terms at any time. Users will be notified of significant changes, and continued use of the Service constitutes acceptance of the modified terms.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>12. Contact Information</Typography>
          <Typography>If you have any questions about these Terms of Service, please contact us through our Contact page or email us at legal@queer.guide</Typography>
        </section>
      </Box>
    </Box>
  );
}
