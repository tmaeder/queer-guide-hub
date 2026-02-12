import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { CookieSettingsButton } from '@/components/privacy/CookieSettingsButton';

export default function PrivacyPolicy() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>Privacy Policy</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Typography color="text.secondary">Last updated: {new Date().toLocaleDateString()}</Typography>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>1. Introduction</Typography>
          <Typography>The Queer Guide ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our service.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>2. Information We Collect</Typography>

          <Typography variant="h6" sx={{ fontWeight: 500, mb: 1 }}>Personal Information</Typography>
          <Typography>We may collect the following personal information:</Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>Email address</li>
            <li>Display name</li>
            <li>Profile information (bio, location, social links)</li>
            <li>Phone number (optional)</li>
            <li>Date of birth (optional)</li>
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 500, mb: 1, mt: 2 }}>Usage Information</Typography>
          <Typography>We automatically collect certain information about your device and how you interact with our service:</Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>IP address</li>
            <li>Browser type and version</li>
            <li>Operating system</li>
            <li>Pages visited and time spent</li>
            <li>Referral sources</li>
          </Box>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>3. How We Use Your Information</Typography>
          <Typography>We use collected information for:</Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>Providing and maintaining our service</li>
            <li>Creating and managing user accounts</li>
            <li>Personalizing user experience</li>
            <li>Communicating with users about updates and important information</li>
            <li>Improving our service and developing new features</li>
            <li>Ensuring platform safety and security</li>
            <li>Complying with legal obligations</li>
          </Box>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>4. Information Sharing and Disclosure</Typography>

          <Typography variant="h6" sx={{ fontWeight: 500, mb: 1 }}>Public Information</Typography>
          <Typography>Some information you provide may be publicly visible:</Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>Display name and profile picture</li>
            <li>Bio and location (if you choose to share)</li>
            <li>Posts and comments you make</li>
            <li>Venue and event listings you create</li>
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 500, mb: 1, mt: 2 }}>Private Information</Typography>
          <Typography>We do not sell, trade, or rent your personal information to third parties. We may share information in these circumstances:</Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>With your consent</li>
            <li>To comply with legal obligations</li>
            <li>To protect our rights and safety</li>
            <li>In connection with a business transfer</li>
          </Box>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>5. Data Security</Typography>
          <Typography>We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the internet is 100% secure.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>6. Data Retention</Typography>
          <Typography>We retain your personal information only as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required by law.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>7. Your Privacy Rights</Typography>
          <Typography>Depending on your location, you may have the following rights:</Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>Access to your personal information</li>
            <li>Correction of inaccurate information</li>
            <li>Deletion of your personal information</li>
            <li>Restriction of processing</li>
            <li>Data portability</li>
            <li>Objection to processing</li>
          </Box>
          <Typography sx={{ mt: 1 }}>To exercise these rights, please contact us through our Contact page.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>8. Cookies and Tracking</Typography>
          <Typography>We use cookies and similar tracking technologies to enhance your experience. You can control cookies through your browser settings. For more information, see our Cookie Policy.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>9. Third-Party Services</Typography>
          <Typography>Our service may contain links to third-party websites or integrate with third-party services. We are not responsible for the privacy practices of these third parties.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>10. Children's Privacy</Typography>
          <Typography>Our service is not intended for children under 13. We do not knowingly collect personal information from children under 13. If you become aware that a child has provided us with personal information, please contact us.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>11. International Users</Typography>
          <Typography>If you are accessing our service from outside the United States, please note that your information may be transferred to and stored in the United States, where our servers are located.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>12. Changes to Privacy Policy</Typography>
          <Typography>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.</Typography>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>13. Cookie Management</Typography>
          <Typography>You can manage your cookie preferences at any time using the button below:</Typography>
          <Box sx={{ mt: 2 }}>
            <CookieSettingsButton />
          </Box>
        </section>

        <section>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>14. Contact Us</Typography>
          <Typography>If you have any questions about this Privacy Policy, please contact us at privacy@queer.guide or through our Contact page.</Typography>
        </section>
      </Box>
    </Box>
  );
}
