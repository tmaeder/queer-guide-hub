import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Shield, Cookie, Copyright, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export default function LegalHub() {
  const navigate = useNavigate();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    terms: false,
    privacy: false,
    cookies: false,
    dmca: false
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4 gradient-text">Legal Hub</h1>
        <p className="text-muted-foreground text-lg">
          All legal information, policies, and terms in one place
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Last updated: {new Date().toLocaleDateString()}
        </p>
      </div>

      <div className="space-y-6">
        {/* Terms of Service */}
        <Card>
          <Collapsible open={openSections.terms} onOpenChange={() => toggleSection('terms')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-6 w-6 text-primary" />
                    <div className="text-left">
                      <CardTitle>Terms of Service</CardTitle>
                      <CardDescription>Rules and guidelines for using our platform</CardDescription>
                    </div>
                  </div>
                  {openSections.terms ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="prose prose-slate dark:prose-invert max-w-none">
                <section className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h3>
                    <p>By accessing and using The Queer Guide ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.</p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">2. Description of Service</h3>
                    <p>The Queer Guide is a community platform that provides information about LGBTQ+ friendly venues, events, marketplace listings, and community discussions. We aim to create a safe and inclusive space for the LGBTQ+ community and allies.</p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">3. User Responsibilities</h3>
                    <p>Users are responsible for:</p>
                    <ul className="list-disc pl-6">
                      <li>Providing accurate and up-to-date information</li>
                      <li>Maintaining the confidentiality of their account credentials</li>
                      <li>Complying with all applicable laws and regulations</li>
                      <li>Respecting the rights and dignity of other users</li>
                      <li>Not posting discriminatory, hateful, or harmful content</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">4. Content Guidelines</h3>
                    <p>All content posted on The Queer Guide must:</p>
                    <ul className="list-disc pl-6">
                      <li>Be respectful and inclusive</li>
                      <li>Not contain hate speech, discrimination, or harassment</li>
                      <li>Not violate any intellectual property rights</li>
                      <li>Be relevant to the LGBTQ+ community or allies</li>
                      <li>Not contain spam or commercial solicitation outside designated areas</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">5. Account Termination</h3>
                    <p>We reserve the right to terminate or suspend accounts at our sole discretion, without prior notice, for conduct that we believe violates these Terms of Service or is harmful to other users of the Service.</p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">6. Disclaimer & Limitation of Liability</h3>
                    <p>The Service is provided "as is" without any warranties. In no event shall The Queer Guide be liable for any indirect, incidental, special, or consequential damages resulting from the use or inability to use the Service.</p>
                  </div>
                </section>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Privacy Policy */}
        <Card>
          <Collapsible open={openSections.privacy} onOpenChange={() => toggleSection('privacy')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className="h-6 w-6 text-primary" />
                    <div className="text-left">
                      <CardTitle>Privacy Policy</CardTitle>
                      <CardDescription>How we collect, use, and protect your data</CardDescription>
                    </div>
                  </div>
                  {openSections.privacy ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="prose prose-slate dark:prose-invert max-w-none">
                <section className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-3">Information We Collect</h3>
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium">Personal Information</h4>
                        <ul className="list-disc pl-6">
                          <li>Email address</li>
                          <li>Display name</li>
                          <li>Profile information (bio, location, social links)</li>
                          <li>Phone number (optional)</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-medium">Usage Information</h4>
                        <ul className="list-disc pl-6">
                          <li>IP address and browser information</li>
                          <li>Pages visited and time spent</li>
                          <li>Referral sources</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">How We Use Your Information</h3>
                    <ul className="list-disc pl-6">
                      <li>Providing and maintaining our service</li>
                      <li>Creating and managing user accounts</li>
                      <li>Personalizing user experience</li>
                      <li>Communicating important updates</li>
                      <li>Ensuring platform safety and security</li>
                      <li>Complying with legal obligations</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">Your Privacy Rights</h3>
                    <ul className="list-disc pl-6">
                      <li>Access to your personal information</li>
                      <li>Correction of inaccurate information</li>
                      <li>Deletion of your personal information</li>
                      <li>Data portability</li>
                      <li>Objection to processing</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">Data Security</h3>
                    <p>We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.</p>
                  </div>
                </section>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Cookie Policy */}
        <Card>
          <Collapsible open={openSections.cookies} onOpenChange={() => toggleSection('cookies')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Cookie className="h-6 w-6 text-primary" />
                    <div className="text-left">
                      <CardTitle>Cookie Policy</CardTitle>
                      <CardDescription>How we use cookies and tracking technologies</CardDescription>
                    </div>
                  </div>
                  {openSections.cookies ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="prose prose-slate dark:prose-invert max-w-none">
                <section className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-3">What Are Cookies</h3>
                    <p>Cookies are small text files stored on your device when you visit our website. They help us provide you with a better experience by remembering your preferences and analyzing usage.</p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">Types of Cookies We Use</h3>
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-medium">Essential Cookies</h4>
                        <p>Required for the website to function properly, including session management, security, and authentication.</p>
                      </div>
                      <div>
                        <h4 className="font-medium">Functional Cookies</h4>
                        <p>Enable enhanced functionality like language preferences and theme settings.</p>
                      </div>
                      <div>
                        <h4 className="font-medium">Analytics Cookies</h4>
                        <p>Help us understand how visitors interact with our website to improve performance.</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">Managing Cookies</h3>
                    <p>You can control cookies through your browser settings:</p>
                    <ul className="list-disc pl-6">
                      <li><strong>Chrome:</strong> Settings → Privacy and security → Cookies</li>
                      <li><strong>Firefox:</strong> Settings → Privacy & Security → Cookies</li>
                      <li><strong>Safari:</strong> Preferences → Privacy → Cookies</li>
                      <li><strong>Edge:</strong> Settings → Cookies and site permissions</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">Impact of Disabling Cookies</h3>
                    <p>Disabling cookies may affect your experience - you may need to log in repeatedly and some features may not work properly.</p>
                  </div>
                </section>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* DMCA Policy */}
        <Card>
          <Collapsible open={openSections.dmca} onOpenChange={() => toggleSection('dmca')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Copyright className="h-6 w-6 text-primary" />
                    <div className="text-left">
                      <CardTitle>DMCA Copyright Policy</CardTitle>
                      <CardDescription>Copyright infringement reporting and procedures</CardDescription>
                    </div>
                  </div>
                  {openSections.dmca ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="prose prose-slate dark:prose-invert max-w-none">
                <section className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-3">Overview</h3>
                    <p>The Queer Guide respects intellectual property rights and responds to clear notices of alleged copyright infringement that comply with the Digital Millennium Copyright Act (DMCA).</p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">Filing a DMCA Notice</h3>
                    <p>Your notice must include:</p>
                    <ul className="list-disc pl-6">
                      <li>Physical or electronic signature of the copyright owner</li>
                      <li>Identification of the copyrighted work</li>
                      <li>Identification of the infringing material and its location</li>
                      <li>Your contact information</li>
                      <li>Good faith belief statement</li>
                      <li>Accuracy statement under penalty of perjury</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">Where to Send DMCA Notices</h3>
                    <div className="bg-muted p-4 rounded-lg">
                      <p><strong>DMCA Agent</strong><br />
                      The Queer Guide<br />
                      Email: dmca@queer.guide<br />
                      Subject: DMCA Takedown Notice</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">Counter-Notification</h3>
                    <p>If you believe your content was removed in error, you may submit a counter-notification with your signature, identification of removed material, good faith belief statement, and consent to jurisdiction.</p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold mb-3">Repeat Infringer Policy</h3>
                    <p>We will disable accounts of repeat infringers and respond to valid notices within 72 hours.</p>
                  </div>
                </section>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      </div>

      {/* Contact Section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-center">Need Help?</CardTitle>
          <CardDescription className="text-center">
            Contact us for any legal questions or concerns
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h4 className="font-medium mb-2">General Legal</h4>
                <p className="text-sm text-muted-foreground">legal@queer.guide</p>
              </div>
              <div>
                <h4 className="font-medium mb-2">Privacy Concerns</h4>
                <p className="text-sm text-muted-foreground">privacy@queer.guide</p>
              </div>
              <div>
                <h4 className="font-medium mb-2">DMCA Reports</h4>
                <p className="text-sm text-muted-foreground">dmca@queer.guide</p>
              </div>
            </div>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/contact')}>
            Contact Support
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}