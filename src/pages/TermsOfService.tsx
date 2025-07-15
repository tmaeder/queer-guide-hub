export default function TermsOfService() {
  return (
    <div className="w-full p-6">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
      <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
        <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
        
        <section>
          <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
          <p>By accessing and using The Queer Guide ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
          <p>The Queer Guide is a community platform that provides information about LGBTQ+ friendly venues, events, marketplace listings, and community discussions. We aim to create a safe and inclusive space for the LGBTQ+ community and allies.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">3. User Responsibilities</h2>
          <p>Users are responsible for:</p>
          <ul className="list-disc pl-6">
            <li>Providing accurate and up-to-date information</li>
            <li>Maintaining the confidentiality of their account credentials</li>
            <li>Complying with all applicable laws and regulations</li>
            <li>Respecting the rights and dignity of other users</li>
            <li>Not posting discriminatory, hateful, or harmful content</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">4. Content Guidelines</h2>
          <p>All content posted on The Queer Guide must:</p>
          <ul className="list-disc pl-6">
            <li>Be respectful and inclusive</li>
            <li>Not contain hate speech, discrimination, or harassment</li>
            <li>Not violate any intellectual property rights</li>
            <li>Be relevant to the LGBTQ+ community or allies</li>
            <li>Not contain spam or commercial solicitation outside designated areas</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">5. Privacy and Data Protection</h2>
          <p>We are committed to protecting your privacy. Please review our Privacy Policy to understand how we collect, use, and protect your information.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">6. Intellectual Property</h2>
          <p>The Service and its original content, features, and functionality are owned by The Queer Guide and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">7. Prohibited Activities</h2>
          <p>Users may not:</p>
          <ul className="list-disc pl-6">
            <li>Use the service for any unlawful purpose</li>
            <li>Attempt to gain unauthorized access to other accounts</li>
            <li>Upload malicious software or code</li>
            <li>Impersonate others or provide false information</li>
            <li>Engage in harassment or bullying</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">8. Account Termination</h2>
          <p>We reserve the right to terminate or suspend accounts at our sole discretion, without prior notice, for conduct that we believe violates these Terms of Service or is harmful to other users of the Service.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">9. Disclaimer of Warranties</h2>
          <p>The Service is provided "as is" without any warranties, expressed or implied. We do not warrant that the Service will be uninterrupted or error-free.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">10. Limitation of Liability</h2>
          <p>In no event shall The Queer Guide be liable for any indirect, incidental, special, or consequential damages resulting from the use or inability to use the Service.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">11. Changes to Terms</h2>
          <p>We reserve the right to modify these terms at any time. Users will be notified of significant changes, and continued use of the Service constitutes acceptance of the modified terms.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">12. Contact Information</h2>
          <p>If you have any questions about these Terms of Service, please contact us through our Contact page or email us at legal@thequeerguide.com</p>
        </section>
      </div>
    </div>
  );
}