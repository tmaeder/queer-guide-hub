/**
 * Security validation component to test CSP effectiveness
 * This will help identify if the strict CSP is working correctly
 */

import { useEffect, useState } from 'react';

interface SecurityTest {
  name: string;
  test: () => boolean;
  expected: boolean;
  description: string;
}

export function SecurityValidation() {
  const [testResults, setTestResults] = useState<Array<{
    test: SecurityTest;
    result: boolean;
    passed: boolean;
  }>>([]);

  useEffect(() => {
    // Only run in development mode
    if (!import.meta.env.DEV) return;

    const securityTests: SecurityTest[] = [
      {
        name: 'CSP Blocks Inline Scripts',
        test: () => {
          try {
            // This should be blocked by CSP
            eval('console.log("eval test")');
            return true; // If this runs, CSP is not blocking eval
          } catch {
            return false; // If this throws, CSP is working
          }
        },
        expected: false,
        description: 'CSP should block eval() function'
      },
      {
        name: 'Secure Context',
        test: () => window.isSecureContext,
        expected: true,
        description: 'Application should run in secure context'
      },
      {
        name: 'CSP Header Present',
        test: () => {
          const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
          return !!cspMeta && cspMeta.getAttribute('content')?.includes("default-src 'none'");
        },
        expected: true,
        description: 'CSP meta tag should be present with strict default-src'
      },
      {
        name: 'No Unsafe Inline in Script-Src',
        test: () => {
          const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
          const content = cspMeta?.getAttribute('content') || '';
          return !content.includes("'unsafe-inline'") || content.includes('script-src') && !content.match(/script-src[^;]*'unsafe-inline'/);
        },
        expected: true,
        description: 'CSP should not allow unsafe-inline in script-src for production'
      }
    ];

    const results = securityTests.map(test => {
      const result = test.test();
      return {
        test,
        result,
        passed: result === test.expected
      };
    });

    setTestResults(results);

    // Log results to console
    console.group('🔒 Security Validation Results');
    results.forEach(({ test, result, passed }) => {
      const status = passed ? '✅' : '❌';
      console.log(`${status} ${test.name}: ${passed ? 'PASS' : 'FAIL'} (result: ${result}, expected: ${test.expected})`);
      console.log(`   ${test.description}`);
    });
    console.groupEnd();
  }, []);

  // Only render in development mode
  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-background border rounded-lg p-4 shadow-lg max-w-sm">
      <h3 className="font-semibold text-sm mb-2">🔒 Security Status</h3>
      <div className="space-y-1 text-xs">
        {testResults.map(({ test, passed }, index) => (
          <div key={index} className={`flex items-center gap-2 ${passed ? 'text-green-600' : 'text-red-600'}`}>
            <span>{passed ? '✅' : '❌'}</span>
            <span className="truncate">{test.name}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Development mode only
      </p>
    </div>
  );
}