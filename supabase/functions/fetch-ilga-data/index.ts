import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { countryCode, countryName } = await req.json();
    
    if (!countryCode && !countryName) {
      return new Response(
        JSON.stringify({ error: 'Country code or country name required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching ILGA data for:', { countryCode, countryName });

    // Try to find by country code first, then by name
    let jurisdictionData = null;
    
    if (countryCode) {
      jurisdictionData = LGBT_JURISDICTIONS[countryCode.toUpperCase()];
    }
    
    if (!jurisdictionData && countryName) {
      // Search by country name
      jurisdictionData = Object.values(LGBT_JURISDICTIONS).find(
        j => j.country.toLowerCase() === countryName.toLowerCase()
      );
    }

    if (!jurisdictionData) {
      // Return default/unknown status
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
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});