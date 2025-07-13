export default function CookiePolicy() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Cookie Policy</h1>
      <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
        <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
        
        <section>
          <h2 className="text-2xl font-semibold mb-4">1. What Are Cookies</h2>
          <p>Cookies are small text files that are stored on your device when you visit our website. They help us provide you with a better experience by remembering your preferences and analyzing how you use our service.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">2. How We Use Cookies</h2>
          <p>We use cookies for several purposes:</p>
          <ul className="list-disc pl-6">
            <li><strong>Essential Cookies:</strong> Required for the website to function properly</li>
            <li><strong>Authentication Cookies:</strong> To keep you logged in</li>
            <li><strong>Preference Cookies:</strong> To remember your settings and preferences</li>
            <li><strong>Analytics Cookies:</strong> To understand how visitors use our website</li>
            <li><strong>Performance Cookies:</strong> To improve website speed and functionality</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">3. Types of Cookies We Use</h2>
          
          <h3 className="text-xl font-medium mb-2">Essential Cookies</h3>
          <p>These cookies are necessary for the website to function and cannot be switched off. They include:</p>
          <ul className="list-disc pl-6">
            <li>Session management cookies</li>
            <li>Security cookies</li>
            <li>Authentication tokens</li>
          </ul>

          <h3 className="text-xl font-medium mb-2 mt-4">Functional Cookies</h3>
          <p>These cookies enable enhanced functionality and personalization:</p>
          <ul className="list-disc pl-6">
            <li>Language preferences</li>
            <li>Theme settings (dark/light mode)</li>
            <li>User interface preferences</li>
          </ul>

          <h3 className="text-xl font-medium mb-2 mt-4">Analytics Cookies</h3>
          <p>We use analytics cookies to understand how visitors interact with our website:</p>
          <ul className="list-disc pl-6">
            <li>Page views and navigation patterns</li>
            <li>Time spent on pages</li>
            <li>Popular content and features</li>
            <li>Error tracking and performance metrics</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">4. Third-Party Cookies</h2>
          <p>Some cookies are set by third-party services we use:</p>
          <ul className="list-disc pl-6">
            <li><strong>Supabase:</strong> For authentication and database services</li>
            <li><strong>Analytics providers:</strong> To measure website performance</li>
            <li><strong>Content delivery networks:</strong> To improve loading speeds</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">5. Cookie Duration</h2>
          <p>Cookies may be:</p>
          <ul className="list-disc pl-6">
            <li><strong>Session cookies:</strong> Deleted when you close your browser</li>
            <li><strong>Persistent cookies:</strong> Remain on your device for a set period or until manually deleted</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">6. Managing Cookies</h2>
          
          <h3 className="text-xl font-medium mb-2">Browser Settings</h3>
          <p>You can control cookies through your browser settings:</p>
          <ul className="list-disc pl-6">
            <li>Block all cookies</li>
            <li>Block third-party cookies only</li>
            <li>Delete existing cookies</li>
            <li>Receive notifications when cookies are set</li>
          </ul>

          <h3 className="text-xl font-medium mb-2 mt-4">Browser-Specific Instructions</h3>
          <ul className="list-disc pl-6">
            <li><strong>Chrome:</strong> Settings → Privacy and security → Cookies and other site data</li>
            <li><strong>Firefox:</strong> Settings → Privacy & Security → Cookies and Site Data</li>
            <li><strong>Safari:</strong> Preferences → Privacy → Cookies and website data</li>
            <li><strong>Edge:</strong> Settings → Cookies and site permissions → Cookies and site data</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">7. Impact of Disabling Cookies</h2>
          <p>Disabling cookies may affect your experience:</p>
          <ul className="list-disc pl-6">
            <li>You may need to log in repeatedly</li>
            <li>Personal preferences may not be saved</li>
            <li>Some features may not work properly</li>
            <li>Content may not be personalized</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">8. Local Storage</h2>
          <p>In addition to cookies, we may use local storage technologies to:</p>
          <ul className="list-disc pl-6">
            <li>Store user preferences</li>
            <li>Cache data for better performance</li>
            <li>Maintain session state</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">9. Updates to Cookie Policy</h2>
          <p>We may update this Cookie Policy to reflect changes in our practices or for other operational, legal, or regulatory reasons. Please review this policy periodically.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">10. Contact Us</h2>
          <p>If you have questions about our use of cookies, please contact us at privacy@thequeerguide.com or through our Contact page.</p>
        </section>
      </div>
    </div>
  );
}