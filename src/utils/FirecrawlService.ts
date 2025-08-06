interface ErrorResponse {
  success: false;
  error: string;
}

interface CrawlStatusResponse {
  success: true;
  status: string;
  completed: number;
  total: number;
  creditsUsed: number;
  expiresAt: string;
  data: any[];
}

type CrawlResponse = CrawlStatusResponse | ErrorResponse;

export class FirecrawlService {
  // Default local Firecrawl endpoint
  private static LOCAL_ENDPOINT = 'http://localhost:3002';
  
  static getLocalEndpoint(): string {
    return this.LOCAL_ENDPOINT;
  }

  static setLocalEndpoint(endpoint: string): void {
    this.LOCAL_ENDPOINT = endpoint;
  }

  static async testConnection(endpoint?: string): Promise<boolean> {
    try {
      const testEndpoint = endpoint || this.LOCAL_ENDPOINT;
      console.log('Testing connection to local Firecrawl at:', testEndpoint);
      
      const response = await fetch(`${testEndpoint}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      return response.ok;
    } catch (error) {
      console.error('Error testing local Firecrawl connection:', error);
      return false;
    }
  }

  static async crawlWebsite(url: string, options?: {
    limit?: number;
    endpoint?: string;
  }): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      const crawlEndpoint = options?.endpoint || this.LOCAL_ENDPOINT;
      const limit = options?.limit || 100;
      
      console.log('Making crawl request to local Firecrawl at:', crawlEndpoint);
      
      const response = await fetch(`${crawlEndpoint}/v0/crawl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          limit,
          scrapeOptions: {
            formats: ['markdown', 'html'],
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Crawl request failed:', response.status, errorText);
        return { 
          success: false, 
          error: `Failed to crawl website: ${response.status} ${errorText}` 
        };
      }

      const crawlResponse = await response.json() as CrawlResponse;

      if (!crawlResponse.success) {
        console.error('Crawl failed:', (crawlResponse as ErrorResponse).error);
        return { 
          success: false, 
          error: (crawlResponse as ErrorResponse).error || 'Failed to crawl website' 
        };
      }

      console.log('Crawl successful:', crawlResponse);
      return { 
        success: true,
        data: crawlResponse 
      };
    } catch (error) {
      console.error('Error during crawl:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to connect to local Firecrawl instance' 
      };
    }
  }
}