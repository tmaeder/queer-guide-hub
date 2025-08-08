import { CookieSettingsButton } from '@/components/privacy/CookieSettingsButton';

export default function PrivacyPolicy() {
  return (
    <div className="w-full p-6">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
        <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
        
        <section>
          <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
          <p>The Queer Guide ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our service.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
          
          <h3 className="text-xl font-medium mb-2">Personal Information</h3>
          <p>We may collect the following personal information:</p>
          <ul className="list-disc pl-6">
            <li>Email address</li>
            <li>Display name</li>
            <li>Profile information (bio, location, social links)</li>
            <li>Phone number (optional)</li>
            <li>Date of birth (optional)</li>
          </ul>

          <h3 className="text-xl font-medium mb-2 mt-4">Usage Information</h3>
          <p>We automatically collect certain information about your device and how you interact with our service:</p>
          <ul className="list-disc pl-6">
            <li>IP address</li>
            <li>Browser type and version</li>
            <li>Operating system</li>
            <li>Pages visited and time spent</li>
            <li>Referral sources</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
          <p>We use collected information for:</p>
          <ul className="list-disc pl-6">
            <li>Providing and maintaining our service</li>
            <li>Creating and managing user accounts</li>
            <li>Personalizing user experience</li>
            <li>Communicating with users about updates and important information</li>
            <li>Improving our service and developing new features</li>
            <li>Ensuring platform safety and security</li>
            <li>Complying with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">4. Information Sharing and Disclosure</h2>
          
          <h3 className="text-xl font-medium mb-2">Public Information</h3>
          <p>Some information you provide may be publicly visible:</p>
          <ul className="list-disc pl-6">
            <li>Display name and profile picture</li>
            <li>Bio and location (if you choose to share)</li>
            <li>Posts and comments you make</li>
            <li>Venue and event listings you create</li>
          </ul>

          <h3 className="text-xl font-medium mb-2 mt-4">Private Information</h3>
          <p>We do not sell, trade, or rent your personal information to third parties. We may share information in these circumstances:</p>
          <ul className="list-disc pl-6">
            <li>With your consent</li>
            <li>To comply with legal obligations</li>
            <li>To protect our rights and safety</li>
            <li>In connection with a business transfer</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">5. Data Security</h2>
          <p>We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the internet is 100% secure.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">6. Data Retention</h2>
          <p>We retain your personal information only as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required by law.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">7. Your Privacy Rights</h2>
          <p>Depending on your location, you may have the following rights:</p>
          <ul className="list-disc pl-6">
            <li>Access to your personal information</li>
            <li>Correction of inaccurate information</li>
            <li>Deletion of your personal information</li>
            <li>Restriction of processing</li>
            <li>Data portability</li>
            <li>Objection to processing</li>
          </ul>
          <p className="mt-2">To exercise these rights, please contact us through our Contact page.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">8. Cookies and Tracking</h2>
          <p>We use cookies and similar tracking technologies to enhance your experience. You can control cookies through your browser settings. For more information, see our Cookie Policy.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">9. Third-Party Services</h2>
          <p>Our service may contain links to third-party websites or integrate with third-party services. We are not responsible for the privacy practices of these third parties.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">10. Children's Privacy</h2>
          <p>Our service is not intended for children under 13. We do not knowingly collect personal information from children under 13. If you become aware that a child has provided us with personal information, please contact us.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">11. International Users</h2>
          <p>If you are accessing our service from outside the United States, please note that your information may be transferred to and stored in the United States, where our servers are located.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">12. Changes to Privacy Policy</h2>
          <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">13. Cookie Management</h2>
          <p>You can manage your cookie preferences at any time using the button below:</p>
          <div className="mt-4">
            <CookieSettingsButton />
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">14. Contact Us</h2>
          <p>If you have any questions about this Privacy Policy, please contact us at privacy@queer.guide or through our Contact page.</p>
        </section>
      </div>
    </div>
  );
}