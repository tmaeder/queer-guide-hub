// DEPRECATED: Use source-ilga adapter via pipeline-executor instead.
// This function is a duplicate of import-ilga-data and has been stubbed.

Deno.serve((_req) => {
  return new Response(JSON.stringify({
    error: 'Gone',
    message: 'fetch-ilga-data is deprecated. Use source-ilga via the pipeline engine instead.',
    replacement: 'POST /functions/v1/source-ilga',
  }), { status: 410, headers: { 'Content-Type': 'application/json' } })
})

// Original code below is preserved for reference but unreachable.
// ------------------------------------------------------------------

import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts';

interface LGBTJurisdiction {
  country: string;
  countryCode: string;
  criminalisation: {
    status: string;
    description: string;
    penalty: string;
    enforcement: string;
  };
  sameSeMarriage: {
    status: string;
    description: string;
    date?: string;
  };
  antidiscrimination: {
    status: string;
    description: string;
    scope: string[];
  };
  constitutionalProtection: boolean;
  hateClimeLaws: boolean;
  lastUpdated: string;
  sources: string[];
}

// Helper function to get country name in URL format
function getCountrySlug(countryName: string): string {
  return countryName.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Function to scrape ILGA data from their website
async function scrapeILGAData(countryName: string): Promise<LGBTJurisdiction | null> {
  try {
    const countrySlug = getCountrySlug(countryName);
    const url = `https://database.ilga.org/${countrySlug}-lgbti`;
    
    console.log(`Fetching ILGA data from: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`Failed to fetch ILGA page for ${countryName}: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    
    // Parse the HTML to extract jurisdiction data
    const jurisdiction: LGBTJurisdiction = {
      country: countryName,
      countryCode: '', // Will need to be mapped separately
      criminalisation: {
        status: extractCriminalisationStatus(html),
        description: extractCriminalisationDescription(html),
        penalty: extractPenalty(html),
        enforcement: extractEnforcement(html)
      },
      sameSeMarriage: {
        status: extractSameSexMarriageStatus(html),
        description: extractSameSexMarriageDescription(html),
        date: extractSameSexMarriageDate(html)
      },
      antidiscrimination: {
        status: extractAntidiscriminationStatus(html),
        description: extractAntidiscriminationDescription(html),
        scope: extractAntidiscriminationScope(html)
      },
      constitutionalProtection: extractConstitutionalProtection(html),
      hateClimeLaws: extractHateCrimeLaws(html),
      lastUpdated: new Date().toISOString().split('T')[0],
      sources: [`ILGA World Database - ${url}`]
    };
    
    return jurisdiction;
  } catch (error) {
    console.error(`Error scraping ILGA data for ${countryName}:`, error);
    return null;
  }
}

// Helper functions to extract data from HTML
function extractCriminalisationStatus(html: string): string {
  // Look for criminalisation status indicators
  if (html.includes('Legal') || html.includes('Not criminalised')) {
    return 'Legal';
  } else if (html.includes('Criminalised') || html.includes('Illegal')) {
    return 'Criminalised';
  }
  return 'Unknown';
}

function extractCriminalisationDescription(html: string): string {
  // Extract description from the criminalisation section
  const match = html.match(/Criminalisation[^<]*<[^>]*>([^<]+)/i);
  return match ? match[1].trim() : 'No data available';
}

function extractPenalty(html: string): string {
  // Look for penalty information
  if (html.includes('death penalty') || html.includes('Death penalty')) {
    return 'Death penalty';
  } else if (html.includes('imprisonment') || html.includes('prison')) {
    return 'Imprisonment';
  } else if (html.includes('fine')) {
    return 'Fine';
  }
  return 'None';
}

function extractEnforcement(html: string): string {
  if (html.includes('actively enforced')) {
    return 'Actively enforced';
  } else if (html.includes('not enforced')) {
    return 'Not enforced';
  }
  return 'Unknown';
}

function extractSameSexMarriageStatus(html: string): string {
  if (html.includes('same-sex marriage') && (html.includes('legal') || html.includes('Legal'))) {
    return 'Legal';
  } else if (html.includes('civil union') || html.includes('civil partnership')) {
    return 'Civil unions';
  } else if (html.includes('prohibited') || html.includes('banned')) {
    return 'Prohibited';
  }
  return 'Not recognized';
}

function extractSameSexMarriageDescription(html: string): string {
  const match = html.match(/same-sex marriage[^<]*<[^>]*>([^<]+)/i);
  return match ? match[1].trim() : 'No data available';
}

function extractSameSexMarriageDate(html: string): string | undefined {
  const dateMatch = html.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
  return dateMatch ? dateMatch[1] : undefined;
}

function extractAntidiscriminationStatus(html: string): string {
  if (html.includes('comprehensive') && html.includes('protection')) {
    return 'Protected';
  } else if (html.includes('partial') && html.includes('protection')) {
    return 'Partial';
  } else if (html.includes('no protection')) {
    return 'None';
  }
  return 'Unknown';
}

function extractAntidiscriminationDescription(html: string): string {
  const match = html.match(/discrimination[^<]*<[^>]*>([^<]+)/i);
  return match ? match[1].trim() : 'No data available';
}

function extractAntidiscriminationScope(html: string): string[] {
  const scope: string[] = [];
  if (html.includes('employment')) scope.push('employment');
  if (html.includes('housing')) scope.push('housing');
  if (html.includes('education')) scope.push('education');
  if (html.includes('public services')) scope.push('public services');
  if (html.includes('healthcare')) scope.push('healthcare');
  return scope;
}

function extractConstitutionalProtection(html: string): boolean {
  return html.includes('constitutional protection') || html.includes('Constitution') && html.includes('protect');
}

function extractHateCrimeLaws(html: string): boolean {
  return html.includes('hate crime') || html.includes('hate-crime');
}

// Static LGBT rights data based on ILGA database - this would normally be fetched from their API
// This is a simplified version focusing on major jurisdictions
const LGBT_JURISDICTIONS: Record<string, LGBTJurisdiction> = {
  "NL": {
    country: "Netherlands",
    countryCode: "NL",
    criminalisation: {
      status: "Legal",
      description: "Same-sex sexual activity has been legal since 1811",
      penalty: "None",
      enforcement: "N/A"
    },
    sameSeMarriage: {
      status: "Legal",
      description: "Same-sex marriage legal since 2001",
      date: "2001-04-01"
    },
    antidiscrimination: {
      status: "Protected",
      description: "Comprehensive anti-discrimination laws",
      scope: ["employment", "housing", "public services", "education"]
    },
    constitutionalProtection: true,
    hateClimeLaws: true,
    lastUpdated: "2024-01-01",
    sources: ["ILGA World Database", "Dutch Civil Code"]
  },
  "US": {
    country: "United States",
    countryCode: "US", 
    criminalisation: {
      status: "Legal",
      description: "Same-sex sexual activity legal nationwide since 2003 (Lawrence v. Texas)",
      penalty: "None",
      enforcement: "N/A"
    },
    sameSeMarriage: {
      status: "Legal", 
      description: "Same-sex marriage legal nationwide since 2015 (Obergefell v. Hodges)",
      date: "2015-06-26"
    },
    antidiscrimination: {
      status: "Partial",
      description: "Federal employment protections, varies by state for other areas",
      scope: ["employment"]
    },
    constitutionalProtection: false,
    hateClimeLaws: true,
    lastUpdated: "2024-01-01",
    sources: ["ILGA World Database", "Supreme Court decisions", "State laws"]
  },
  "RU": {
    country: "Russia",
    countryCode: "RU",
    criminalisation: {
      status: "Legal",
      description: "Same-sex sexual activity decriminalized in 1993",
      penalty: "None",
      enforcement: "N/A"
    },
    sameSeMarriage: {
      status: "Prohibited",
      description: "Constitution explicitly bans same-sex marriage",
      date: undefined
    },
    antidiscrimination: {
      status: "None",
      description: "No protections, 'gay propaganda' laws prohibit LGBTI advocacy",
      scope: []
    },
    constitutionalProtection: false,
    hateClimeLaws: false,
    lastUpdated: "2024-01-01",
    sources: ["ILGA World Database", "Russian Constitution", "Federal Laws"]
  },
  "SA": {
    country: "South Africa",
    countryCode: "SA",
    criminalisation: {
      status: "Legal",
      description: "Same-sex sexual activity legal since 1998",
      penalty: "None", 
      enforcement: "N/A"
    },
    sameSeMarriage: {
      status: "Legal",
      description: "Same-sex marriage legal since 2006",
      date: "2006-11-30"
    },
    antidiscrimination: {
      status: "Protected",
      description: "Constitutional protection against discrimination",
      scope: ["employment", "housing", "public services", "education"]
    },
    constitutionalProtection: true,
    hateClimeLaws: true,
    lastUpdated: "2024-01-01",
    sources: ["ILGA World Database", "South African Constitution", "Civil Union Act"]
  },
  "BR": {
    country: "Brazil",
    countryCode: "BR",
    criminalisation: {
      status: "Legal",
      description: "Same-sex sexual activity has been legal since 1830",
      penalty: "None",
      enforcement: "N/A"
    },
    sameSeMarriage: {
      status: "Legal",
      description: "Same-sex marriage legal since 2013",
      date: "2013-05-14"
    },
    antidiscrimination: {
      status: "Protected",
      description: "Supreme Court ruling provides protections",
      scope: ["employment", "public services"]
    },
    constitutionalProtection: false,
    hateClimeLaws: true,
    lastUpdated: "2024-01-01",
    sources: ["ILGA World Database", "Brazilian Supreme Court", "Federal Laws"]
  },
  "NG": {
    country: "Nigeria",
    countryCode: "NG",
    criminalisation: {
      status: "Criminalised",
      description: "Same-sex sexual activity punishable under federal and some state laws",
      penalty: "Up to 14 years imprisonment; death penalty in some northern states",
      enforcement: "Actively enforced"
    },
    sameSeMarriage: {
      status: "Prohibited",
      description: "Same-sex marriage prohibited by law",
      date: undefined
    },
    antidiscrimination: {
      status: "None",
      description: "No protections; criminalization laws actively discriminate",
      scope: []
    },
    constitutionalProtection: false,
    hateClimeLaws: false,
    lastUpdated: "2024-01-01",
    sources: ["ILGA World Database", "Nigerian Criminal Code", "Same Sex Marriage Prohibition Act"]
  },
  "DE": {
    country: "Germany", 
    countryCode: "DE",
    criminalisation: {
      status: "Legal",
      description: "Same-sex sexual activity legal since 1968 (East) / 1969 (West)",
      penalty: "None",
      enforcement: "N/A"
    },
    sameSeMarriage: {
      status: "Legal",
      description: "Same-sex marriage legal since 2017",
      date: "2017-10-01"
    },
    antidiscrimination: {
      status: "Protected",
      description: "Comprehensive anti-discrimination laws",
      scope: ["employment", "housing", "public services", "education"]
    },
    constitutionalProtection: false,
    hateClimeLaws: true,
    lastUpdated: "2024-01-01",
    sources: ["ILGA World Database", "German Civil Code", "Anti-Discrimination Act"]
  },
  "IN": {
    country: "India",
    countryCode: "IN", 
    criminalisation: {
      status: "Legal",
      description: "Same-sex sexual activity decriminalized in 2018 (Navtej Singh Johar v. Union of India)",
      penalty: "None",
      enforcement: "N/A"
    },
    sameSeMarriage: {
      status: "Not recognized",
      description: "Same-sex marriage not legally recognized",
      date: undefined
    },
    antidiscrimination: {
      status: "Limited",
      description: "Some protections through court judgments",
      scope: ["employment"]
    },
    constitutionalProtection: false,
    hateClimeLaws: false,
    lastUpdated: "2024-01-01",
    sources: ["ILGA World Database", "Supreme Court of India", "Section 377 judgment"]
  }
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceClient = getServiceClient();
    const authResult = await requireAdmin(req, serviceClient);
    if (authResult instanceof Response) return authResult;

    const { countryCode, countryName, forceUpdate } = await req.json();
    
    if (!countryCode && !countryName) {
      return new Response(
        JSON.stringify({ error: 'Country code or country name required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching ILGA data for:', { countryCode, countryName, forceUpdate });

    let jurisdictionData = null;

    // If forceUpdate is true, always try to scrape fresh data
    if (forceUpdate || !countryCode) {
      const nameToUse = countryName || countryCode;
      jurisdictionData = await scrapeILGAData(nameToUse);
      
      if (jurisdictionData && countryCode) {
        jurisdictionData.countryCode = countryCode.toUpperCase();
      }
    }

    // Fallback to static data if scraping failed
    if (!jurisdictionData) {
      if (countryCode) {
        jurisdictionData = LGBT_JURISDICTIONS[countryCode.toUpperCase()];
      }
      
      if (!jurisdictionData && countryName) {
        // Search by country name in static data
        jurisdictionData = Object.values(LGBT_JURISDICTIONS).find(
          j => j.country.toLowerCase() === countryName.toLowerCase()
        );
      }
    }

    // Final fallback to unknown status
    if (!jurisdictionData) {
      jurisdictionData = {
        country: countryName || countryCode,
        countryCode: countryCode || "UNKNOWN",
        criminalisation: {
          status: "Unknown",
          description: "No data available",
          penalty: "Unknown",
          enforcement: "Unknown"
        },
        sameSeMarriage: {
          status: "Unknown",
          description: "No data available"
        },
        antidiscrimination: {
          status: "Unknown", 
          description: "No data available",
          scope: []
        },
        constitutionalProtection: false,
        hateClimeLaws: false,
        lastUpdated: new Date().toISOString().split('T')[0],
        sources: ["ILGA World Database - Data not available"]
      };
    }

    console.log('Returning ILGA data:', jurisdictionData);

    return new Response(
      JSON.stringify({
        success: true,
        data: jurisdictionData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching ILGA data:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});