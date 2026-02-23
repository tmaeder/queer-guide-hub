import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import { LegalPageLayout } from '@/components/ui/LegalPageLayout';

const sections = [
  { id: 'overview', title: 'Overview' },
  { id: 'filing-notice', title: 'Filing a DMCA Notice' },
  { id: 'where-to-send', title: 'Where to Send DMCA Notices' },
  { id: 'counter-notification', title: 'Counter-Notification Process' },
  { id: 'repeat-infringer', title: 'Repeat Infringer Policy' },
  { id: 'response-time', title: 'Response Time' },
  { id: 'false-claims', title: 'False Claims' },
  { id: 'user-responsibilities', title: 'User Responsibilities' },
  { id: 'fair-use', title: 'Fair Use Considerations' },
  { id: 'safe-harbor', title: 'Safe Harbor' },
  { id: 'international', title: 'International Considerations' },
  { id: 'contact', title: 'Contact for Questions' },
  { id: 'policy-updates', title: 'Policy Updates' },
];

export default function DMCA() {
  return (
    <LegalPageLayout
      title="DMCA Copyright Policy"
      lastUpdated={new Date().toLocaleDateString()}
      sections={sections}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box component="section" id="overview">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>1. Overview</Typography>
          <Typography>The Queer Guide respects the intellectual property rights of others and expects our users to do the same. It is our policy to respond to clear notices of alleged copyright infringement that comply with the Digital Millennium Copyright Act (DMCA).</Typography>
        </Box>

        <Box component="section" id="filing-notice">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>2. Filing a DMCA Notice</Typography>
          <Typography>If you believe that content on The Queer Guide infringes your copyright, you may submit a DMCA takedown notice. Your notice must include:</Typography>

          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>A physical or electronic signature of the copyright owner or authorized agent</li>
            <li>Identification of the copyrighted work claimed to have been infringed</li>
            <li>Identification of the material that is claimed to be infringing, including location information</li>
            <li>Your contact information (name, address, telephone number, and email address)</li>
            <li>A statement that you have a good faith belief that use of the material is not authorized</li>
            <li>A statement that the information in the notification is accurate, and under penalty of perjury, that you are authorized to act on behalf of the copyright owner</li>
          </Box>
        </Box>

        <Box component="section" id="where-to-send">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>3. Where to Send DMCA Notices</Typography>
          <Typography>DMCA notices should be sent to our designated agent:</Typography>

          <Paper sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
            <Typography><strong>DMCA Agent</strong><br />
            The Queer Guide<br />
            Email: <a href="mailto:dmca@queer.guide" style={{ color: 'inherit', textDecoration: 'underline' }}>dmca@queer.guide</a><br />
            Subject Line: DMCA Takedown Notice</Typography>
          </Paper>

          <Typography sx={{ mt: 2 }}>For fastest processing, please send notices via email. Include "DMCA Takedown Notice" in the subject line.</Typography>
        </Box>

        <Box component="section" id="counter-notification">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>4. Counter-Notification Process</Typography>
          <Typography>If you believe your content was removed in error, you may submit a counter-notification. Your counter-notice must include:</Typography>

          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>Your physical or electronic signature</li>
            <li>Identification of the material that was removed and its location before removal</li>
            <li>A statement under penalty of perjury that you have a good faith belief the material was removed by mistake or misidentification</li>
            <li>Your name, address, telephone number, and a statement consenting to the jurisdiction of federal court</li>
            <li>A statement that you will accept service of process from the complainant</li>
          </Box>
        </Box>

        <Box component="section" id="repeat-infringer">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>5. Repeat Infringer Policy</Typography>
          <Typography>The Queer Guide will, in appropriate circumstances, disable and/or terminate the accounts of users who are repeat infringers. We reserve the right to determine what constitutes a repeat infringer.</Typography>
        </Box>

        <Box component="section" id="response-time">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>6. Response Time</Typography>
          <Typography>We will review and respond to valid DMCA notices within 72 hours of receipt. If immediate action is required due to the nature of the infringement, we may act more quickly.</Typography>
        </Box>

        <Box component="section" id="false-claims">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>7. False Claims</Typography>
          <Typography>Please note that making false claims in a DMCA notice may result in liability for damages, including attorney fees. We reserve the right to seek damages from any party that submits a false or bad faith DMCA notice.</Typography>
        </Box>

        <Box component="section" id="user-responsibilities">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>8. User Responsibilities</Typography>
          <Typography>Users of The Queer Guide are responsible for ensuring they have the right to post any content they upload. This includes:</Typography>

          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>Images, photos, and graphics</li>
            <li>Text content and written materials</li>
            <li>Videos and audio content</li>
            <li>Logos and branding materials</li>
          </Box>
        </Box>

        <Box component="section" id="fair-use">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>9. Fair Use Considerations</Typography>
          <Typography>We recognize that some uses of copyrighted material may qualify as fair use under copyright law. However, fair use is determined on a case-by-case basis, and we encourage users to:</Typography>

          <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
            <li>Use only as much of the original work as necessary</li>
            <li>Credit the original creator when possible</li>
            <li>Consider the purpose and character of the use</li>
            <li>Respect the rights of copyright holders</li>
          </Box>
        </Box>

        <Box component="section" id="safe-harbor">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>10. Safe Harbor</Typography>
          <Typography>The Queer Guide qualifies for safe harbor protection under the DMCA as a service provider. We do not review all content before it is posted and rely on our community and copyright holders to identify infringing material.</Typography>
        </Box>

        <Box component="section" id="international">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>11. International Considerations</Typography>
          <Typography>While this policy is based on US copyright law (DMCA), we respect intellectual property rights globally and will respond to valid notices under other copyright frameworks when appropriate.</Typography>
        </Box>

        <Box component="section" id="contact">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>12. Contact for Questions</Typography>
          <Typography>If you have questions about this DMCA policy or need clarification about copyright issues on our platform, please contact us at <a href="mailto:legal@queer.guide" style={{ color: 'inherit', textDecoration: 'underline' }}>legal@queer.guide</a></Typography>
        </Box>

        <Box component="section" id="policy-updates">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>13. Policy Updates</Typography>
          <Typography>This DMCA policy may be updated from time to time. We will notify users of significant changes through our platform or via email to registered users.</Typography>
        </Box>
      </Box>
    </LegalPageLayout>
  );
}
