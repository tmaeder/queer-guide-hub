import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Shield, Cookie, Copyright, ChevronDown, ChevronRight } from 'lucide-react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export default function LegalHub() {
  const navigate = useNavigate();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    terms: false,
    privacy: false,
    cookies: false,
    dmca: false,
  });
  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Typography variant="h3" sx={{ fontWeight: 700, mb: 2, color: 'text.primary' }}>
          Legal Hub
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: '1.125rem' }}>
          All legal information, policies, and terms in one place
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Last updated: {new Date().toLocaleDateString()}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Terms of Service */}
        <Card>
          <Collapsible open={openSections.terms} onOpenChange={() => toggleSection('terms')}>
            <CollapsibleTrigger asChild>
              <CardHeader
                sx={{
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                  transition: 'background-color 0.2s',
                }}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <FileText
                      style={{ width: 24, height: 24 }}
                      color="var(--mui-palette-primary-main)"
                    />
                    <Box sx={{ textAlign: 'left' }}>
                      <CardTitle>Terms of Service</CardTitle>
                      <CardDescription>Rules and guidelines for using our platform</CardDescription>
                    </Box>
                  </Box>
                  {openSections.terms ? (
                    <ChevronDown style={{ width: 20, height: 20 }} />
                  ) : (
                    <ChevronRight style={{ width: 20, height: 20 }} />
                  )}
                </Box>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      1. Acceptance of Terms
                    </Typography>
                    <Typography>
                      By accessing and using The Queer Guide ("the Service"), you accept and agree
                      to be bound by the terms and provision of this agreement.
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      2. Description of Service
                    </Typography>
                    <Typography>
                      The Queer Guide is a community platform that provides information about LGBTQ+
                      friendly venues, events, marketplace listings, and community discussions. We
                      aim to create a safe and inclusive space for the LGBTQ+ community and allies.
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      3. User Responsibilities
                    </Typography>
                    <Typography>Users are responsible for:</Typography>
                    <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
                      <li>Providing accurate and up-to-date information</li>
                      <li>Maintaining the confidentiality of their account credentials</li>
                      <li>Complying with all applicable laws and regulations</li>
                      <li>Respecting the rights and dignity of other users</li>
                      <li>Not posting discriminatory, hateful, or harmful content</li>
                    </Box>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      4. Content Guidelines
                    </Typography>
                    <Typography>All content posted on The Queer Guide must:</Typography>
                    <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
                      <li>Be respectful and inclusive</li>
                      <li>Not contain hate speech, discrimination, or harassment</li>
                      <li>Not violate any intellectual property rights</li>
                      <li>Be relevant to the LGBTQ+ community or allies</li>
                      <li>Not contain spam or commercial solicitation outside designated areas</li>
                    </Box>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      5. Account Termination
                    </Typography>
                    <Typography>
                      We reserve the right to terminate or suspend accounts at our sole discretion,
                      without prior notice, for conduct that we believe violates these Terms of
                      Service or is harmful to other users of the Service.
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      6. Disclaimer & Limitation of Liability
                    </Typography>
                    <Typography>
                      The Service is provided "as is" without any warranties. In no event shall The
                      Queer Guide be liable for any indirect, incidental, special, or consequential
                      damages resulting from the use or inability to use the Service.
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Privacy Policy */}
        <Card>
          <Collapsible open={openSections.privacy} onOpenChange={() => toggleSection('privacy')}>
            <CollapsibleTrigger asChild>
              <CardHeader
                sx={{
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                  transition: 'background-color 0.2s',
                }}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Shield
                      style={{ width: 24, height: 24 }}
                      color="var(--mui-palette-primary-main)"
                    />
                    <Box sx={{ textAlign: 'left' }}>
                      <CardTitle>Privacy Policy</CardTitle>
                      <CardDescription>How we collect, use, and protect your data</CardDescription>
                    </Box>
                  </Box>
                  {openSections.privacy ? (
                    <ChevronDown style={{ width: 20, height: 20 }} />
                  ) : (
                    <ChevronRight style={{ width: 20, height: 20 }} />
                  )}
                </Box>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Information We Collect
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box>
                        <Typography sx={{ fontWeight: 500 }}>Personal Information</Typography>
                        <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
                          <li>Email address</li>
                          <li>Display name</li>
                          <li>Profile information (bio, location, social links)</li>
                          <li>Phone number (optional)</li>
                        </Box>
                      </Box>
                      <Box>
                        <Typography sx={{ fontWeight: 500 }}>Usage Information</Typography>
                        <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
                          <li>IP address and browser information</li>
                          <li>Pages visited and time spent</li>
                          <li>Referral sources</li>
                        </Box>
                      </Box>
                    </Box>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      How We Use Your Information
                    </Typography>
                    <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
                      <li>Providing and maintaining our service</li>
                      <li>Creating and managing user accounts</li>
                      <li>Personalizing user experience</li>
                      <li>Communicating important updates</li>
                      <li>Ensuring platform safety and security</li>
                      <li>Complying with legal obligations</li>
                    </Box>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Your Privacy Rights
                    </Typography>
                    <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
                      <li>Access to your personal information</li>
                      <li>Correction of inaccurate information</li>
                      <li>Deletion of your personal information</li>
                      <li>Data portability</li>
                      <li>Objection to processing</li>
                    </Box>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Data Security
                    </Typography>
                    <Typography>
                      We implement appropriate technical and organizational security measures to
                      protect your personal information against unauthorized access, alteration,
                      disclosure, or destruction.
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Cookie Policy */}
        <Card>
          <Collapsible open={openSections.cookies} onOpenChange={() => toggleSection('cookies')}>
            <CollapsibleTrigger asChild>
              <CardHeader
                sx={{
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                  transition: 'background-color 0.2s',
                }}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Cookie
                      style={{ width: 24, height: 24 }}
                      color="var(--mui-palette-primary-main)"
                    />
                    <Box sx={{ textAlign: 'left' }}>
                      <CardTitle>Cookie Policy</CardTitle>
                      <CardDescription>
                        How we use cookies and tracking technologies
                      </CardDescription>
                    </Box>
                  </Box>
                  {openSections.cookies ? (
                    <ChevronDown style={{ width: 20, height: 20 }} />
                  ) : (
                    <ChevronRight style={{ width: 20, height: 20 }} />
                  )}
                </Box>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      What Are Cookies
                    </Typography>
                    <Typography>
                      Cookies are small text files stored on your device when you visit our website.
                      They help us provide you with a better experience by remembering your
                      preferences and analyzing usage.
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Types of Cookies We Use
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box>
                        <Typography sx={{ fontWeight: 500 }}>Essential Cookies</Typography>
                        <Typography>
                          Required for the website to function properly, including session
                          management, security, and authentication.
                        </Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontWeight: 500 }}>Functional Cookies</Typography>
                        <Typography>
                          Enable enhanced functionality like language preferences and theme
                          settings.
                        </Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontWeight: 500 }}>Analytics Cookies</Typography>
                        <Typography>
                          Help us understand how visitors interact with our website to improve
                          performance.
                        </Typography>
                      </Box>
                    </Box>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Managing Cookies
                    </Typography>
                    <Typography>You can control cookies through your browser settings:</Typography>
                    <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
                      <li>
                        <strong>Chrome:</strong> Settings &rarr; Privacy and security &rarr; Cookies
                      </li>
                      <li>
                        <strong>Firefox:</strong> Settings &rarr; Privacy & Security &rarr; Cookies
                      </li>
                      <li>
                        <strong>Safari:</strong> Preferences &rarr; Privacy &rarr; Cookies
                      </li>
                      <li>
                        <strong>Edge:</strong> Settings &rarr; Cookies and site permissions
                      </li>
                    </Box>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Impact of Disabling Cookies
                    </Typography>
                    <Typography>
                      Disabling cookies may affect your experience - you may need to log in
                      repeatedly and some features may not work properly.
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* DMCA Policy */}
        <Card>
          <Collapsible open={openSections.dmca} onOpenChange={() => toggleSection('dmca')}>
            <CollapsibleTrigger asChild>
              <CardHeader
                sx={{
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                  transition: 'background-color 0.2s',
                }}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Copyright
                      style={{ width: 24, height: 24 }}
                      color="var(--mui-palette-primary-main)"
                    />
                    <Box sx={{ textAlign: 'left' }}>
                      <CardTitle>DMCA Copyright Policy</CardTitle>
                      <CardDescription>
                        Copyright infringement reporting and procedures
                      </CardDescription>
                    </Box>
                  </Box>
                  {openSections.dmca ? (
                    <ChevronDown style={{ width: 20, height: 20 }} />
                  ) : (
                    <ChevronRight style={{ width: 20, height: 20 }} />
                  )}
                </Box>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Overview
                    </Typography>
                    <Typography>
                      The Queer Guide respects intellectual property rights and responds to clear
                      notices of alleged copyright infringement that comply with the Digital
                      Millennium Copyright Act (DMCA).
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Filing a DMCA Notice
                    </Typography>
                    <Typography>Your notice must include:</Typography>
                    <Box component="ul" sx={{ listStyleType: 'disc', pl: 3 }}>
                      <li>Physical or electronic signature of the copyright owner</li>
                      <li>Identification of the copyrighted work</li>
                      <li>Identification of the infringing material and its location</li>
                      <li>Your contact information</li>
                      <li>Good faith belief statement</li>
                      <li>Accuracy statement under penalty of perjury</li>
                    </Box>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Where to Send DMCA Notices
                    </Typography>
                    <Paper sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
                      <Typography>
                        <strong>DMCA Agent</strong>
                        <br />
                        The Queer Guide
                        <br />
                        Email: dmca@queer.guide
                        <br />
                        Subject: DMCA Takedown Notice
                      </Typography>
                    </Paper>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Counter-Notification
                    </Typography>
                    <Typography>
                      If you believe your content was removed in error, you may submit a
                      counter-notification with your signature, identification of removed material,
                      good faith belief statement, and consent to jurisdiction.
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Repeat Infringer Policy
                    </Typography>
                    <Typography>
                      We will disable accounts of repeat infringers and respond to valid notices
                      within 72 hours.
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      </Box>

      {/* Contact Section */}
      <Card sx={{ mt: 4 }}>
        <CardHeader>
          <CardTitle sx={{ textAlign: 'center' }}>Need Help?</CardTitle>
          <CardDescription sx={{ textAlign: 'center' }}>
            Contact us for any legal questions or concerns
          </CardDescription>
        </CardHeader>
        <CardContent sx={{ textAlign: 'center' }}>
          <Button variant="outline" sx={{ mt: 2 }} onClick={() => navigate('/contact')}>
            Contact Support
          </Button>
        </CardContent>
      </Card>
    </Container>
  );
}
