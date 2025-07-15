export default function DMCA() {
  return (
    <div className="w-full p-6">
      <h1 className="text-3xl font-bold mb-6">DMCA Copyright Policy</h1>
      <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
        <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
        
        <section>
          <h2 className="text-2xl font-semibold mb-4">1. Overview</h2>
          <p>The Queer Guide respects the intellectual property rights of others and expects our users to do the same. It is our policy to respond to clear notices of alleged copyright infringement that comply with the Digital Millennium Copyright Act (DMCA).</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">2. Filing a DMCA Notice</h2>
          <p>If you believe that content on The Queer Guide infringes your copyright, you may submit a DMCA takedown notice. Your notice must include:</p>
          
          <ul className="list-disc pl-6">
            <li>A physical or electronic signature of the copyright owner or authorized agent</li>
            <li>Identification of the copyrighted work claimed to have been infringed</li>
            <li>Identification of the material that is claimed to be infringing, including location information</li>
            <li>Your contact information (name, address, telephone number, and email address)</li>
            <li>A statement that you have a good faith belief that use of the material is not authorized</li>
            <li>A statement that the information in the notification is accurate, and under penalty of perjury, that you are authorized to act on behalf of the copyright owner</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">3. Where to Send DMCA Notices</h2>
          <p>DMCA notices should be sent to our designated agent:</p>
          
          <div className="bg-muted p-4 rounded-lg">
            <p><strong>DMCA Agent</strong><br />
            The Queer Guide<br />
            Email: dmca@thequeerguide.com<br />
            Subject Line: DMCA Takedown Notice</p>
          </div>

          <p className="mt-4">For fastest processing, please send notices via email. Include "DMCA Takedown Notice" in the subject line.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">4. Counter-Notification Process</h2>
          <p>If you believe your content was removed in error, you may submit a counter-notification. Your counter-notice must include:</p>
          
          <ul className="list-disc pl-6">
            <li>Your physical or electronic signature</li>
            <li>Identification of the material that was removed and its location before removal</li>
            <li>A statement under penalty of perjury that you have a good faith belief the material was removed by mistake or misidentification</li>
            <li>Your name, address, telephone number, and a statement consenting to the jurisdiction of federal court</li>
            <li>A statement that you will accept service of process from the complainant</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">5. Repeat Infringer Policy</h2>
          <p>The Queer Guide will, in appropriate circumstances, disable and/or terminate the accounts of users who are repeat infringers. We reserve the right to determine what constitutes a repeat infringer.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">6. Response Time</h2>
          <p>We will review and respond to valid DMCA notices within 72 hours of receipt. If immediate action is required due to the nature of the infringement, we may act more quickly.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">7. False Claims</h2>
          <p>Please note that making false claims in a DMCA notice may result in liability for damages, including attorney fees. We reserve the right to seek damages from any party that submits a false or bad faith DMCA notice.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">8. User Responsibilities</h2>
          <p>Users of The Queer Guide are responsible for ensuring they have the right to post any content they upload. This includes:</p>
          
          <ul className="list-disc pl-6">
            <li>Images, photos, and graphics</li>
            <li>Text content and written materials</li>
            <li>Videos and audio content</li>
            <li>Logos and branding materials</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">9. Fair Use Considerations</h2>
          <p>We recognize that some uses of copyrighted material may qualify as fair use under copyright law. However, fair use is determined on a case-by-case basis, and we encourage users to:</p>
          
          <ul className="list-disc pl-6">
            <li>Use only as much of the original work as necessary</li>
            <li>Credit the original creator when possible</li>
            <li>Consider the purpose and character of the use</li>
            <li>Respect the rights of copyright holders</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">10. Safe Harbor</h2>
          <p>The Queer Guide qualifies for safe harbor protection under the DMCA as a service provider. We do not review all content before it is posted and rely on our community and copyright holders to identify infringing material.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">11. International Considerations</h2>
          <p>While this policy is based on US copyright law (DMCA), we respect intellectual property rights globally and will respond to valid notices under other copyright frameworks when appropriate.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">12. Contact for Questions</h2>
          <p>If you have questions about this DMCA policy or need clarification about copyright issues on our platform, please contact us at legal@thequeerguide.com</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">13. Policy Updates</h2>
          <p>This DMCA policy may be updated from time to time. We will notify users of significant changes through our platform or via email to registered users.</p>
        </section>
      </div>
    </div>
  );
}